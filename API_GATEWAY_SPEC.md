# Spécifications API Gateway - Renouvellement Annonces

## Endpoints à créer dans AWS API Gateway

### 1. GET /s3/image-batches

**Description** : Récupère la liste de tous les lots d'images disponibles dans S3.

**Lambda Handler** : `listImageBatches`

**Logique Lambda** :
```python
import boto3
from datetime import datetime
import json

def handler(event, context):
    s3 = boto3.client('s3')
    bucket_name = 'votre-bucket-annonces'
    
    # Lister tous les préfixes (dossiers) dans le bucket
    response = s3.list_objects_v2(
        Bucket=bucket_name,
        Delimiter='/'
    )
    
    batches = []
    if 'CommonPrefixes' in response:
        for prefix_info in response['CommonPrefixes']:
            prefix = prefix_info['Prefix']
            
            # Compter les objets dans ce préfixe
            objects_response = s3.list_objects_v2(
                Bucket=bucket_name,
                Prefix=prefix
            )
            
            count = objects_response.get('KeyCount', 0)
            
            # Récupérer la dernière modification
            last_modified = None
            if 'Contents' in objects_response and objects_response['Contents']:
                last_modified = max(obj['LastModified'] for obj in objects_response['Contents']).isoformat()
            
            batches.append({
                'batchId': prefix.rstrip('/').replace('/', '-'),
                'prefix': prefix,
                'count': count,
                'lastModified': last_modified
            })
    
    return {
        'statusCode': 200,
        'headers': {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
        },
        'body': json.dumps(batches)
    }
```

---

### 2. GET /s3/download-batch/{batchId}

**Description** : Télécharge un lot d'images sous forme de fichier ZIP.

**Lambda Handler** : `downloadImageBatch`

**Logique Lambda** :
```python
import boto3
import io
import zipfile
from datetime import datetime
import json

def handler(event, context):
    s3 = boto3.client('s3')
    bucket_name = 'votre-bucket-annonces'
    batch_id = event['pathParameters']['batchId']
    
    # Convertir batch-id-001 en prefix/002/001
    prefix = batch_id.replace('-', '/') + '/'
    
    # Récupérer tous les objets du préfixe
    response = s3.list_objects_v2(
        Bucket=bucket_name,
        Prefix=prefix
    )
    
    if 'Contents' not in response:
        return {
            'statusCode': 404,
            'body': json.dumps({'error': 'Batch not found'})
        }
    
    # Créer un ZIP en mémoire
    zip_buffer = io.BytesIO()
    with zipfile.ZipFile(zip_buffer, 'w', zipfile.ZIP_DEFLATED) as zip_file:
        for obj in response['Contents']:
            # Télécharger l'objet depuis S3
            s3_obj = s3.get_object(Bucket=bucket_name, Key=obj['Key'])
            content = s3_obj['Body'].read()
            
            # Ajouter au ZIP avec le nom de fichier uniquement
            file_name = obj['Key'].split('/')[-1]
            zip_file.writestr(file_name, content)
    
    zip_buffer.seek(0)
    
    return {
        'statusCode': 200,
        'headers': {
            'Content-Type': 'application/zip',
            'Content-Disposition': f'attachment; filename="{batch_id}.zip"',
            'Access-Control-Allow-Origin': '*'
        },
        'body': zip_buffer.getvalue(),
        'isBase64Encoded': True
    }
```

---

### 3. GET /s3/batch-preview/{batchId}

**Description** : Récupère les URLs signées pour l'aperçu des images d'un lot.

**Lambda Handler** : `getBatchPreview`

