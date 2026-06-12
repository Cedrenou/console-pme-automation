"use client";
import React, { useEffect, useState } from "react";
import { FaMoon, FaSun, FaMotorcycle } from "react-icons/fa";

// Doit rester aligné avec les blocs [data-theme=…] de globals.css et le script
// anti-flash du layout. "dark" = défaut historique → pas d'attribut data-theme.
export type ThemeId = "dark" | "light" | "sunset";
const STORAGE_KEY = "cockpit-theme";

const THEMES: { id: ThemeId; label: string; icon: React.ReactNode }[] = [
  { id: "dark", label: "Sombre", icon: <FaMoon /> },
  { id: "light", label: "Clair", icon: <FaSun /> },
  { id: "sunset", label: "Sunset", icon: <FaMotorcycle /> },
];

function applyTheme(theme: ThemeId) {
  if (theme === "dark") {
    document.documentElement.removeAttribute("data-theme");
  } else {
    document.documentElement.setAttribute("data-theme", theme);
  }
}

const ThemeSwitcher = () => {
  // null tant qu'on n'a pas lu localStorage (évite un mismatch d'hydratation :
  // le serveur ne connaît pas le thème, on ne rend l'état actif qu'au mount).
  const [theme, setTheme] = useState<ThemeId | null>(null);

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    setTheme(stored === "light" || stored === "sunset" ? stored : "dark");
  }, []);

  const select = (id: ThemeId) => {
    setTheme(id);
    applyTheme(id);
    try {
      localStorage.setItem(STORAGE_KEY, id);
    } catch {
      /* navigation privée : le thème ne survivra pas au reload, tant pis */
    }
  };

  return (
    <div className="flex rounded-lg bg-card-2 p-1 gap-1" role="group" aria-label="Thème de l'interface">
      {THEMES.map(t => (
        <button
          key={t.id}
          type="button"
          onClick={() => select(t.id)}
          title={`Thème ${t.label}`}
          aria-pressed={theme === t.id}
          className={`flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-md text-xs font-medium transition-colors ${
            theme === t.id
              ? "bg-blue-600 text-white shadow"
              : "text-gray-400 hover:text-fg hover:bg-edge"
          }`}
        >
          {t.icon}
          <span className="hidden md:inline">{t.label}</span>
        </button>
      ))}
    </div>
  );
};

export default ThemeSwitcher;
