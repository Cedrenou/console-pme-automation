# 🚀 Configuration AWS Amplify - Multi-environnements

Ce guide explique comment configurer AWS Amplify pour déployer automatiquement votre application sur différents environnements selon les branches Git.

## 📋 Prérequis

- Compte AWS avec accès à AWS Amplify
- Dépôt GitHub connecté à Amplify
- Permissions pour créer des applications Amplify

---

## 🔧 Configuration étape par étape

### **Étape 1 : Créer l'application principale (Production)**

1. **Aller sur AWS Amplify Console**
   - URL : https://console.aws.amazon.com/amplify/
   - Région : `eu-west-3`

2. **Connecter le dépôt GitHub**
   - Cliquer sur "New app" → "Host web app"
   - Choisir "GitHub" comme source
   - Autoriser l'accès à votre dépôt
   - Sélectionner `console-pme-automation`

3. **Configurer la branche `main`**
   - Branche : `main`
   - Build settings : Utiliser le fichier `amplify.yml` existant
   - Cliquer sur "Save and deploy"

4. **Configurer les variables d'environnement pour la production**
   - Aller dans "App settings" → "Environment variables"
   - Ajouter les variables suivantes :
   ```
   NEXT_PUBLIC_API_URL=https://api.execute-api.eu-west-3.amazonaws.com/prod
   NEXT_PUBLIC_ENVIRONMENT=production
   ```

### **Étape 2 : Créer l'environnement Staging**

1. **Dans l'application Amplify, aller dans "Branch settings"**
   - Cliquer sur "Add branch"
   - Nom : `staging`
   - Framework : Next.js
   - Build settings : Même configuration que main

2. **Configurer les variables d'environnement pour staging**
   - Aller dans "Branch settings" → "staging" → "Environment variables"
   - Ajouter les variables suivantes :
   ```
   NEXT_PUBLIC_API_URL=https://staging-api.execute-api.eu-west-3.amazonaws.com/staging
   NEXT_PUBLIC_ENVIRONMENT=staging
   ```

### **Étape 3 : Créer l'environnement Développement**

1. **Ajouter la branche `develop`**
   - Cliquer sur "Add branch"
   - Nom : `develop`
   - Framework : Next.js
   - Build settings : Même configuration

2. **Configurer les variables d'environnement pour développement**
   - Aller dans "Branch settings" → "develop" → "Environment variables"
   - Ajouter les variables suivantes :
   ```
   NEXT_PUBLIC_API_URL=https://dev-api.execute-api.eu-west-3.amazonaws.com/dev
   NEXT_PUBLIC_ENVIRONMENT=development
   ```

---

## 🌐 URLs des environnements

Une fois configuré, vous aurez accès à :

- **Production** : `https://console-pme-automation.amplifyapp.com`
- **Staging** : `https://staging.console-pme-automation.amplifyapp.com`
- **Développement** : `https://dev.console-pme-automation.amplifyapp.com`

---

## ⚙️ Configuration avancée

### **Build Settings personnalisés**

Si vous devez modifier les paramètres de build :

1. Aller dans "App settings" → "Build settings"
2. Modifier le fichier `amplify.yml` si nécessaire
3. Les changements s'appliquent à toutes les branches

### **Domaines personnalisés (optionnel)**

Pour utiliser vos propres domaines :

1. Aller dans "Domain management"
2. Ajouter votre domaine
3. Configurer les sous-domaines :
   - `app.votre-domaine.com` → Production
   - `staging.votre-domaine.com` → Staging
   - `dev.votre-domaine.com` → Développement

### **Notifications**

Configurer les notifications Slack/Email :

1. Aller dans "App settings" → "Notifications"
2. Ajouter les webhooks pour les notifications de build
3. Choisir les événements à notifier (succès, échec, etc.)

---

## 🔄 Workflow de déploiement

### **Déploiement automatique**

Une fois configuré, le déploiement se fait automatiquement :

1. **Push sur `develop`** → Déploiement automatique sur l'environnement de développement
2. **Push sur `staging`** → Déploiement automatique sur l'environnement de staging
3. **Push sur `main`** → Déploiement automatique en production

### **Utilisation du script de workflow**

```bash
# Créer une feature
./scripts/git-workflow.sh feature nom-de-la-feature

# Déployer en staging
./scripts/git-workflow.sh deploy-staging

# Déployer en production
./scripts/git-workflow.sh deploy-prod
```

---

## 🛠️ Dépannage

### **Build qui échoue**

1. **Vérifier les logs de build** dans Amplify Console
2. **Vérifier les variables d'environnement** sont correctes
3. **Tester localement** avec `npm run build`

### **Variables d'environnement non prises en compte**

1. **Redémarrer le build** après modification des variables
2. **Vérifier les noms** des variables (sensible à la casse)
3. **Vérifier les valeurs** ne contiennent pas d'espaces

### **Problèmes de cache**

1. **Invalider le cache** dans les paramètres de build
2. **Ajouter des headers de cache** dans `amplify.yml`
3. **Forcer un nouveau déploiement**

---

## 📊 Monitoring

### **Métriques disponibles**

- **Temps de build** par branche
- **Taux de succès** des déploiements
- **Performance** de l'application
- **Erreurs** en temps réel

### **Alertes**

Configurer des alertes pour :
- Échec de build
- Temps de build trop long
- Erreurs en production

---

## 🔒 Sécurité

### **Bonnes pratiques**

1. **Ne jamais commiter** les vraies variables d'environnement
2. **Utiliser des secrets** pour les clés sensibles
3. **Limiter les accès** aux environnements de production
4. **Auditer régulièrement** les permissions

### **IAM Roles**

Créer des rôles IAM spécifiques :
- `AmplifyReadOnly` pour la consultation
- `AmplifyDeveloper` pour les développeurs
- `AmplifyAdmin` pour l'administration

---

## 📝 Checklist de configuration

- [ ] Application Amplify créée
- [ ] Branche `main` configurée (production)
- [ ] Branche `staging` configurée
- [ ] Branche `develop` configurée
- [ ] Variables d'environnement configurées pour chaque branche dans la console
- [ ] Tests de déploiement effectués
- [ ] Script de workflow testé
- [ ] Notifications configurées (optionnel)
- [ ] Domaines personnalisés configurés (optionnel)

---

## 🆘 Support

En cas de problème :

1. **Consulter la documentation AWS Amplify**
2. **Vérifier les logs de build** dans la console
3. **Tester localement** avant de pousser
4. **Contacter l'équipe** si le problème persiste

---

**Note :** Ce guide doit être adapté selon vos besoins spécifiques et votre infrastructure AWS existante. 