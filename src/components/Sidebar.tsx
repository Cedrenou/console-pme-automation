"use client";
import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  FaCogs, FaFileAlt, FaUserCircle, FaChartLine, FaShoppingBag, FaSignOutAlt,
} from "react-icons/fa";
import { createClient } from "@/utils/supabase/client";

const links = [
  { href: "/", label: "Cockpit Vinted", icon: <FaChartLine /> },
  { href: "/vinted-ventes", label: "Ventes Vinted", icon: <FaShoppingBag /> },
  { href: "/renouvellement-annonces", label: "Renouvellement Annonces", icon: <FaFileAlt /> },
  { href: "/automatisations", label: "Automatisations", icon: <FaCogs /> },
];

const Sidebar = () => {
  const router = useRouter();
  const [email, setEmail] = useState<string | null>(null);
  const [signingOut, setSigningOut] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }) => setEmail(data.user?.email ?? null));
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setEmail(session?.user?.email ?? null);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const handleSignOut = async () => {
    setSigningOut(true);
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  };

  return (
    <nav className="w-64 bg-[#181C2A] text-white min-h-screen flex flex-col justify-between shadow-lg">
      <div>
        <div className="flex items-center gap-2 text-2xl font-bold px-6 py-8">
          <span className="inline-block w-3 h-3 bg-blue-500 rounded-full mr-2"></span>
          Client Lambdas
        </div>
        <ul className="flex flex-col gap-1 px-2">
          {links.map(link => (
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
            <div className="min-w-0">
              <div className="font-semibold text-sm truncate" title={email}>
                {email}
              </div>
              <div className="text-xs text-gray-400">Sunset Rider</div>
            </div>
          </div>
        )}
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
  );
};

export default Sidebar;
