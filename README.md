# 🧩 Interface Front-End – Console PME Automation

Cette application front-end est une interface d’administration permettant à des petites entreprises de **configurer et piloter leurs tâches automatisées** (via AWS Lambda) via un formulaire simple et sécurisé.

---

## 🚀 Stack technique

- [Next.js](https://nextjs.org/)
- [TailwindCSS](https://tailwindcss.com/)
- [Shadcn UI](https://ui.shadcn.com/)
- [AWS Amplify Hosting](https://docs.amplify.aws/)
- [Amazon Cognito](https://docs.aws.amazon.com/cognito/) pour l’authentification
- Communication avec l’API via **API Gateway + Lambda**

---

## 🔐 Authentification

L’application utilise **Amazon Cognito** :
- Connexion via formulaire personnalisé ou Hosted UI
- Authentification via **JWT**, stocké dans `localStorage` ou `cookie` sécurisé
- Le token est automatiquement utilisé pour authentifier les appels à l’API Gateway

---

## 📂 Structure du projet

apps/
└── frontend/
├── app/ # Routing Next.js App Router
├── components/ # Composants UI (Shadcn + customs)
├── lib/ # Fonctions d’appel API, auth, etc.
├── pages/ # (si utilisation de Pages Router)
├── styles/ # Fichier Tailwind config
└── .env.local # Variables d’environnement

---

## ⚙️ Variables d’environnement (`.env.local`)

```env
NEXT_PUBLIC_API_URL=https://<your-api-id>.execute-api.<region>.amazonaws.com/prod
NEXT_PUBLIC_COGNITO_USER_POOL_ID=eu-west-1_XXXXXXX
NEXT_PUBLIC_COGNITO_CLIENT_ID=XXXXXXXXXXXXXX
NEXT_PUBLIC_COGNITO_REGION=eu-west-1

## 📦 Installation

# 1. Cloner le repo
git clone https://github.com/ton-org/console-pme-front.git
cd console-pme-front

# 2. Installer les dépendances
pnpm install

# 3. Lancer en développement
pnpm dev

## 📤 Déploiement

### Option 1 : avec AWS Amplify
Connecte ton dépôt GitHub à AWS Amplify

Renseigne les variables d’environnement dans le dashboard Amplify

Amplify s’occupe de la build, du hosting et du cache

### Option 2 : auto-hébergé sur EC2 ou autre
Build : npm build
Lancer en prod : npm start

## ✨ Fonctionnalités prévues

- 🔐 Connexion / Déconnexion via Cognito
- 📄 Affichage des Lambdas disponibles
- 📝 Formulaire dynamique de configuration (clé / valeur)
- 💾 Enregistrement des paramètres via appel REST API (AWS Gateway + Lambda)
- ✅ Retour utilisateur (toast / alert)
- 📊 Logs d’activité (future version)

## 🧪 Tests
À venir : tests unitaires via Playwright ou Jest

## 🧠 Auteur
Développé par Cedric Renouleau pour un outil d’aide à l’automatisation des PME.# sunset-lambda-back-office