**Logique Lambda** :
```python
import boto3
import json

def handler(event, context):
    s3 = boto3.client('s3')
    bucket_name = 'votre-bucket-annonces'
    batch_id = event['pathParameters']['batchId']
    
    # Convertir batch-id-001 en prefix/002/001
    prefix = batch_id.replace('-', '/') + '/'
    
    # Récupérer les objets
    response = s3.list_objects_v2(
        Bucket=bucket_name,
        Prefix=prefix
    )
    
    if 'Contents' not in response:
        return {
            'statusCode': 404,
            'body': json.dumps({'error': 'Batch not found'})
        }
    
    preview_urls = []
    
    # Limiter à 4 images pour l'aperçu
    for obj in response['Contents'][:4]:
        # Générer une URL signée valide pour 1 heure
        url = s3.generate_presigned_url(
            'get_object',
            Params={
                'Bucket': bucket_name,
                'Key': obj['Key']
            },
            ExpiresIn=3600
        )
        preview_urls.append(url)
    
    return {
        'statusCode': 200,
        'headers': {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
        },
        'body': json.dumps(preview_urls)
    }
```

---

## Configuration API Gateway

### Méthode 1 : Via la Console AWS

1. **Aller dans API Gateway** → Créer ou sélectionner votre API
2. **Créer les 3 ressources** :
   - Créer `/s3`
   - Créer `/image-batches` sous `/s3`
   - Créer `/download-batch/{batchId}` sous `/s3`
   - Créer `/batch-preview/{batchId}` sous `/s3`

3. **Pour chaque endpoint** :
   - Méthode : `GET`
   - Type d'intégration : `Lambda Function`
   - Sélectionner la Lambda correspondante
   - Activer CORS si nécessaire

4. **Activer CORS** :
   - Actions → Activer CORS
   - Accepter : `*`
   - Méthodes : GET
   - Headers autorisés : `*`

5. **Déployer l'API** :
   - Actions → Déployer l'API
   - Sélectionner le stage (dev, staging, prod)
   - Note de déploiement : "Ajout endpoints renouvellement annonces"

### Méthode 2 : Via Terraform

```hcl
# API Gateway
resource "aws_api_gateway_rest_api" "main" {
  name = "console-pme-automation-api"
}

# Resource /s3
resource "aws_api_gateway_resource" "s3" {
  rest_api_id = aws_api_gateway_rest_api.main.id
  parent_id   = aws_api_gateway_rest_api.main.root_resource_id
  path_part   = "s3"
}

# Resource /s3/image-batches
resource "aws_api_gateway_resource" "image_batches" {
  rest_api_id = aws_api_gateway_rest_api.main.id
  parent_id   = aws_api_gateway_resource.s3.id
  path_part   = "image-batches"
}

# Resource /s3/download-batch/{batchId}
resource "aws_api_gateway_resource" "batch_id" {
  rest_api_id = aws_api_gateway_rest_api.main.id
  parent_id   = aws_api_gateway_resource.s3.id
  path_part   = "{batchId}"
}

# Resource /s3/download-batch/{batchId}
resource "aws_api_gateway_resource" "download_batch" {
  rest_api_id = aws_api_gateway_rest_api.main.id
  parent_id   = aws_api_gateway_resource.batch_id.id
  path_part   = "download"
}

# GET method pour /s3/image-batches
resource "aws_api_gateway_method" "list_batches" {
  rest_api_id   = aws_api_gateway_rest_api.main.id
  resource_id   = aws_api_gateway_resource.image_batches.id
  http_method   = "GET"
  authorization = "NONE"
}

resource "aws_api_gateway_integration" "list_batches_lambda" {
  rest_api_id = aws_api_gateway_rest_api.main.id
  resource_id = aws_api_gateway_resource.image_batches.id
  http_method = aws_api_gateway_method.list_batches.http_method

  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri                     = aws_lambda_function.list_batches.invoke_arn
}

# Lambda functions
resource "aws_lambda_function" "list_batches" {
  filename      = "list_batches.zip"
  function_name = "listImageBatches"
  role          = aws_iam_role.lambda_role.arn
  handler       = "index.handler"
  runtime       = "python3.11"
}

resource "aws_lambda_function" "download_batch" {
  filename      = "download_batch.zip"
  function_name = "downloadImageBatch"
  role          = aws_iam_role.lambda_role.arn
  handler       = "index.handler"
  runtime       = "python3.11"
  
  # Configuration mémoire plus élevée pour créer des ZIP
  memory_size = 512
  timeout    = 60
}

resource "aws_lambda_function" "batch_preview" {
  filename      = "batch_preview.zip"
  function_name = "getBatchPreview"
  role          = aws_iam_role.lambda_role.arn
  handler       = "index.handler"
  runtime       = "python3.11"
}

# Permissions Lambda
resource "aws_lambda_permission" "list_batches" {
  statement_id  = "AllowExecutionFromAPIGateway"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.list_batches.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_api_gateway_rest_api.main.execution_arn}/*/*"
}

# IAM Role pour les Lambda (avec accès S3)
resource "aws_iam_role" "lambda_role" {
  name = "lambda-s3-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "lambda.amazonaws.com"
        }
      }
    ]
  })
}

resource "aws_iam_role_policy" "lambda_s3_policy" {
  role = aws_iam_role.lambda_role.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "logs:CreateLogGroup",
          "logs:CreateLogStream",
          "logs:PutLogEvents"
        ]
        Resource = "arn:aws:logs:*:*:*"
      },
      {
        Effect = "Allow"
        Action = [
          "s3:GetObject",
          "s3:ListBucket"
        ]
        Resource = [
          "arn:aws:s3:::votre-bucket-annonces",
          "arn:aws:s3:::votre-bucket-annonces/*"
        ]
      }
    ]
  })
}
```

