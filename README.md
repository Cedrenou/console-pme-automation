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

Deux environnements, deux branches, deux apps Amplify :

- **`main`** → **Production** (app Amplify `console-pme-automation-prod`)
  - URL : `https://cockpit.sunsetridershop.com`
  - API : API Gateway stage `prod` → données réelles
  
- **`dev`** → **Développement** (app Amplify `console-pme-automation-dev`)
  - URL : `https://dev.d40n9ewnxexgk.amplifyapp.com`
  - API : API Gateway stage `dev` → tables DynamoDB `ClientLambdas-dev` / `VintedEvents-dev`
    (copies de la prod, isolées : aucune écriture ne touche les vraies données)

### **Workflow de développement :**

1. Développer sur `dev` (commits directs) — chaque push déploie l'app Amplify dev
2. Valider sur l'URL dev
3. Déployer en prod : `git checkout main && git merge dev && git push origin main`

L'isolation des données est faite côté Lambdas : les fonctions lisent
`event.requestContext.stage` et basculent sur les tables `-dev` quand elles sont
appelées via le stage `dev`. La Lambda `csv-to-shopify` passe en dry-run en dev
(aucune mutation Shopify) et les routes proxy `/api/shopify-*` répondent une
erreur propre en dev (pas de `SHOPIFY_MIDDLEWARE_*` configuré sur l'app dev).

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
└── .env.local # Variables d'environnement (développement local uniquement)
```

---

## ⚙️ Variables d'environnement

### **Développement local (`.env.local`)**
```env
# Stage dev de l'API Gateway → données isolées (tables -dev)
NEXT_PUBLIC_API_URL=https://l4jr2s7xn4.execute-api.eu-west-3.amazonaws.com/dev
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
```
Sans `NEXT_PUBLIC_API_URL` (ou avec `NEXT_PUBLIC_ENVIRONMENT=development`),
l'app bascule sur les mocks (`src/lib/*.mock.ts`).

### **Dev et Production (AWS Amplify)**
Les variables sont configurées au niveau de chaque app Amplify :
- `NEXT_PUBLIC_API_URL` : URL de l'API Gateway (stage `dev` ou `prod`)
- `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` : auth (projet partagé)
- `NEXT_PUBLIC_S3_BUCKET` : bucket images
- `SHOPIFY_MIDDLEWARE_URL` / `SHOPIFY_MIDDLEWARE_ADMIN_PASSWORD` : **prod uniquement**
  (proxys server-side vers le middleware Rezomatic — absents en dev pour bloquer
  les écritures Shopify)

## 📦 Installation

# 1. Cloner le repo
git clone https://github.com/Cedrenou/console-pme-automation.git
cd console-pme-automation

# 2. Installer les dépendances
pnpm install

# 3. Lancer en développement
pnpm dev

## 📤 Déploiement

### **AWS Amplify**
Deux apps Amplify distinctes (région `eu-west-3`, profil CLI `sunset`) :
- `console-pme-automation-prod` (`d2x6hnbsxh6apq`) — branche `main`, build auto
- `console-pme-automation-dev` (`d40n9ewnxexgk`) — branche `dev`, build auto

Les variables d'environnement sont gérées au niveau app dans la console Amplify.

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
