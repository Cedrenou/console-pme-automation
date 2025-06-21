# 🧩 Interface Front-End – Console PME Automation

Cette application front-end est une interface d'administration permettant à des petites entreprises de **configurer et piloter leurs tâches automatisées** (via AWS Lambda) via un formulaire simple et sécurisé.

---

## 🚀 Stack technique

- [Next.js](https://nextjs.org/)
- [TailwindCSS](https://tailwindcss.com/)
- [Shadcn UI](https://ui.shadcn.com/)
- [AWS Amplify](https://docs.amplify.aws/) pour le hosting et les services
- Communication avec l'API via **API Gateway + Lambda**

---

## 🌿 Workflow Git & Environnements

### **Branches et environnements :**

- **`main`** → **Production** (stable, déployé automatiquement)
  - URL : `https://console-pme-automation.amplifyapp.com`
  - Variables d'environnement : Production
  
- **`staging`** → **Staging/Pré-production** (tests avant prod)
  - URL : `https://staging.console-pme-automation.amplifyapp.com`
  - Variables d'environnement : Staging
  
- **`develop`** → **Développement** (intégration des features)
  - URL : `https://dev.console-pme-automation.amplifyapp.com`
  - Variables d'environnement : Développement

### **Workflow de développement :**

1. **Nouvelle feature :** `feature/nom-de-la-feature` ← `develop`
2. **Tests :** `develop` → `staging`
3. **Déploiement :** `staging` → `main` (après validation)

### **Commandes Git utiles :**

```bash
# Créer une nouvelle feature
git checkout develop
git checkout -b feature/nouvelle-feature

# Merger une feature
git checkout develop
git merge feature/nouvelle-feature
git push origin develop

# Déployer en staging
git checkout staging
git merge develop
git push origin staging

# Déployer en production
git checkout main
git merge staging
git push origin main
```

---

## 🔐 Authentification

L'authentification sera implémentée avec **Supabase** dans le cadre de la migration en cours.

**Fonctionnalités prévues :**
- Connexion via email/password
- Gestion des sessions sécurisées
- Protection des routes par client
- Interface d'administration intégrée

---

## 📂 Structure du projet

```
console-pme-automation/
├── app/ # Routing Next.js App Router
├── components/ # Composants UI (Shadcn + customs)
├── lib/ # Fonctions d'appel API, auth, etc.
├── pages/ # (si utilisation de Pages Router)
├── styles/ # Fichier Tailwind config
└── .env.local # Variables d'environnement
```

---

## ⚙️ Variables d'environnement

### **Développement (`.env.local`)**
```env
NEXT_PUBLIC_API_URL=https://dev-api.execute-api.eu-west-3.amazonaws.com/dev
NEXT_PUBLIC_ENVIRONMENT=development
```

### **Staging (AWS Amplify)**
```env
NEXT_PUBLIC_API_URL=https://staging-api.execute-api.eu-west-3.amazonaws.com/staging
NEXT_PUBLIC_ENVIRONMENT=staging
```

### **Production (AWS Amplify)**
```env
NEXT_PUBLIC_API_URL=https://api.execute-api.eu-west-3.amazonaws.com/prod
NEXT_PUBLIC_ENVIRONMENT=production
```

## 📦 Installation

# 1. Cloner le repo
git clone https://github.com/Cedrenou/console-pme-automation.git
cd console-pme-automation

# 2. Installer les dépendances
pnpm install

# 3. Lancer en développement
pnpm dev

## 📤 Déploiement

### **AWS Amplify (Recommandé)**
1. Connecter le dépôt GitHub à AWS Amplify
2. Configurer les branches :
   - `main` → Production
   - `staging` → Staging  
   - `develop` → Développement
3. Renseigner les variables d'environnement par environnement
4. Amplify s'occupe de la build, du hosting et du cache

### **Configuration Amplify par branche :**
- **main** : Build automatique, déploiement en production
- **staging** : Build automatique, déploiement en staging
- **develop** : Build automatique, déploiement en développement

### **Option 2 : auto-hébergé sur EC2 ou autre**
Build : npm build
Lancer en prod : npm start

## ✨ Fonctionnalités prévues

- 🔐 Connexion / Déconnexion via Supabase
- 📄 Affichage des Lambdas disponibles
- 📝 Formulaire dynamique de configuration (clé / valeur)
- 💾 Enregistrement des paramètres via appel REST API (AWS Gateway + Lambda)
- ✅ Retour utilisateur (toast / alert)
- 📊 Logs d'activité (future version)

## 🧪 Tests
À venir : tests unitaires via Playwright ou Jest

## 🧠 Auteur
Développé par Cedric Renouleau pour un outil d'aide à l'automatisation des PME.
