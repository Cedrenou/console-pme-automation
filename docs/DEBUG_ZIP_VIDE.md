# 🔍 Débogage : ZIP vide après téléchargement

Si le téléchargement semble réussir mais que le ZIP est vide, voici comment identifier et résoudre le problème.

---

## 🎯 Causes possibles

1. **Le prefix S3 ne correspond pas au batchId** (le plus fréquent)
2. **La lambda ne trouve pas de fichiers dans S3**
3. **Problème d'encodage base64**
4. **La lambda retourne une erreur mais le front-end ne l'affiche pas**
5. **Le format de réponse de la lambda n'est pas correct pour API Gateway**

---

## 🔧 Diagnostic étape par étape

### Étape 1 : Vérifier les logs CloudWatch de la Lambda

1. **Aller dans AWS Console** → **Lambda** → Sélectionner `downloadImageBatch`
2. **Onglet "Surveiller"** → Cliquer sur **"Voir les logs dans CloudWatch"**
3. **Ouvrir le dernier log** et vérifier :
   - Le `batchId` reçu
   - Le `prefix` calculé
   - Le nombre de fichiers trouvés dans `response['Contents']`
   - Les erreurs éventuelles

**Ce qu'on cherche** :
```python
# Si vous voyez ça, c'est bon :
print(f"Batch ID reçu: {batch_id}")
print(f"Prefix calculé: {prefix}")
print(f"Nombre de fichiers trouvés: {len(response.get('Contents', []))}")

# Si vous voyez ça, c'est mauvais :
# "Nombre de fichiers trouvés: 0"  ← Problème de prefix
# "Batch not found"  ← Le prefix ne correspond pas
```

---

### Étape 2 : Vérifier le format du batchId vs le prefix S3

**Le problème le plus fréquent** : La conversion `batchId.replace('-', '/')` ne correspond pas au vrai chemin S3.

#### A. Trouver le vrai prefix S3

1. **Aller dans S3** → Votre bucket
2. **Naviguer jusqu'au dossier** que vous voulez télécharger
3. **Copier le chemin complet** (ex: `renouvellement-annonce-vinted/output/annonces/renouv-test/`)

#### B. Vérifier le batchId affiché dans l'interface

Dans votre interface, quel est le `batchId` affiché ? (ex: `renouv-test`)

#### C. Comparer avec la conversion de la Lambda

La lambda fait :
```python
prefix = batch_id.replace('-', '/') + '/'
# Si batchId = "renouv-test" → prefix = "renouv/test/"
```

**Si le vrai prefix S3 est** `renouvellement-annonce-vinted/output/annonces/renouv-test/`  
**Mais le batchId est** `renouv-test`  
**Alors la conversion donne** `renouv/test/` ❌

**→ Les chemins ne correspondent pas !**

---

### Étape 3 : Vérifier la réponse HTTP dans le navigateur

Ajoutez des logs temporaires dans le code front-end pour voir ce qui est reçu :

**Modifier `src/lib/api.ts`** :

```typescript
export async function downloadImageBatch(batchId: string): Promise<Blob> {
  console.log("downloadImageBatch pour lot:", batchId);
  
  const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/s3/download-images-batch/${batchId}`);
  
  // ⚠️ AJOUTER CES LOGS
  console.log("Status HTTP:", res.status);
  console.log("Content-Type:", res.headers.get('Content-Type'));
  console.log("Content-Length:", res.headers.get('Content-Length'));
  
  if (!res.ok) {
    const errorText = await res.text();
    console.error("Erreur API:", errorText);
    throw new Error(`Erreur ${res.status}: ${errorText}`);
  }
  
  const blob = await res.blob();
  console.log("Taille du blob reçu:", blob.size, "bytes");
  
  // Vérifier si le blob est vraiment vide
  if (blob.size === 0) {
    console.error("⚠️ Le blob est vide ! Problème côté Lambda ou API Gateway");
  }
  
  return blob;
}
```

**Après avoir ajouté ces logs** :
1. Ouvrir la console du navigateur (F12)
2. Cliquer sur "Télécharger"
3. Regarder les logs

**Interprétation** :
- `Content-Length: 0` → La lambda ne retourne rien ou retourne un ZIP vide
- `Status HTTP: 200` mais `blob.size: 0` → La lambda retourne une réponse vide
- `Status HTTP: 500` → Erreur dans la lambda (voir logs CloudWatch)

---

### Étape 4 : Tester directement l'endpoint API Gateway

Tester avec `curl` pour voir la réponse brute :

```bash
curl -v https://[votre-api-id].execute-api.[region].amazonaws.com/[stage]/s3/download-images-batch/[batchId] -o test.zip
```

**Regarder** :
- Le `Content-Length` dans les headers
- Le code HTTP (200, 404, 500, etc.)
- La taille du fichier téléchargé : `ls -lh test.zip`

**Si `test.zip` est vide ou fait 0 bytes** → Le problème est dans la Lambda ou l'API Gateway.

**Si `test.zip` contient des données** → Le problème est dans le front-end (peu probable).

---

## 🛠️ Solutions selon le problème

### Solution 1 : Corriger la conversion batchId → prefix

Si le `batchId` ne contient pas le chemin complet, vous avez 2 options :

#### Option A : Modifier la lambda pour utiliser le prefix complet

Au lieu de convertir le batchId, récupérez le prefix directement depuis la liste des batches :

**Modifier la lambda** :
```python
import boto3
import io
import zipfile
import json
import base64

