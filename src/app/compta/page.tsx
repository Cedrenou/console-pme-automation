"use client";
import React, { Suspense } from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { FaShoppingCart, FaRocket, FaUndo, FaImage, FaExchangeAlt } from "react-icons/fa";
import { MONTH_OPTIONS, currentMonthValue } from "./utils";
import { MonthPicker } from "./MonthPicker";
import { ComptaAchatsTab } from "./ComptaAchatsTab";
import { ComptaBoostsTab } from "./ComptaBoostsTab";
import { ComptaRemboursementsTab } from "./ComptaRemboursementsTab";
import { ComptaTransfertsTab } from "./ComptaTransfertsTab";
import { ComptaVitrinesTab } from "./ComptaVitrinesTab";

type TabId = "achats" | "boosts" | "vitrines" | "remboursements" | "transferts";

const TABS: { id: TabId; label: string; icon: React.ReactNode }[] = [
  { id: "achats", label: "Achats", icon: <FaShoppingCart /> },
  { id: "boosts", label: "Boosts", icon: <FaRocket /> },
  { id: "vitrines", label: "Vitrines", icon: <FaImage /> },
  { id: "remboursements", label: "Remboursements", icon: <FaUndo /> },
  { id: "transferts", label: "Transferts", icon: <FaExchangeAlt /> },
];

const ComptaPageInner: React.FC = () => {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  // L'état (onglet + mois) vit dans l'URL : bookmarkable, partageable, "back" du navigateur
  // fonctionne entre onglets, et les multiples instances ouvertes restent indépendantes.
  const tabParam = searchParams.get("tab") as TabId | null;
  const tab: TabId = TABS.find(t => t.id === tabParam)?.id ?? "achats";
  const month = searchParams.get("month") || currentMonthValue();

  const updateUrl = (next: { tab?: TabId; month?: string }) => {
    const params = new URLSearchParams(searchParams.toString());
    if (next.tab !== undefined) params.set("tab", next.tab);
    if (next.month !== undefined) params.set("month", next.month);
    router.replace(`${pathname}?${params.toString()}`);
  };

  return (
    <div className="min-h-screen bg-[#151826] text-white p-8">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold mb-2">Compta</h1>
          <p className="text-gray-400">Vue mensuelle pour la secrétaire — un onglet par catégorie d&apos;événements Vinted.</p>
        </div>
        <MonthPicker
          value={month}
          onChange={(v) => updateUrl({ month: v })}
          options={MONTH_OPTIONS}
        />
      </div>

      <div className="flex flex-wrap gap-1 mb-4 border-b border-[#2c3048]">
        {TABS.map(t => {
          const isActive = t.id === tab;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => updateUrl({ tab: t.id })}
              aria-pressed={isActive}
              className={`cursor-pointer inline-flex items-center gap-2 px-4 py-2.5 text-sm font-semibold transition-colors rounded-t-lg border-b-2 ${
                isActive
                  ? "text-blue-300 border-blue-400 bg-[#23263A]"
                  : "text-gray-400 border-transparent hover:text-gray-200 hover:bg-[#1c1f2e]/60"
              }`}
            >
              {t.icon}
              {t.label}
            </button>
          );
        })}
      </div>

      {tab === "achats" && <ComptaAchatsTab month={month} />}
      {tab === "boosts" && <ComptaBoostsTab month={month} />}
      {tab === "vitrines" && <ComptaVitrinesTab month={month} />}
      {tab === "remboursements" && <ComptaRemboursementsTab month={month} />}
      {tab === "transferts" && <ComptaTransfertsTab month={month} />}
    </div>
  );
};

const ComptaPage = () => (
  <Suspense fallback={<div className="min-h-screen bg-[#151826] text-white p-8">Chargement…</div>}>
    <ComptaPageInner />
  </Suspense>
);

export default ComptaPage;
