"use client";
import React from "react";
import { FaCalendarAlt, FaChevronDown } from "react-icons/fa";

type Props<T extends string> = {
  value: T | "";
  onChange: (v: T) => void;
  options: { id: T; label: string }[];
  /** Affichage forcé inactif (ex. quand le filtre mois précis est actif). Le select
   *  passe en gris pour signaler que la période preset n'est pas sélectionnée. */
  inactive?: boolean;
  /** Visible uniquement sur mobile (md:hidden). Sur desktop on garde la rangée
   *  de boutons preset à côté de chaque page pour un accès rapide. */
  className?: string;
};

// Select natif "déguisé" pour matcher le style du MonthPicker : appearance-none + icônes
// custom (calendrier à gauche, chevron à droite). Le menu déroulant reste celui du browser
// — sur mobile c'est un picker natif fluide, sur desktop la version boutons est préférée
// donc on utilise généralement ce composant en md:hidden.
export const PeriodSelect = <T extends string>({ value, onChange, options, inactive, className }: Props<T>) => {
  return (
    <div className={`relative ${className ?? ""}`}>
      <FaCalendarAlt className="absolute left-3 top-1/2 -translate-y-1/2 text-sm pointer-events-none opacity-80" />
      <select
        value={value}
        onChange={e => onChange(e.target.value as T)}
        aria-label="Filtre période"
        className={`appearance-none cursor-pointer pl-9 pr-9 py-2 rounded-lg font-semibold text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-sm ${
          inactive
            ? "bg-[#23263A] text-gray-300 hover:bg-[#2c3048]"
            : "bg-blue-600 hover:bg-blue-700 text-white"
        }`}
      >
        {inactive && <option value="">— Période —</option>}
        {options.map(o => (
          <option key={o.id} value={o.id}>{o.label}</option>
        ))}
      </select>
      <FaChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 text-xs pointer-events-none opacity-80" />
    </div>
  );
};
