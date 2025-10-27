# 🔧 Solution rapide : Activer CORS sur votre API Gateway

## Problème
Erreur CORS : `Access to fetch at 'https://3evtl8smf9.execute-api.eu-west-3.amazonaws.com/prod/s3/list-folders-images' from origin 'https://main.dy83anvumeuuy.amplifyapp.com' has been blocked by CORS policy`

## Solution : Activer CORS via AWS Console (5 minutes)

### ⚡ Étapes rapides

1. **Aller dans AWS Console** → Services → API Gateway

2. **Trouver votre API** :
   - Cherchez l'API avec l'ID `3evtl8smf9` 
   - Ou cliquez sur "APIs" → Chercher par endpoint URL

3. **Cliquer sur votre API** pour ouvrir les ressources

4. **Pour CHAQUE endpoint** (`/list-folders-images`, `/download-images-batch/{batchId}`, `/preview-images-batch/{batchId}`) :

   **A. Sélectionner la ressource**
   - Dans l'arbre de navigation à gauche, trouvez la ressource
   - Exemple : `s3` → `list-folders-images`

   **B. Sélectionner la méthode GET**
   - Cliquer sur `GET` sous la ressource

   **C. Activer CORS**
   - Cliquer sur **"Actions"** (bouton en haut)
   - Sélectionner **"Activer CORS"**
   
   **D. Configurer CORS**
   ```
   Origine autorisée : https://main.dy83anvumeuuy.amplifyapp.com
                          ⚠️ OU pour tous : *
   
   Headers autorisés : *
   
   Méthodes autorisées : GET, OPTIONS
   
   Remplacer les valeurs dans l'en-tête existantes : ❌ NON
   ```
   
   **E. Cliquer sur "Activer CORS et remplacer les valeurs existantes"**

5. **Créer la méthode OPTIONS (si pas déjà présente)**
   
   Pour chaque ressource où vous avez activé CORS :
   
   - Sélectionner la ressource (ex: `/list-folders-images`)
   - Actions → Créer une méthode → OPTIONS
   - Type d'intégration : MOCK
   - Configuration de l'intégration :
     ```
     Content-Handling: Pas de modification
     Pass-through : Headers et body
     ```
   - Cliquer sur "Enregistrer"
   
   - Configurer l'intégration MOCK :
     - Aller dans Intégration MOCK
     - Définir les valeurs de réponse :
       ```
       Status : 200
       Headers :
         Access-Control-Allow-Origin: https://main.dy83anvumeuuy.amplifyapp.com
         Access-Control-Allow-Headers: *
         Access-Control-Allow-Methods: GET, OPTIONS
       ```
     - Enregistrer

6. **Déployer l'API**
   
   - Actions → Déployer l'API
   - Sélectionner le stage : **prod**
   - Cliquer sur "Déployer"

### ✅ Vérification

Rechargez votre page : `https://main.dy83anvumeuuy.amplifyapp.com/renouvellement-annonces`

L'erreur CORS devrait avoir disparu !

---

## Configuration CORS alternative (pour test en développement)

Si vous voulez autoriser toutes les origines (pas sécurisé pour la prod) :

```
Origine autorisée : *
```

Puis en production, remplacer par votre URL spécifique.

---

## Configuration automatisée via AWS CLI

Si vous préférez la ligne de commande :

```bash
# Activer CORS sur /s3/list-folders-images
aws apigateway put-method-response \
  --rest-api-id 3evtl8smf9 \
  --resource-id <RESOURCE_ID> \
  --http-method GET \
  --status-code 200 \
  --response-parameters method.response.header.Access-Control-Allow-Origin=true

# Déployer
aws apigateway create-deployment \
  --rest-api-id 3evtl8smf9 \
  --stage-name prod
```

---

## 🐛 Dépannage

### Erreur persiste après déploiement

1. **Vider le cache du navigateur** : Ctrl+Shift+R ou Cmd+Shift+R
2. **Vérifier les headers** dans l'onglet Network de DevTools
3. **Vérifier que le déploiement est bien fait** sur le stage `prod`

### L'endpoint OPTIONS renvoie 403

- Vérifier que la méthode OPTIONS est bien créée
- Vérifier la configuration de l'intégration MOCK

### Headers manquants

Dans la configuration CORS, cocher :
- ✅ Remplacer les valeurs dans l'en-tête existantes : **OUI**

---

## 📝 Checklist

- [ ] CORS activé sur `/s3/list-folders-images`
- [ ] CORS activé sur `/s3/download-images-batch/{batchId}`
- [ ] CORS activé sur `/s3/preview-images-batch/{batchId}`
- [ ] Méthode OPTIONS créée pour chaque ressource
- [ ] API déployée sur stage `prod`
- [ ] Test dans le navigateur réussi

---

## URLs à configurer

Vos endpoints :
- ✅ `GET /s3/list-folders-images`
- ✅ `GET /s3/download-images-batch/{batchId}`
- ✅ `GET /s3/preview-images-batch/{batchId}`

Host API Gateway :
`https://3evtl8smf9.execute-api.eu-west-3.amazonaws.com/prod`

Origine à autoriser :
`https://main.dy83anvumeuuy.amplifyapp.com`

