import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/utils/supabase/server";

// Route handler appelé par Supabase après que l'utilisateur a cliqué le magic link.
// Échange le code contre une session, puis redirige vers ?next= ou /.
export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const next = url.searchParams.get("next") ?? "/";

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(new URL(next, url.origin));
    }
  }

  // Échec : retour login avec marqueur d'erreur
  return NextResponse.redirect(new URL("/login?error=auth", url.origin));
}
