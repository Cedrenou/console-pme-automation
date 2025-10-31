# 🔌 Brancher la Lambda de téléchargement dans API Gateway

Ce guide vous explique comment connecter votre lambda `downloadImageBatch` existante à l'API Gateway pour que le bouton "Télécharger" fonctionne.

## ⚠️ Important : Contenu du téléchargement

La lambda télécharge **TOUS les fichiers** présents dans le dossier S3, y compris :
- ✅ Les images (`.jpg`, `.png`, etc.)
- ✅ Les fichiers texte (`.txt`, etc.)
- ✅ Tous les autres types de fichiers présents dans le dossier

**Aucun filtrage par type de fichier n'est effectué** - le ZIP contiendra exactement tous les fichiers présents dans le dossier S3.

## 🎯 Objectif

Créer l'endpoint `/s3/download-images-batch/{batchId}` qui appelle votre lambda `downloadImageBatch` existante pour télécharger un dossier complet (tous les fichiers) sous forme de ZIP.

---

## 📋 Prérequis

- ✅ Lambda `downloadImageBatch` créée et fonctionnelle
- ✅ API Gateway existante avec l'endpoint `/s3/list-folders-images` déjà configuré
- ✅ Permissions IAM configurées sur le rôle Lambda (accès S3 + CloudWatch Logs)

### ⚠️ Vérification du code Lambda

Assurez-vous que votre lambda **traite tous les fichiers** du dossier, pas seulement les images. Le code doit ressembler à ceci :

```python
# ✅ BON : Traite tous les fichiers
for obj in response['Contents']:
    file_name = obj['Key'].split('/')[-1]
    if file_name:  # Ignore seulement les dossiers vides
        zip_file.writestr(file_name, content)

# ❌ MAUVAIS : Filtre uniquement les images
for obj in response['Contents']:
    if obj['Key'].endswith(('.jpg', '.png')):  # ❌ Ne faites pas ça !
        zip_file.writestr(file_name, content)
```

Si votre lambda filtre par type de fichier, modifiez-la pour inclure **tous les fichiers**.

---

## 🚀 Étapes de configuration

### Étape 1 : Accéder à votre API Gateway

1. **Aller dans AWS Console** → Services → **API Gateway**
2. **Sélectionner votre API** (probablement `console-pme-automation-api` ou celle qui contient `/s3/list-folders-images`)
3. **Dans l'arbre de navigation** à gauche, vous devriez voir :
   ```
   API
   └── /s3
       └── /list-folders-images (GET) ✅
   ```

---

### Étape 2 : Créer la ressource `/download-images-batch/{batchId}`

1. **Sélectionner** la ressource `/s3` dans l'arbre
2. **Cliquer sur "Actions"** (en haut à droite)
3. **Sélectionner "Créer une ressource"**

4. **Configurer la ressource** :
   ```
   Nom de ressource : download-images-batch
   Chemin de ressource : download-images-batch
   Activer CORS : ❌ NON (on l'activera après)
   ```

5. **Cliquer sur "Créer une ressource"**

Vous devriez maintenant voir :
```
API
└── /s3
    ├── /list-folders-images (GET) ✅
    └── /download-images-batch ⚠️ (nouveau)
```

---

### Étape 3 : Ajouter le paramètre de chemin `{batchId}`

1. **Sélectionner** la ressource `/s3/download-images-batch` que vous venez de créer
2. **Cliquer sur "Actions"** → **"Créer une ressource"**
3. **Configurer** :
   ```
   Nom de ressource : {batchId}
   Chemin de ressource : {batchId}
   Activer CORS : ❌ NON
   ```
   
   ⚠️ **IMPORTANT** : Les accolades `{}` sont nécessaires pour créer un paramètre de chemin

4. **Cliquer sur "Créer une ressource"**

Vous devriez maintenant avoir :
```
API
└── /s3
    ├── /list-folders-images (GET) ✅
    └── /download-images-batch
        └── /{batchId} ⚠️ (nouveau)
```

---

### Étape 4 : Créer la méthode GET

1. **Sélectionner** `/s3/download-images-batch/{batchId}` dans l'arbre
2. **Cliquer sur "Actions"** → **"Créer une méthode"** → **Sélectionner "GET"**
3. **Dans la configuration de la méthode** :
   ```
   Type d'intégration : Fonction Lambda
   Région AWS Lambda : Votre région (ex: eu-west-3)
   Point de terminaison Lambda : downloadImageBatch
   ✅ Utiliser le proxy Lambda : OUI (recommandé)
   ```

4. **Cliquer sur "Enregistrer"**
5. **Dans la popup** : Cliquer sur **"OK"** pour autoriser l'accès API Gateway → Lambda

Vous devriez maintenant voir :
```
API
└── /s3
    ├── /list-folders-images (GET) ✅
    └── /download-images-batch
        └── /{batchId}
            └── GET ⚠️ (nouveau, connecté à downloadImageBatch)
```

---

### Étape 5 : Activer CORS

1. **Sélectionner** `/s3/download-images-batch/{batchId}` → **GET**
2. **Cliquer sur "Actions"** → **"Activer CORS"**

