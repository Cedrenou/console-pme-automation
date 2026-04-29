import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const PUBLIC_PATHS = ["/login", "/auth/callback"];

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  const { data: { user } } = await supabase.auth.getUser();
  const pathname = request.nextUrl.pathname;
  const isPublic = PUBLIC_PATHS.some(p => pathname === p || pathname.startsWith(p + "/"));

  // Pas connecté + page protégée → redirection vers /login
  if (!user && !isPublic) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Connecté + sur /login → redirection vers la home (compta si rôle comptable)
  if (user && pathname === "/login") {
    const homeUrl = request.nextUrl.clone();
    homeUrl.pathname = user.app_metadata?.role === "comptable" ? "/compta" : "/";
    return NextResponse.redirect(homeUrl);
  }

  // RBAC : un comptable ne peut accéder qu'à /compta. Toute autre route protégée
  // est redirigée vers /compta. Le frontend cache déjà les liens dans la sidebar,
  // mais le middleware empêche aussi un accès direct par URL.
  if (user && user.app_metadata?.role === "comptable") {
    const isCompta = pathname === "/compta" || pathname.startsWith("/compta/");
    if (!isCompta && !isPublic) {
      const comptaUrl = request.nextUrl.clone();
      comptaUrl.pathname = "/compta";
      comptaUrl.search = "";
      return NextResponse.redirect(comptaUrl);
    }
  }

  return supabaseResponse;
}
