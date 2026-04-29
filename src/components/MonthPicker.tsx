"use client";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { FaCalendarAlt, FaChevronLeft, FaChevronRight, FaChevronDown } from "react-icons/fa";
import { currentMonthValue } from "@/lib/months";

type Props = {
  value: string; // "YYYY-MM" ou "" si aucun mois sélectionné (cas où un préréglage de période est actif)
  onChange: (v: string) => void;
  options: { value: string; label: string }[]; // mois disponibles, du plus récent au plus ancien
  placeholder?: string; // libellé affiché quand value est vide
};

const SHORT_MONTHS = ["Jan", "Fév", "Mar", "Avr", "Mai", "Juin", "Juil", "Août", "Sep", "Oct", "Nov", "Déc"];

export const MonthPicker: React.FC<Props> = ({ value, onChange, options, placeholder = "Choisir un mois…" }) => {
  const [open, setOpen] = useState(false);
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);

  // Année initialement affichée dans le popover : celle du mois sélectionné, sinon
  // l'année courante (cas value vide, p. ex. quand un préréglage 30j est actif).
  const [viewYear, setViewYear] = useState<number>(() =>
    value ? parseInt(value.split("-")[0], 10) : new Date().getFullYear()
  );

  useEffect(() => {
    if (value) setViewYear(parseInt(value.split("-")[0], 10));
  }, [value]);

  // Ferme au clic en dehors / sur Escape
  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        popoverRef.current && !popoverRef.current.contains(target) &&
        buttonRef.current && !buttonRef.current.contains(target)
      ) {
        setOpen(false);
      }
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKey);
    };
  }, [open]);

  const availableSet = useMemo(() => new Set(options.map(o => o.value)), [options]);
  const minYear = useMemo(
    () => options.reduce((min, o) => Math.min(min, parseInt(o.value.split("-")[0], 10)), Infinity),
    [options]
  );
  const maxYear = useMemo(
    () => options.reduce((max, o) => Math.max(max, parseInt(o.value.split("-")[0], 10)), -Infinity),
    [options]
  );

  const selectedLabel = value ? (options.find(o => o.value === value)?.label ?? value) : placeholder;
  const todayMonth = currentMonthValue();
  const hasValue = value !== "";

  const handleSelect = (v: string) => {
    onChange(v);
    setOpen(false);
  };

  return (
    <div className="relative">
      <button
        type="button"
        ref={buttonRef}
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
        aria-haspopup="dialog"
        className={`cursor-pointer inline-flex items-center gap-2 px-4 py-2 rounded-lg font-semibold transition-colors text-sm shadow-sm ${
          hasValue
            ? "bg-blue-600 hover:bg-blue-700 text-white"
            : "bg-[#23263A] hover:bg-[#2c3048] text-gray-300"
        }`}
      >
        <FaCalendarAlt className="text-sm opacity-80" />
        <span className="capitalize">{selectedLabel}</span>
        <FaChevronDown className={`text-xs transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div
          ref={popoverRef}
          role="dialog"
          aria-label="Sélecteur de mois"
          className="absolute right-0 mt-2 z-50 w-72 bg-[#1c1f2e] border border-[#2c3048] rounded-xl shadow-2xl p-3"
        >
          <div className="flex items-center justify-between mb-3">
            <button
              type="button"
              onClick={() => setViewYear(y => y - 1)}
              disabled={viewYear <= minYear}
              aria-label="Année précédente"
              className="cursor-pointer p-1.5 rounded-md text-gray-400 hover:text-white hover:bg-[#2c3048] disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              <FaChevronLeft className="text-xs" />
            </button>
            <span className="text-base font-bold text-white tabular-nums">{viewYear}</span>
            <button
              type="button"
              onClick={() => setViewYear(y => y + 1)}
              disabled={viewYear >= maxYear}
              aria-label="Année suivante"
              className="cursor-pointer p-1.5 rounded-md text-gray-400 hover:text-white hover:bg-[#2c3048] disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              <FaChevronRight className="text-xs" />
            </button>
          </div>

          <div className="grid grid-cols-3 gap-1.5">
            {SHORT_MONTHS.map((label, idx) => {
              const monthValue = `${viewYear}-${String(idx + 1).padStart(2, "0")}`;
              const isSelected = monthValue === value;
              const isAvailable = availableSet.has(monthValue);
              const isCurrent = monthValue === todayMonth;
              const baseClass = "px-2 py-2 rounded-md text-sm font-semibold transition-colors";
              if (!isAvailable) {
                return (
                  <span
                    key={label}
                    className={`${baseClass} text-gray-600 cursor-not-allowed bg-transparent`}
                    aria-disabled="true"
                  >
                    {label}
                  </span>
                );
              }
              return (
                <button
                  key={label}
                  type="button"
                  onClick={() => handleSelect(monthValue)}
                  className={`${baseClass} cursor-pointer ${
                    isSelected
                      ? "bg-blue-600 text-white shadow"
                      : isCurrent
                      ? "bg-[#23263A] text-blue-300 ring-1 ring-blue-500/40 hover:bg-[#2c3048]"
                      : "bg-[#23263A] text-gray-300 hover:bg-[#2c3048] hover:text-white"
                  }`}
                  aria-pressed={isSelected}
                  title={isCurrent ? "Mois courant" : undefined}
                >
                  {label}
                </button>
              );
            })}
          </div>

          <div className="mt-3 pt-3 border-t border-[#2c3048] flex justify-between gap-2">
            <button
              type="button"
              onClick={() => handleSelect(todayMonth)}
              className="cursor-pointer flex-1 px-3 py-1.5 rounded-md text-xs font-semibold bg-[#23263A] text-gray-300 hover:bg-[#2c3048] hover:text-white transition-colors"
            >
              Mois courant
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="cursor-pointer px-3 py-1.5 rounded-md text-xs font-semibold text-gray-400 hover:text-white transition-colors"
            >
              Fermer
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
