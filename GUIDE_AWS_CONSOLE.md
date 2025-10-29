# Guide : Créer l'API Renouvellement Annonces dans AWS Console

Ce guide vous explique comment créer l'API pour la page "Renouvellement Annonces" directement dans la console AWS, sans utiliser Terraform.

---

## 📋 Prérequis

- Un compte AWS avec les permissions nécessaires
- AWS Lambda et API Gateway activés
- Un bucket S3 avec des images organisées par dossiers (ex: `annonces-2024-01/`)
- Node.js installé localement pour créer les fonctions Lambda

---

## Partie 1 : Créer les fonctions Lambda

### Étape 1.1 : Créer la Lambda `listImageBatches`

#### A. Préparer le code

1. **Créer un dossier sur votre machine** :
   ```bash
   mkdir lambda-listImageBatches
   cd lambda-listImageBatches
   ```

2. **Créer un fichier `index.py`** :
   ```python
   import boto3
   import json

   def handler(event, context):
       """
       Liste tous les lots d'images disponibles dans S3
       """
       s3 = boto3.client('s3')
       bucket_name = 'votre-bucket-annonces'  # ⚠️ À MODIFIER : remplacer par votre nom de bucket
       
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

#### B. Créer le fichier ZIP

1. **Depuis le dossier** :
   ```bash
   zip -r lambda-listImageBatches.zip index.py
   ```

#### C. Créer la Lambda dans AWS Console

1. **Aller dans AWS Console** → Services → Lambda
2. **Cliquer sur "Créer une fonction"**
3. **Configurer** :
   - Nom de la fonction : `listImageBatches`
   - Runtime : Python 3.11
   - Architecture : x86_64
   - Permissions : Créer un nouveau rôle avec permissions de base
4. **Cliquer sur "Créer une fonction"**

#### D. Configurer la Lambda

1. **Scroll jusqu'à "Code source"**
2. **Cliquer sur "Charger depuis"** → ".zip file"
3. **Sélectionner** `lambda-listImageBatches.zip`
4. **Cliquer sur "Enregistrer"**

#### E. Configurer les permissions IAM

1. **Dans l'onglet "Configuration"** → Permissions
2. **Cliquer sur le nom du rôle IAM**
3. **Dans la nouvelle fenêtre** → "Ajouter des permissions" → "Joindre des stratégies"
4. **Chercher et attacher** :
   - `AmazonS3ReadOnlyAccess` (ou créez une politique personnalisée)

#### F. Créer une politique personnalisée (si vous préférez)

1. **Aller dans IAM** → Politiques → Créer une politique
2. **Coller le JSON suivant** (⚠️ remplacer `votre-bucket-annonces`) :
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
       }
     ]
   }
   ```
3. **Nommer** : `S3-ReadOnly-Annonces`
4. **Créer la politique**
5. **Revenir au rôle Lambda** et joindre cette politique

---

### Étape 1.2 : Créer la Lambda `getBatchPreview`

#### A. Créer le dossier et le fichier

```bash
mkdir lambda-getBatchPreview
cd lambda-getBatchPreview
```

**Créer `index.py`** :
```python
import boto3
import json

def handler(event, context):
    """
    Récupère les URLs signées pour l'aperçu des images d'un lot
    """
    s3 = boto3.client('s3')
    bucket_name = 'votre-bucket-annonces'  # ⚠️ À MODIFIER
    
    # Récupérer le batchId depuis les pathParameters
    batch_id = event.get('pathParameters', {}).get('batchId', '')
    
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
            'headers': {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            },
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

#### B. Créer le ZIP et la Lambda

```bash
zip -r lambda-getBatchPreview.zip index.py
```

**Répéter les étapes 1.1 C à F** avec :
- Nom : `getBatchPreview`
- Fichier : `lambda-getBatchPreview.zip`

---

### Étape 1.3 : Créer la Lambda `downloadImageBatch`

#### A. Créer le dossier et le fichier

```bash
mkdir lambda-downloadImageBatch
cd lambda-downloadImageBatch
```

**Créer `index.py`** :
```python
import boto3
import io
import zipfile
import json
import base64

def handler(event, context):
    """
    Télécharge un lot d'images sous forme de fichier ZIP
    """
    s3 = boto3.client('s3')
    bucket_name = 'votre-bucket-annonces'  # ⚠️ À MODIFIER
    
    batch_id = event.get('pathParameters', {}).get('batchId', '')
    
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
            try:
                # Télécharger l'objet depuis S3
                s3_obj = s3.get_object(Bucket=bucket_name, Key=obj['Key'])
                content = s3_obj['Body'].read()
                
                # Ajouter au ZIP avec le nom de fichier uniquement
                file_name = obj['Key'].split('/')[-1]
                if file_name:  # Ignorer les objets qui sont des dossiers
                    zip_file.writestr(file_name, content)
            except Exception as e:
                print(f"Erreur lors du traitement de {obj['Key']}: {str(e)}")
                continue
    
    zip_buffer.seek(0)
    
    # Encoder en base64 pour l'API Gateway
    zip_base64 = base64.b64encode(zip_buffer.getvalue()).decode('utf-8')
    
    return {
        'statusCode': 200,
        'headers': {
            'Content-Type': 'application/zip',
            'Content-Disposition': f'attachment; filename="{batch_id}.zip"',
            'Access-Control-Allow-Origin': '*'
        },
        'body': zip_base64,
        'isBase64Encoded': True
    }