def handler(event, context):
    s3 = boto3.client('s3')
    bucket_name = 'votre-bucket-annonces'  # ⚠️ À MODIFIER
    
    batch_id = event.get('pathParameters', {}).get('batchId', '')
    
    # ⚠️ SOLUTION : Utiliser directement le batchId comme prefix
    # Si votre batchId est déjà le prefix complet depuis S3
    # Exemple : batchId = "renouvellement-annonce-vinted/output/annonces/renouv-test"
    
    # Si batchId contient des tirets qu'il faut convertir
    # Testez les deux méthodes :
    
    # Méthode 1 : Si batchId est déjà un prefix
    prefix = batch_id if batch_id.endswith('/') else batch_id + '/'
    
    # OU Méthode 2 : Si batchId utilise des tirets comme séparateurs
    # prefix = batch_id.replace('-', '/') + '/'
    
    # OU Méthode 3 : Si vous passez le prefix complet dans le batchId
    # prefix = batch_id  # Utiliser directement
    
    print(f"Batch ID reçu: {batch_id}")
    print(f"Prefix utilisé: {prefix}")
    
    # Récupérer tous les objets du préfixe
    response = s3.list_objects_v2(
        Bucket=bucket_name,
        Prefix=prefix
    )
    
    print(f"Nombre d'objets trouvés: {len(response.get('Contents', []))}")
    
    if 'Contents' not in response or len(response['Contents']) == 0:
        return {
            'statusCode': 404,
            'headers': {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            },
            'body': json.dumps({
                'error': 'Batch not found or empty',
                'batchId': batch_id,
                'prefix': prefix,
                'found_objects': 0
            })
        }
    
    # Créer un ZIP en mémoire
    zip_buffer = io.BytesIO()
    files_added = 0
    
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
                    files_added += 1
                    print(f"Ajouté au ZIP: {file_name} ({len(content)} bytes)")
            except Exception as e:
                print(f"Erreur lors du traitement de {obj['Key']}: {str(e)}")
                continue
    
    print(f"Total fichiers ajoutés au ZIP: {files_added}")
    
    if files_added == 0:
        return {
            'statusCode': 404,
            'headers': {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            },
            'body': json.dumps({
                'error': 'No files to zip',
                'batchId': batch_id,
                'prefix': prefix
            })
        }
    
    zip_buffer.seek(0)
    zip_size = len(zip_buffer.getvalue())
    print(f"Taille du ZIP créé: {zip_size} bytes")
    
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

#### Option B : Modifier le front-end pour passer le prefix complet

Si votre `ImageBatch` contient déjà le `prefix`, utilisez-le directement :

**Modifier `src/app/renouvellement-annonces/page.tsx`** :

```typescript
const handleDownload = async (batch: ImageBatch) => {
  setDownloadingBatch(batch.batchId);
  try {
    // Utiliser le prefix au lieu du batchId si disponible
    const identifier = batch.prefix || batch.batchId;
    const blob = await downloadImageBatch(identifier);
    // ... reste du code
  }
}
```

---

### Solution 2 : Vérifier que la lambda traite correctement la réponse API Gateway

Si vous utilisez **Lambda Proxy Integration** (recommandé), la lambda reçoit l'événement directement d'API Gateway.

**Vérifier dans API Gateway** :
1. Sélectionner la méthode GET
2. Onglet "Intégration"
3. Vérifier que **"Utiliser le proxy Lambda"** est activé ✅

Si ce n'est pas le cas, l'événement peut être dans un format différent.

---

### Solution 3 : Vérifier l'encodage base64

Si la lambda retourne `isBase64Encoded: True`, le body doit être en base64.

**Ajouter des logs dans la lambda** :
```python
zip_base64 = base64.b64encode(zip_buffer.getvalue()).decode('utf-8')
print(f"Taille ZIP original: {len(zip_buffer.getvalue())} bytes")
print(f"Taille base64: {len(zip_base64)} caractères")
print(f"Premiers caractères base64: {zip_base64[:50]}...")

return {
    'statusCode': 200,
    'headers': { ... },
    'body': zip_base64,
    'isBase64Encoded': True  # ⚠️ IMPORTANT : Doit être True
}
```

---

## 📋 Checklist de vérification

- [ ] Vérifier les logs CloudWatch de la Lambda
- [ ] Comparer le `batchId` avec le vrai prefix S3
- [ ] Ajouter des logs dans le front-end pour voir la taille du blob
- [ ] Tester avec `curl` directement l'endpoint API Gateway
- [ ] Vérifier que la lambda trouve bien des fichiers (`len(response['Contents']) > 0`)
- [ ] Vérifier que des fichiers sont ajoutés au ZIP (`files_added > 0`)
- [ ] Vérifier que `isBase64Encoded: True` est présent dans la réponse
- [ ] Vérifier que le Content-Type est `application/zip`

