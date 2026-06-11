"use client";
import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import {
  FaCogs, FaUserCircle, FaChartLine, FaShoppingBag, FaShoppingCart, FaSignOutAlt, FaFileInvoiceDollar, FaUsers, FaBars, FaTimes, FaStore, FaImages, FaMagic, FaBoxOpen, FaPenNib,
} from "react-icons/fa";
import { createClient } from "@/utils/supabase/client";
import { useUserRole, type UserRole } from "@/utils/supabase/useUserRole";
import FeedbackButton from "./FeedbackButton";

type LinkDef = { href: string; label: string; icon: React.ReactNode; roles?: UserRole[] };

// Badge d'environnement : "MOCK" sans API (fixtures locales, cf. shouldUseMock),
// "DEV" sur le stage dev de l'API Gateway, rien en prod. Les NEXT_PUBLIC_* sont
// inlinées au build, le badge reflète donc l'app déployée, pas le navigateur.
const ENV_BADGE = (() => {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL;
  if (process.env.NEXT_PUBLIC_ENVIRONMENT === "development" || !apiUrl) return "MOCK";
  if (apiUrl.endsWith("/dev")) return "DEV";
  return null;
})();

// Sans `roles`, le lien est visible pour tous. Le rôle "comptable" ne voit que /compta.
const links: LinkDef[] = [
  { href: "/", label: "Cockpit Vinted", icon: <FaChartLine />, roles: ["admin"] },
  { href: "/vinted-ventes", label: "Ventes", icon: <FaShoppingBag />, roles: ["admin"] },
  { href: "/vinted-achats", label: "Achats Vinted", icon: <FaShoppingCart />, roles: ["admin"] },
  { href: "/vinted-annonces", label: "Générer annonces Vinted", icon: <FaPenNib />, roles: ["admin"] },
  { href: "/clients", label: "Clients", icon: <FaUsers />, roles: ["admin"] },
  { href: "/compta", label: "Compta", icon: <FaFileInvoiceDollar /> },
  { href: "/shopify-import-complet", label: "Import complet Shopify", icon: <FaBoxOpen />, roles: ["admin"] },
  { href: "/shopify-catalogue", label: "Import Catalogue Shopify", icon: <FaStore />, roles: ["admin"] },
  { href: "/shopify-photos", label: "Import Photos Shopify", icon: <FaImages />, roles: ["admin"] },
  { href: "/shopify-enrichir", label: "Enrichir descriptions Shopify", icon: <FaMagic />, roles: ["admin"] },
  { href: "/automatisations", label: "Automatisations", icon: <FaCogs />, roles: ["admin"] },
];

const Sidebar = () => {
  const router = useRouter();
  const pathname = usePathname();
  const [email, setEmail] = useState<string | null>(null);
  const [signingOut, setSigningOut] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const { role } = useUserRole();
  const visibleLinks = links.filter(l => !l.roles || l.roles.includes(role));

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }) => setEmail(data.user?.email ?? null));
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setEmail(session?.user?.email ?? null);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  // Ferme le drawer mobile au changement de page (sinon il reste ouvert quand on clique
  // un lien et on perd le fil sur ce qui s'affiche).
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  const handleSignOut = async () => {
    setSigningOut(true);
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  };

  return (
    <>
      {/* Bouton hamburger — visible uniquement sur mobile (md:hidden). Position fixed
          top-left avec un fond semi-transparent pour rester lisible sur tout contenu. */}
      <button
        type="button"
        onClick={() => setMobileOpen(true)}
        aria-label="Ouvrir le menu"
        className="md:hidden fixed top-3 left-3 z-30 p-2.5 rounded-lg bg-[#181C2A]/90 backdrop-blur text-white shadow-lg hover:bg-[#23263A] transition-colors"
      >
        <FaBars className="text-lg" />
      </button>

      {/* Backdrop quand le drawer est ouvert */}
      {mobileOpen && (
        <div
          onClick={() => setMobileOpen(false)}
          className="md:hidden fixed inset-0 bg-black/60 z-40"
          aria-hidden="true"
        />
      )}

      {/* Sidebar elle-même : drawer slide-in sur mobile, sticky en flow sur desktop.
          fixed + transition sur mobile, md:sticky + md:translate-x-0 sur desktop pour
          la remettre dans le flux flex parent. */}
      <nav
        className={`
          w-64 bg-[#181C2A] text-white h-screen flex flex-col justify-between shadow-lg overflow-y-auto z-50
          fixed top-0 left-0 transition-transform duration-300
          ${mobileOpen ? "translate-x-0" : "-translate-x-full"}
          md:sticky md:translate-x-0
        `}
      >
        <div>
          <div className="flex items-center justify-between text-2xl font-bold px-6 py-6 md:py-8">
            <div className="flex items-center gap-2">
              <span className={`inline-block w-3 h-3 rounded-full mr-2 ${ENV_BADGE ? "bg-amber-400" : "bg-blue-500"}`}></span>
              Sunset
              {ENV_BADGE && (
                <span className="bg-amber-500/20 text-amber-300 border border-amber-400/40 text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded font-semibold">
                  {ENV_BADGE}
                </span>
              )}
            </div>
            {/* Bouton fermer dans le drawer mobile */}
            <button
              type="button"
              onClick={() => setMobileOpen(false)}
              aria-label="Fermer le menu"
              className="md:hidden p-1.5 rounded-md text-gray-400 hover:text-white hover:bg-[#23263A] transition-colors"
            >
              <FaTimes className="text-base" />
            </button>
          </div>
          <ul className="flex flex-col gap-1 px-2">
            {visibleLinks.map(link => (
              <li key={link.href}>
                <Link
                  href={link.href}
                  className="flex items-center gap-3 px-4 py-2 rounded-lg hover:bg-blue-600/80 transition-colors text-gray-200 font-medium focus:bg-blue-700 focus:outline-none"
                >
                  <span className="text-lg">{link.icon}</span>
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>
        <div className="px-4 pb-6 flex flex-col gap-2">
          {email && (
            <div className="flex items-center gap-3 px-2 py-3 rounded-lg bg-[#23263A]">
              <FaUserCircle className="text-2xl text-blue-400 flex-shrink-0" />
              <div className="min-w-0 flex-1">
                <div className="font-semibold text-sm truncate" title={email}>
                  {email}
                </div>
                <div className="text-xs text-gray-400 flex items-center gap-2">
                  <span>Sunset Rider</span>
                  {role === "comptable" && (
                    <span className="bg-purple-600/30 text-purple-300 text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded font-semibold">
                      Comptable
                    </span>
                  )}
                </div>
              </div>
            </div>
          )}
          <FeedbackButton />
          <button
            type="button"
            onClick={handleSignOut}
            disabled={signingOut}
            className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-gray-300 hover:bg-red-600/20 hover:text-red-300 transition-colors disabled:opacity-50"
          >
            <FaSignOutAlt />
            {signingOut ? "Déconnexion…" : "Se déconnecter"}
          </button>
        </div>
      </nav>
    </>
  );
};

export default Sidebar;
