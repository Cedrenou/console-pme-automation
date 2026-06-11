# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

- `npm run dev` — Next.js dev server (with Turbopack)
- `npm run build` — production build
- `npm run start` — serve production build
- `npm run lint` — Next lint (note: `eslint.config.mjs` currently ignores `**/*`, so lint is a no-op)

There is no test runner configured yet (tests are marked "À venir" in the README).

## Architecture

Next.js 15 App Router frontend (React 19, TypeScript, Tailwind 4) that acts as an admin console for small-business Lambda automations. The UI talks to AWS services exclusively through an API Gateway; there is no backend in this repo.

### Request flow

All API calls live in `src/lib/api.ts` and go through two uniform helpers:

1. `shouldUseMock()` — returns `true` when `NEXT_PUBLIC_ENVIRONMENT === 'development'` or when `NEXT_PUBLIC_API_URL` is unset. Mock branches use fixtures in `src/lib/lambdas.mock.ts` and `src/lib/s3.mock.ts` and simulate latency. Always preserve this mock fallback when adding new endpoints — the app must remain runnable without a live API.
2. `parseApiResponse<T>()` — API Gateway Lambda-proxy responses arrive wrapped as `{ statusCode, headers, body }` where `body` is a JSON string. This helper unwraps and parses it; the `downloadImageBatch` flow does the same thing inline because it also handles the "direct response" shape. When you add an endpoint, route its response through `parseApiResponse` (or the inline pattern) rather than calling `res.json()` directly.

`fetchImageBatches` additionally normalizes the `{ "folders": ["path/..."] }` shape into `ImageBatch[]` via `transformFoldersResponse` (extracts the last path segment as `batchId`). `downloadImageBatch` expects the Lambda to return a presigned S3 URL and performs a browser redirect (`window.location.href = downloadUrl`) — this intentionally bypasses CORS and avoids buffering large ZIPs through the browser.

The `clientA` client id is currently hardcoded in lambda URLs with a `TODO` to wire it up from auth context.

### Routes

- `src/app/page.tsx` — dashboard, lists available lambdas
- `src/app/lambdas/[id]/page.tsx` — dynamic lambda configuration form
- `src/app/renouvellement-annonces/page.tsx` — S3 image-batch browser + ZIP download
- `src/app/layout.tsx` — shared shell with `Sidebar` and `PageLoader`; sidebar links are defined statically in `src/components/Sidebar.tsx` (add new routes there)

Path alias `@/*` → `src/*` is configured in `tsconfig.json`.

## Environments & deployment

Two environments, two Amplify apps (env vars managed at app level in the Amplify console):

- `main` → production: app `console-pme-automation-prod` (`d2x6hnbsxh6apq`), `https://cockpit.sunsetridershop.com`, API Gateway stage `prod` (real data).
- `dev` → development: app `console-pme-automation-dev` (`d40n9ewnxexgk`), `https://dev.d40n9ewnxexgk.amplifyapp.com`, API Gateway stage `dev`.

Data isolation is implemented in the Lambdas, not the front: each cockpit Lambda reads `event.requestContext.stage` and switches to the `ClientLambdas-dev` / `VintedEvents-dev` DynamoDB tables when called through the `dev` stage. `csv-to-shopify` runs dry-run in dev (no Shopify mutation); the `/api/shopify-*` Next proxy routes fail cleanly in dev because `SHOPIFY_MIDDLEWARE_*` is only set on the prod app. Writes from the dev environment never touch production data.

`.env.local` is for local dev; point `NEXT_PUBLIC_API_URL` at the `dev` stage to hit isolated data, or unset it to use mocks.

Key env vars:
- `NEXT_PUBLIC_API_URL` — API Gateway base URL (stage `dev` or `prod`)
- `NEXT_PUBLIC_ENVIRONMENT` — `development` forces mocks
- `NEXT_PUBLIC_S3_BUCKET` — bucket used by `downloadImageBatch` (defaults to `sunset-s3`)
- `SHOPIFY_MIDDLEWARE_URL` / `SHOPIFY_MIDDLEWARE_ADMIN_PASSWORD` — prod app only (server-side proxies to the Rezomatic middleware)

## Git workflow

Day-to-day work happens on `dev` (direct commits, each push auto-deploys the dev Amplify app). Promote to prod by merging `dev` into `main` and pushing. The old `develop → staging → main` flow and `scripts/git-workflow.sh` are gone.

## Reference docs in-repo

- `API_GATEWAY_SPEC.md` — target Lambda/API Gateway contracts (Python handlers + Terraform)
- `GUIDE_AWS_CONSOLE.md`, `docs/AMPLIFY_SETUP.md` — AWS setup walkthroughs
- `FIX_CORS.md`, `docs/DEBUG_ZIP_VIDE.md`, `docs/BRANCHER_LAMBDA_DOWNLOAD.md` — incident/debug notes for the S3 download flow (read these before touching `downloadImageBatch` or its Lambda)

## Code style (from `.cursor/rules/cursor-rules.mdc`)

- Tailwind classes only for styling — no separate CSS.
- Use `const` arrow functions with explicit types where possible; event handlers named `handleClick`, `handleKeyDown`, etc.
- Prefer early returns.
- Include accessibility attributes (`tabindex`, `aria-label`, keyboard handlers) on interactive elements.