3. **Configurer CORS** :
   ```
   Origine autorisée : *
   (ou votre URL spécifique : https://main.dy83anvumeuuy.amplifyapp.com)
   
   Headers autorisés : *
   
   Méthodes autorisées : GET, OPTIONS
   
   Remplacer les valeurs dans l'en-tête existantes : ✅ OUI
   ```

4. **Cliquer sur "Activer CORS et remplacer les valeurs existantes"**

---

### Étape 6 : Créer la méthode OPTIONS (si pas automatique)

Si la méthode OPTIONS n'a pas été créée automatiquement :

1. **Sélectionner** `/s3/download-images-batch/{batchId}`
2. **Cliquer sur "Actions"** → **"Créer une méthode"** → **OPTIONS**
3. **Configurer** :
   ```
   Type d'intégration : MOCK
   ```
4. **Enregistrer**

5. **Configurer la réponse MOCK** :
   - Aller dans "Intégration Response"
   - Status : `200`
   - Headers :
     ```
     Access-Control-Allow-Origin: *
     Access-Control-Allow-Headers: *
     Access-Control-Allow-Methods: GET, OPTIONS
     ```
   - **Enregistrer**

---

### Étape 7 : Déployer l'API

⚠️ **IMPORTANT** : Sans déploiement, vos changements ne sont pas actifs !

1. **Cliquer sur "Actions"** (en haut)
2. **Sélectionner "Déployer l'API"**
3. **Configurer** :
   ```
   Stage de déploiement : prod (ou votre stage)
   Description : Ajout endpoint download-images-batch
   ```
4. **Cliquer sur "Déployer"**

---

## ✅ Vérification

### Test 1 : Vérifier que l'endpoint existe

Dans l'arbre de navigation, vous devriez voir :
```
API
└── /s3
    ├── /list-folders-images (GET) ✅
    └── /download-images-batch
        └── /{batchId}
            ├── GET ✅ (connecté à downloadImageBatch)
            └── OPTIONS ✅ (si créé)
```

### Test 2 : Tester avec curl

```bash
# Remplacer par votre URL API Gateway et un batchId réel
curl https://3evtl8smf9.execute-api.eu-west-3.amazonaws.com/prod/s3/download-images-batch/votre-batch-id -o test.zip
```

**Réponse attendue** : Un fichier ZIP devrait être téléchargé contenant **tous les fichiers** du dossier (images, fichiers texte, etc.).

### Test 3 : Tester dans l'application

1. Aller sur votre page `/renouvellement-annonces`
2. Cliquer sur le bouton **"Télécharger"** d'un lot
3. Vérifier que le téléchargement fonctionne

---

## 🐛 Dépannage

### Erreur : "Lambda function not found"

- Vérifier que le nom de la lambda est exactement `downloadImageBatch` (sensible à la casse)
- Vérifier que vous êtes dans la bonne région AWS

### Erreur : "Access denied"

- Vérifier que l'API Gateway a les permissions pour invoquer la Lambda
- Dans Lambda → Configuration → Permissions, vérifier qu'il y a une permission pour `apigateway.amazonaws.com`

### Erreur CORS

- Vérifier que CORS est bien activé sur la méthode GET
- Vérifier que la méthode OPTIONS est créée
- Vérifier que l'API est bien déployée

### Erreur : "Internal server error"

- Vérifier les logs CloudWatch de la Lambda `downloadImageBatch`
- Vérifier que les permissions S3 sont correctes
- Vérifier que le timeout Lambda est suffisant (60 secondes minimum pour des ZIP)
- Vérifier que la lambda traite bien tous les types de fichiers (pas seulement les images)

### Le bouton ne télécharge rien

- Ouvrir la console du navigateur (F12)
- Vérifier l'onglet Network pour voir les requêtes
- Vérifier que l'URL appelée correspond bien à votre endpoint API Gateway

---

## 📝 Checklist finale

- [ ] Ressource `/s3/download-images-batch` créée
- [ ] Ressource `/{batchId}` créée sous `/download-images-batch`
- [ ] Méthode GET créée et connectée à `downloadImageBatch`
- [ ] CORS activé sur la méthode GET
- [ ] Méthode OPTIONS créée (si nécessaire)
- [ ] API déployée sur le stage `prod`
- [ ] Test avec curl réussi
- [ ] Test dans l'application réussi

---

## 🔗 URLs finales

Votre endpoint sera accessible à :
```
https://[votre-api-id].execute-api.[region].amazonaws.com/[stage]/s3/download-images-batch/{batchId}
```

Exemple :
```
https://3evtl8smf9.execute-api.eu-west-3.amazonaws.com/prod/s3/download-images-batch/annonces-2024-01
```

---

## 💡 Configuration Lambda recommandée

Pour que la lambda fonctionne bien avec des fichiers ZIP :

**Timeout** : Au moins 60 secondes (dans Lambda → Configuration → Timeout)
**Mémoire** : Au moins 512 MB (dans Lambda → Configuration → Mémoire)

**Note** : Si votre lambda filtre par type de fichier (ex: seulement `.jpg`), modifiez-la pour inclure tous les fichiers. La lambda doit traiter **tous les objets** retournés par `s3.list_objects_v2()` sans filtrage par extension.

---

## 🎉 C'est terminé !

Une fois toutes ces étapes complétées, votre bouton "Télécharger" devrait fonctionner parfaitement !

