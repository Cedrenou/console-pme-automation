"use client";
import { useEffect, useState } from "react";
import { createClient } from "./client";

// Rôles applicatifs. Ajouter ici quand on étend la RBAC.
export type UserRole = "admin" | "comptable";

// Lit le rôle depuis Supabase. Le rôle est stocké dans `app_metadata.role` plutôt que
// `user_metadata.role` parce que app_metadata n'est pas modifiable par l'utilisateur
// (seulement par l'API admin / Dashboard) — un comptable ne peut donc pas s'auto-promouvoir.
// Default = "admin" pour ne pas restreindre les comptes existants qui n'ont pas encore
// leur rôle explicite renseigné.
export function useUserRole(): { role: UserRole; loading: boolean } {
  const [role, setRole] = useState<UserRole>("admin");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const supabase = createClient();
    let cancelled = false;
    const apply = (raw: unknown) => {
      const r = raw === "comptable" ? "comptable" : "admin";
      if (!cancelled) setRole(r);
    };
    supabase.auth.getUser().then(({ data }) => {
      apply(data.user?.app_metadata?.role);
      if (!cancelled) setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      apply(session?.user?.app_metadata?.role);
    });
    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, []);

  return { role, loading };
}
