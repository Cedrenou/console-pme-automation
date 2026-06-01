import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";

/**
 * Le refresh global itère ~400 SKU côté middleware (batch de 50 en
 * parallèle). On laisse jusqu'à 5 min à la fonction pour répondre, sinon
 * Amplify/Lambda couperait la requête longue avant la fin du traitement.
 */
export const maxDuration = 300;

/**
 * POST /api/shopify-stock-refresh
 *
 * Proxy server-side vers le middleware Rezomatic-Shopify. Déclenche le
 * rafraîchissement du stock de TOUS les SKU connus (route middleware
 * `/api/sync/stock/refresh-all`), équivalent batch du stock-on-view.
 *
 * Pas de body attendu. Auth Supabase vérifiée. ADMIN_PASSWORD reste
 * server-side (env var, jamais exposé au client).
 */
export async function POST() {
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

  try {
    const res = await fetch(`${middlewareUrl}/api/sync/stock/refresh-all`, {
      method: "POST",
      headers: { Authorization: `Bearer ${adminPassword}` },
    });
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Erreur inconnue";
    console.error("Shopify stock refresh proxy error:", message);
    return NextResponse.json(
      { error: `Erreur de communication avec le middleware: ${message}` },
      { status: 502 }
    );
  }
}
