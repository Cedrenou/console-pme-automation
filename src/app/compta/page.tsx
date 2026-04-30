"use client";
import React, { Suspense, useState } from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { FaShoppingCart, FaRocket, FaUndo, FaImage, FaExchangeAlt, FaUniversity, FaCheckSquare, FaSquare } from "react-icons/fa";
import { fetchVintedEvents, setVintedEventValidated, type VintedEvent } from "@/lib/api";
import { MONTH_OPTIONS, currentMonthValue, monthToDates } from "./utils";
import { MonthPicker } from "./MonthPicker";
import { ComptaAchatsTab } from "./ComptaAchatsTab";
import { ComptaBoostsTab } from "./ComptaBoostsTab";
import { ComptaRemboursementsTab } from "./ComptaRemboursementsTab";
import { ComptaTransfertsTab } from "./ComptaTransfertsTab";
import { ComptaVitrinesTab } from "./ComptaVitrinesTab";
import { RapprochementDrawer } from "./RapprochementDrawer";
import { useUserRole } from "@/utils/supabase/useUserRole";

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
  const { role } = useUserRole();
  // La comptable est en lecture seule : pas d'édition de label, pas de toggle "Vérifié",
  // pas d'auto-numérotation. Le bouton Exporter Excel reste accessible.
  const readOnly = role === "comptable";

  const [rapprochementOpen, setRapprochementOpen] = useState(false);
  // Bumpé après le rapprochement pour forcer le remount de l'onglet actif → re-fetch
  // de la liste des events avec leur nouveau statut "Vérifié".
  const [refreshKey, setRefreshKey] = useState(0);
  const [bulkLoading, setBulkLoading] = useState<"check" | "uncheck" | null>(null);

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

  // Outil dev : (dé)coche le flag validated_at sur tous les events des 5 catégories pour
  // le mois sélectionné. Pratique pour rejouer un rapprochement bancaire sur des données
  // propres. Filtre côté frontend uniquement, donc bornée au mois courant.
  const bulkToggleAll = async (target: boolean) => {
    if (bulkLoading) return;
    const monthLabel = MONTH_OPTIONS.find(m => m.value === month)?.label || month;
    const action = target ? "cocher" : "décocher";
    if (!window.confirm(`${action.charAt(0).toUpperCase() + action.slice(1)} TOUS les "Vérifié" de ${monthLabel} (achats + boosts + vitrines + remboursements + transferts) ?`)) {
      return;
    }
    setBulkLoading(target ? "check" : "uncheck");
    try {
      const { from, to } = monthToDates(month);
      const types = ["achat", "boost", "vitrine", "refund", "transfert"] as const;
      const all: VintedEvent[] = [];
      for (const type of types) {
        let cursor: string | null = null;
        do {
          const res = await fetchVintedEvents({ type, from, to, limit: 200, cursor: cursor ?? undefined });
          all.push(...res.items);
          cursor = res.nextCursor;
        } while (cursor);
      }
      const toUpdate = all.filter(e => Boolean(e.validated_at) !== target);
      const pool = 5;
      for (let i = 0; i < toUpdate.length; i += pool) {
        await Promise.all(toUpdate.slice(i, i + pool).map(e =>
          setVintedEventValidated(e.gmailMessageId, target).catch(err => {
            console.error(`Bulk toggle failed for ${e.gmailMessageId}`, err);
          })
        ));
      }
      setRefreshKey(k => k + 1);
    } finally {
      setBulkLoading(null);
    }
  };

  return (
    <div className="min-h-screen bg-[#151826] text-white p-8">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold mb-2">Compta</h1>
          <p className="text-gray-400">Vue mensuelle pour la secrétaire — un onglet par catégorie d&apos;événements Vinted.</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {!readOnly && (
            <>
              {/* Outils dev temporaires pour rejouer le rapprochement sur un état propre.
                  À retirer quand la feature sera stabilisée. */}
              <button
                type="button"
                onClick={() => bulkToggleAll(true)}
                disabled={bulkLoading !== null}
                title="DEV — Cocher tous les Vérifié du mois (5 catégories)"
                className="cursor-pointer inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold transition-colors bg-[#23263A] text-gray-400 hover:text-white hover:bg-[#2c3048] disabled:opacity-50"
              >
                <FaCheckSquare className="text-xs" />
                {bulkLoading === "check" ? "…" : "Tout cocher"}
              </button>
              <button
                type="button"
                onClick={() => bulkToggleAll(false)}
                disabled={bulkLoading !== null}
                title="DEV — Décocher tous les Vérifié du mois (5 catégories)"
                className="cursor-pointer inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold transition-colors bg-[#23263A] text-gray-400 hover:text-white hover:bg-[#2c3048] disabled:opacity-50"
              >
                <FaSquare className="text-xs" />
                {bulkLoading === "uncheck" ? "…" : "Tout décocher"}
              </button>
              <button
                type="button"
                onClick={() => setRapprochementOpen(true)}
                className="cursor-pointer inline-flex items-center gap-2 px-4 py-2 rounded-lg font-semibold transition-colors text-sm bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm"
                title="Importer un relevé bancaire SG pour rapprocher avec les events Vinted du mois"
              >
                <FaUniversity className="text-sm" />
                Importer relevé bancaire
              </button>
            </>
          )}
          <MonthPicker
            value={month}
            onChange={(v) => updateUrl({ month: v })}
            options={MONTH_OPTIONS}
          />
        </div>
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

      {tab === "achats" && <ComptaAchatsTab key={`achats-${refreshKey}`} month={month} readOnly={readOnly} />}
      {tab === "boosts" && <ComptaBoostsTab key={`boosts-${refreshKey}`} month={month} readOnly={readOnly} />}
      {tab === "vitrines" && <ComptaVitrinesTab key={`vitrines-${refreshKey}`} month={month} readOnly={readOnly} />}
      {tab === "remboursements" && <ComptaRemboursementsTab key={`remboursements-${refreshKey}`} month={month} readOnly={readOnly} />}
      {tab === "transferts" && <ComptaTransfertsTab key={`transferts-${refreshKey}`} month={month} readOnly={readOnly} />}

      {rapprochementOpen && (
        <RapprochementDrawer
          month={month}
          onClose={() => setRapprochementOpen(false)}
          onValidationsApplied={() => setRefreshKey(k => k + 1)}
        />
      )}
    </div>
  );
};

const ComptaPage = () => (
  <Suspense fallback={<div className="min-h-screen bg-[#151826] text-white p-8">Chargement…</div>}>
    <ComptaPageInner />
  </Suspense>
);

export default ComptaPage;