```

#### B. Configuration avancée pour cette Lambda

```bash
zip -r lambda-downloadImageBatch.zip index.py
```

**Répéter les étapes 1.1 C à F** avec :
- Nom : `downloadImageBatch`
- Fichier : `lambda-downloadImageBatch.zip`
- **IMPORTANT** : Dans Configuration → Modifications → Modifier le timeout à 60 secondes et la mémoire à 512 MB

---

## Partie 2 : Créer l'API Gateway

### Étape 2.1 : Créer l'API REST

1. **Aller dans AWS Console** → Services → API Gateway
2. **Cliquer sur "Créer une API"**
3. **Sélectionner** : **REST API** → Construire
4. **Configurer** :
   - Type de protocole : REST
   - Créer une API REST
   - Choix de la nouvelle API
   - Paramètres :
     - Nom : `console-pme-automation-api`
     - Description : API pour Console PME Automation
     - Point de terminaison : Régional
5. **Cliquer sur "Créer l'API"**

### Étape 2.2 : Créer la ressource `/s3`

1. **Dans l'arbre de gauche** : Sélectionner l'API racine
2. **Actions** → Créer une ressource
3. **Configurer** :
   - Nom de ressource : `s3`
   - Chemin de ressource : `/s3`
   - Activer CORS : ❌ Non (on l'activera après)
4. **Cliquer sur "Créer une ressource"**

### Étape 2.3 : Créer la ressource `/image-batches`

1. **Sélectionner la ressource `/s3`** dans l'arbre
2. **Actions** → Créer une ressource
3. **Configurer** :
   - Nom de ressource : `image-batches`
   - Chemin de ressource : `/image-batches`
4. **Cliquer sur "Créer une ressource"**

### Étape 2.4 : Créer la méthode GET pour `/image-batches`

1. **Sélectionner** `/s3/image-batches` dans l'arbre
2. **Actions** → Créer une méthode → **GET**
3. **Configurer la méthode** :
   - Type d'intégration : Fonction Lambda
   - Région AWS Lambda : Votre région (ex: eu-west-1)
   - Point de terminaison Lambda : `listImageBatches`
4. **Cliquer sur "Enregistrer"**
5. **Dans la popup** : Cliquer sur "OK" pour autoriser l'accès

### Étape 2.5 : Créer la ressource `/download-batch/{batchId}`

1. **Sélectionner** `/s3` dans l'arbre
2. **Actions** → Créer une ressource
3. **Configurer** :
   - Nom de ressource : `{batchId}` (⚠️ avec les accolades)
   - Chemin de ressource : `{batchId}`
4. **Créer la ressource**

5. **Sélectionner** `/s3/{batchId}`
6. **Actions** → Créer une ressource sous celle-ci
7. **Configurer** :
   - Nom de ressource : `download`
   - Chemin : `/download`
8. **Créer la ressource**

### Étape 2.6 : Créer la méthode GET pour `/download`

1. **Sélectionner** `/s3/{batchId}/download`
2. **Actions** → Créer une méthode → **GET**
3. **Configurer** :
   - Type d'intégration : Lambda Function
   - Fonction Lambda : `downloadImageBatch`
4. **Enregistrer** et accepter l'autorisation

### Étape 2.7 : Créer la ressource `/batch-preview/{batchId}`

1. **Sélectionner** `/s3/{batchId}`
2. **Actions** → Créer une ressource
3. **Configurer** :
   - Nom : `preview`
   - Chemin : `/preview`
4. **Créer**

5. **Sélectionner** `/s3/{batchId}/preview`
6. **Actions** → Créer une méthode → **GET**
7. **Configurer** :
   - Type d'intégration : Lambda Function
   - Fonction Lambda : `getBatchPreview`
8. **Enregistrer** et accepter

---

## Partie 3 : Activer CORS

### Pour `/s3/image-batches`

1. **Sélectionner** `/s3/image-batches` → Méthode GET
2. **Actions** → Activer CORS
3. **Configurer** :
   - Origine autorisée : `*`
   - Headers autorisés : `*`
   - Méthodes autorisées : `GET, OPTIONS`
4. **Réplacer les valeurs dans l'en-tête existantes** : ❌ Non
5. **Activer CORS et remplacer les valeurs existantes**

### Répéter pour `/download` et `/preview`

Répéter les étapes 3 pour :
- `/s3/{batchId}/download` → GET
- `/s3/{batchId}/preview` → GET

---

## Partie 4 : Déployer l'API

### Étape 4.1 : Créer un stage

1. **Actions** → Déployer l'API
2. **Configurer** :
   - Stage de déploiement : Créer un nouveau stage
   - Nom du stage : `dev` (ou `staging`, ou `prod`)
   - Description : Développement
   - Variables de stage : (vide)
3. **Cliquer sur "Déployer"**

### Étape 4.2 : Récupérer l'URL de l'API

1. **Dans le menu de gauche** → Stages
2. **Sélectionner** le stage `dev`
3. **Copier l'URL d'invocation** (ex: `https://abc123.execute-api.eu-west-1.amazonaws.com/dev`)

