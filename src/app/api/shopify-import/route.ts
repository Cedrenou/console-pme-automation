import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";

/**
 * POST /api/shopify-import
 *
 * Proxy server-side vers le middleware Rezomatic-Shopify. Reçoit une liste
 * de SKUs depuis le cockpit (typiquement extraite d'un CSV de réception
 * fournisseur uploadé par Yann), et déclenche la création/maj des produits
 * Shopify correspondants.
 *
 * L'auth Supabase est déjà appliquée par le middleware Next.js global
 * (`src/middleware.ts`). On revérifie ici par sécurité.
 *
 * Le mot de passe admin du middleware reste server-side (env var
 * `SHOPIFY_MIDDLEWARE_ADMIN_PASSWORD`, jamais exposé au client).
 */
export async function POST(request: NextRequest) {
  // Vérif auth Supabase
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }

  const middlewareUrl = process.env.SHOPIFY_MIDDLEWARE_URL;
  const adminPassword = process.env.SHOPIFY_MIDDLEWARE_ADMIN_PASSWORD;
  if (!middlewareUrl || !adminPassword) {
    return NextResponse.json(
      { error: "Configuration middleware Shopify manquante côté cockpit" },
      { status: 500 }
    );
  }

  let body: { skus?: string[] };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Body JSON invalide" }, { status: 400 });
  }

  const skus = body.skus;
  if (!Array.isArray(skus) || skus.length === 0) {
    return NextResponse.json({ error: "skus doit être un tableau non vide" }, { status: 400 });
  }
  if (skus.length > 500) {
    return NextResponse.json({ error: "Maximum 500 SKUs par import" }, { status: 400 });
  }

  try {
    const res = await fetch(`${middlewareUrl}/api/sync/catalog/batch`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${adminPassword}`,
      },
      body: JSON.stringify({ skus }),
    });
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Erreur inconnue";
    console.error("Shopify import proxy error:", message);
    return NextResponse.json(
      { error: `Erreur de communication avec le middleware: ${message}` },
      { status: 502 }
    );
  }
}