---

## 🎯 Solution rapide : Lambda avec logs détaillés

Voici une version de la lambda avec tous les logs nécessaires pour déboguer :

```python
import boto3
import io
import zipfile
import json
import base64

def handler(event, context):
    s3 = boto3.client('s3')
    bucket_name = 'sunset-s3'  # ⚠️ À MODIFIER selon votre bucket
    
    # Récupérer le batchId depuis les pathParameters
    batch_id = event.get('pathParameters', {}).get('batchId', '')
    
    print(f"🔍 DEBUG - Batch ID reçu: {batch_id}")
    print(f"🔍 DEBUG - Event complet: {json.dumps(event)}")
    
    # Essayer différentes méthodes de conversion
    # Selon votre structure S3, ajustez cette partie
    if '/' in batch_id:
        # Le batchId contient déjà des slashes (prefix complet)
        prefix = batch_id if batch_id.endswith('/') else batch_id + '/'
    else:
        # Le batchId utilise des tirets, les convertir
        prefix = batch_id.replace('-', '/') + '/'
    
    print(f"🔍 DEBUG - Prefix calculé: {prefix}")
    print(f"🔍 DEBUG - Bucket: {bucket_name}")
    
    # Récupérer tous les objets du préfixe
    try:
        response = s3.list_objects_v2(
            Bucket=bucket_name,
            Prefix=prefix
        )
        
        contents = response.get('Contents', [])
        print(f"🔍 DEBUG - Nombre d'objets trouvés: {len(contents)}")
        
        if len(contents) == 0:
            print(f"❌ ERREUR - Aucun objet trouvé pour le prefix: {prefix}")
            return {
                'statusCode': 404,
                'headers': {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*'
                },
                'body': json.dumps({
                    'error': 'No files found',
                    'batchId': batch_id,
                    'prefix': prefix,
                    'bucket': bucket_name
                })
            }
        
        # Afficher les premiers objets trouvés
        print(f"🔍 DEBUG - Premiers objets trouvés:")
        for i, obj in enumerate(contents[:5]):
            print(f"  {i+1}. {obj['Key']} ({obj.get('Size', 0)} bytes)")
        
    except Exception as e:
        print(f"❌ ERREUR lors de list_objects_v2: {str(e)}")
        return {
            'statusCode': 500,
            'headers': {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            },
            'body': json.dumps({'error': str(e)})
        }
    
    # Créer un ZIP en mémoire
    zip_buffer = io.BytesIO()
    files_added = 0
    total_size = 0
    
    with zipfile.ZipFile(zip_buffer, 'w', zipfile.ZIP_DEFLATED) as zip_file:
        for obj in contents:
            try:
                key = obj['Key']
                print(f"📦 Traitement: {key}")
                
                # Télécharger l'objet depuis S3
                s3_obj = s3.get_object(Bucket=bucket_name, Key=key)
                content = s3_obj['Body'].read()
                
                # Ajouter au ZIP avec le nom de fichier uniquement
                file_name = key.split('/')[-1]
                if file_name:  # Ignorer les objets qui sont des dossiers
                    zip_file.writestr(file_name, content)
                    files_added += 1
                    total_size += len(content)
                    print(f"✅ Ajouté: {file_name} ({len(content)} bytes)")
            except Exception as e:
                print(f"❌ Erreur pour {obj['Key']}: {str(e)}")
                continue
    
    print(f"🔍 DEBUG - Fichiers ajoutés au ZIP: {files_added}")
    print(f"🔍 DEBUG - Taille totale des fichiers: {total_size} bytes")
    
    if files_added == 0:
        print(f"❌ ERREUR - Aucun fichier ajouté au ZIP")
        return {
            'statusCode': 404,
            'headers': {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            },
            'body': json.dumps({
                'error': 'No files added to zip',
                'batchId': batch_id,
                'prefix': prefix,
                'objects_found': len(contents)
            })
        }
    
    zip_buffer.seek(0)
    zip_bytes = zip_buffer.getvalue()
    zip_size = len(zip_bytes)
    print(f"🔍 DEBUG - Taille du ZIP créé: {zip_size} bytes")
    
    # Encoder en base64 pour l'API Gateway
    zip_base64 = base64.b64encode(zip_bytes).decode('utf-8')
    print(f"🔍 DEBUG - Taille base64: {len(zip_base64)} caractères")
    
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

Cette version avec logs vous dira exactement où est le problème !

---

## 🚀 Prochaines étapes

1. **Déployer cette version de la lambda** avec tous les logs
2. **Tester le téléchargement**
3. **Regarder les logs CloudWatch**
4. **Identifier le problème** (prefix incorrect, aucun fichier trouvé, etc.)
5. **Corriger selon la solution correspondante**