**Endpoints finaux** :
- Liste : `https://abc123.execute-api.eu-west-1.amazonaws.com/dev/s3/image-batches`
- Télécharger : `https://abc123.execute-api.eu-west-1.amazonaws.com/dev/s3/download/{batchId}`
- Aperçu : `https://abc123.execute-api.eu-west-1.amazonaws.com/dev/s3/batch-preview/{batchId}`

---

## Partie 5 : Configurer l'application Next.js

### Étape 5.1 : Mettre à jour `.env.local`

```env
NEXT_PUBLIC_API_URL=https://abc123.execute-api.eu-west-1.amazonaws.com/dev
```

### Étape 5.2 : Tester l'application

1. **Lancer** : `npm run dev`
2. **Aller sur** : `http://localhost:3000/renouvellement-annonces`
3. **Vérifier** que les lots apparaissent

---

## 📝 Structure finale de l'API Gateway

```
API: console-pme-automation-api
├── /s3
│   ├── /image-batches (GET) → listImageBatches
│   └── /{batchId}
│       ├── /download (GET) → downloadImageBatch
│       └── /preview (GET) → getBatchPreview
```

---

## 🔍 Tests

### Test 1 : Lister les batches

```bash
curl https://abc123.execute-api.eu-west-1.amazonaws.com/dev/s3/image-batches
```

**Réponse attendue** :
```json
[
  {
    "batchId": "annonces-2024-01",
    "prefix": "annonces-2024-01/",
    "count": 45,
    "lastModified": "2024-01-15T10:30:00Z"
  }
]
```

### Test 2 : Aperçu d'un batch

```bash
curl https://abc123.execute-api.eu-west-1.amazonaws.com/dev/s3/batch-preview/annonces-2024-01
```

### Test 3 : Télécharger un batch

```bash
curl https://abc123.execute-api.eu-west-1.amazonaws.com/dev/s3/download/annonces-2024-01 -o batch.zip
```

---

## ⚠️ Points importants

### 1. Noms des variables dans le code

N'oubliez pas de remplacer **`votre-bucket-annonces`** par le nom réel de votre bucket S3 dans les 3 fichiers Python.

### 2. Permissions IAM

Assurez-vous que les rôles Lambda ont les permissions :
- `s3:GetObject` sur votre bucket
- `s3:ListBucket` sur votre bucket
- Logs CloudWatch

### 3. Timeout Lambda

La fonction `downloadImageBatch` peut prendre du temps → Configurer le timeout à au moins 60 secondes.

### 4. Mémoire Lambda

Pour `downloadImageBatch` : Au moins 512 MB de mémoire.

### 5. Taille des fichiers

Si les ZIP sont > 10 MB, envisager d'utiliser S3 presigned URLs au lieu de retourner directement le ZIP.

---

## 🐛 Dépannage

### Erreur : "Access denied"

- Vérifier les permissions IAM du rôle Lambda
- Vérifier que le bucket S3 existe et est accessible

### Erreur : "Lambda function not found"

- Vérifier les noms exacts des Lambda (sensible à la casse)
- Vérifier la région AWS

### Erreur : "Internal server error"

- Vérifier les logs CloudWatch de la Lambda
- Vérifier la configuration du code Python

### Erreur : CORS

- Vérifier que CORS est activé sur toutes les méthodes
- Vérifier les headers dans la réponse Lambda

---

## ✅ Checklist finale

- [ ] 3 Lambda créées avec le bon code
- [ ] Permissions IAM configurées sur les rôles Lambda
- [ ] Timeout et mémoire configurés pour `downloadImageBatch`
- [ ] API Gateway créée
- [ ] 3 ressources créées (`/image-batches`, `/{batchId}/download`, `/{batchId}/preview`)
- [ ] 3 méthodes GET créées et connectées aux Lambda
- [ ] CORS activé sur les 3 méthodes
- [ ] API déployée sur un stage
- [ ] URL récupérée et mise à jour dans `.env.local`
- [ ] Tests avec curl réussis
- [ ] Application Next.js testée

---

## 📞 Support

En cas de problème, vérifier les logs CloudWatch des Lambda :
1. AWS Console → Lambda → Sélectionner la fonction
2. Onglet "Surveiller" → Voir les logs CloudWatch