---

## IAM Permissions nécessaires

Les fonctions Lambda ont besoin des permissions suivantes :

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "s3:GetObject",
        "s3:ListBucket"
      ],
      "Resource": [
        "arn:aws:s3:::votre-bucket-annonces",
        "arn:aws:s3:::votre-bucket-annonces/*"
      ]
    },
    {
      "Effect": "Allow",
      "Action": [
        "logs:CreateLogGroup",
        "logs:CreateLogStream",
        "logs:PutLogEvents"
      ],
      "Resource": "arn:aws:logs:*:*:*"
    }
  ]
}
```

---

## Variables d'environnement à définir dans Next.js

Mettre à jour `.env.local` :

```env
NEXT_PUBLIC_API_URL=https://votre-api.execute-api.region.amazonaws.com/stage
```

Et dans les builds Amplify :
- Staging : `${NEXT_PUBLIC_API_URL}/s3/image-batches`
- Production : `${NEXT_PUBLIC_API_URL}/s3/image-batches`

---

## Tests

### Tester avec curl

```bash
# Liste des batches
curl https://votre-api.execute-api.region.amazonaws.com/stage/s3/image-batches

# Aperçu d'un batch
curl https://votre-api.execute-api.region.amazonaws.com/stage/s3/batch-preview/batch-001

# Télécharger un batch (rediriger vers un fichier)
curl https://votre-api.execute-api.region.amazonaws.com/stage/s3/download-batch/batch-001 -o batch.zip
```

---

## Structure S3 recommandée

```
votre-bucket-annonces/
├── 2024/
│   ├── 01/
│   │   ├── image1.jpg
│   │   ├── image2.jpg
│   │   └── ...
│   ├── 02/
│   │   ├── image1.jpg
│   │   └── ...
└── 2023/
    └── ...
```

Cela donnera des batchId comme : `2024-01`, `2024-02`, etc.

---

## Notes importantes

1. **Performance** : Pour des buckets avec beaucoup d'objets, envisager S3 Inventory ou pagination
2. **Sécurité** : Ajouter une authentification (Cognito) sur les endpoints API Gateway
3. **Coûts** : Utiliser des URLs signées avec expiration pour limiter les accès
4. **Limites Lambda** : 
   - Timeout max pour download : 15 min (900s) pour invocation synchrone
   - Mémoire recommandée : 512MB minimum pour créer des ZIP
5. **Taille des ZIP** : Si > 6MB, utiliser S3 presigned URLs au lieu de retourner directement

