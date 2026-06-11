# 🚀 Configuration AWS Amplify

Le cockpit est hébergé sur **deux apps Amplify distinctes** (région `eu-west-3`,
compte AWS Sunset, profil CLI `sunset`). Une app = une branche = un environnement.

| App | App ID | Branche | URL | API Gateway |
|---|---|---|---|---|
| `console-pme-automation-prod` | `d2x6hnbsxh6apq` | `main` | https://cockpit.sunsetridershop.com | stage `prod` |
| `console-pme-automation-dev` | `d40n9ewnxexgk` | `dev` | https://dev.d40n9ewnxexgk.amplifyapp.com | stage `dev` |

Chaque push sur la branche déclenche automatiquement le build (`amplify.yml`).

## Variables d'environnement (niveau app, console Amplify)

Communes aux deux apps :
- `NEXT_PUBLIC_API_URL` — URL API Gateway, **seul le stage diffère** (`/prod` vs `/dev`)
- `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` — projet Supabase partagé
- `NEXT_PUBLIC_S3_BUCKET` — `sunset-rider`

Prod uniquement :
- `SHOPIFY_MIDDLEWARE_URL` / `SHOPIFY_MIDDLEWARE_ADMIN_PASSWORD` — proxys server-side
  vers le middleware Rezomatic. Volontairement absents en dev : les routes
  `/api/shopify-*` y répondent une erreur propre au lieu d'écrire sur Shopify.

## Isolation des données en dev

L'app dev pointe sur le stage `dev` de l'API Gateway `ConsolePMEApi` (`l4jr2s7xn4`).
Les Lambdas (partagées entre les deux stages) lisent `event.requestContext.stage` :
appelées via `dev`, elles basculent sur `ClientLambdas-dev` / `VintedEvents-dev`
(copies seedées de la prod). `csv-to-shopify` passe en dry-run (aucune mutation
Shopify) et les cartes Trello de feedback sont préfixées `[DEV]`.

## Inspecter / modifier

```bash
aws amplify list-apps --region eu-west-3 --profile sunset
aws amplify get-app --app-id <appId> --region eu-west-3 --profile sunset
aws amplify update-app --app-id <appId> --environment-variables KEY=value,... \
  --region eu-west-3 --profile sunset
```
