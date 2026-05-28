import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";

/**
 * POST /api/shopify-photos
 *
 * Proxy server-side vers le middleware Rezomatic-Shopify pour l'upload d'une
 * photo produit. Reçoit { sku, filename, contentBase64 } du cockpit (page
 * /shopify-photos), forwarde vers `/api/admin/photos/upload` du middleware
 * avec le bearer admin (jamais exposé au client).
 *
 * 1 image = 1 requête : le cockpit boucle en séquentiel pour afficher une
 * barre de progression et éviter d'exploser un seul gros payload.
 *
 * Auth Supabase déjà appliquée par `src/middleware.ts`, revérifiée ici.
 */
export async function POST(request: NextRequest) {
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

  let body: { sku?: string; filename?: string; contentBase64?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Body JSON invalide" }, { status: 400 });
  }

  const { sku, filename, contentBase64 } = body;
  if (!sku || !filename || !contentBase64) {
    return NextResponse.json(
      { error: "sku, filename et contentBase64 sont requis" },
      { status: 400 }
    );
  }

  try {
    const res = await fetch(`${middlewareUrl}/api/admin/photos/upload`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${adminPassword}`,
      },
      body: JSON.stringify({ sku, filename, contentBase64 }),
    });
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Erreur inconnue";
    console.error("Shopify photos proxy error:", message);
    return NextResponse.json(
      { error: `Erreur de communication avec le middleware: ${message}` },
      { status: 502 }
    );
  }
}

// Next.js App Router : route handlers ont une limite implicite sur body
// taille. On reste serverless-friendly en envoyant 1 image à la fois (~33Mo
// base64 max), bien sous la limite par défaut de 4.5Mo de Vercel et 6Mo de
// Lambda — Amplify SSR utilise Lambda. Si Yann uploade des photos brutes
// smartphone, il faudra soit redimensionner côté client, soit basculer ce
// upload sur S3 presigned. Pour l'instant on parie sur des photos déjà
// compressées (cas standard de réception Sunset).
export const maxDuration = 60;
