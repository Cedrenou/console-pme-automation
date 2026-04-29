"use client";
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  fetchVintedEvents, setVintedEventValidated, setVintedEventComptaLabel,
  type VintedEvent
} from "@/lib/api";
import { FaCalendarAlt, FaMagic, FaSearch, FaFileExcel } from "react-icons/fa";
import { monthToDates, formatEur, formatDateOnly, formatMoyenPaiementBoost } from "./utils";
import { filterBySearch, buildHaystack, downloadXlsx } from "./exports";

const PAGE_SIZE = 200;

export const ComptaBoostsTab: React.FC<{ month: string }> = ({ month }) => {
  const [items, setItems] = useState<VintedEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [autoNumbering, setAutoNumbering] = useState(false);
  const [search, setSearch] = useState("");
  const requestId = useRef(0);

  useEffect(() => {
    const myId = ++requestId.current;
    const load = async () => {
      setLoading(true);
      setError(null);
      setItems([]);
      try {
        const { from, to } = monthToDates(month);
        const accumulator: VintedEvent[] = [];
        let cursor: string | null = null;
        do {
          const res = await fetchVintedEvents({
            type: "boost",
            from, to,
            limit: PAGE_SIZE,
            cursor: cursor ?? undefined,
          });
          if (requestId.current !== myId) return;
          accumulator.push(...res.items);
          cursor = res.nextCursor;
          setItems([...accumulator]);
        } while (cursor);
      } catch (err) {
        if (requestId.current !== myId) return;
        console.error(err);
        setError("Erreur lors du chargement des boosts.");
      } finally {
        if (requestId.current === myId) setLoading(false);
      }
    };
    load();
  }, [month]);

  const sortedItems = useMemo(() => {
    return [...items].sort((a, b) => a.eventDate.localeCompare(b.eventDate));
  }, [items]);

  const filteredItems = useMemo(() => filterBySearch(sortedItems, search, boost => {
    const p = boost.payload as { montant_boost?: number; reduction?: number; montant_total?: number; moyen_paiement?: string };
    return buildHaystack([p.moyen_paiement, boost.compta_label, p.montant_boost, p.reduction, p.montant_total]);
  }), [sortedItems, search]);

  // Totaux calculés sur les items filtrés — la secrétaire voit le total de ce qu'elle regarde
  const totals = useMemo(() => {
    let montantBoost = 0, reduction = 0, montantTotal = 0;
    for (const it of filteredItems) {
      const p = it.payload as { montant_boost?: number; reduction?: number; montant_total?: number };
      montantBoost += typeof p.montant_boost === "number" ? p.montant_boost : 0;
      reduction += typeof p.reduction === "number" ? p.reduction : 0;
      montantTotal += typeof p.montant_total === "number" ? p.montant_total : 0;
    }
    return { montantBoost, reduction, montantTotal };
  }, [filteredItems]);

  const handleExport = () => {
    const headers = ["Date", "Montant Boost", "Réduction", "Montant Total", "Moyen de Paiement", "Vérifié", "N°Transaction"];
    const rows = filteredItems.map(boost => {
      const p = boost.payload as { montant_boost?: number; reduction?: number; montant_total?: number; moyen_paiement?: string };
      return [
        formatDateOnly(boost.eventDate),
        p.montant_boost ?? "",
        p.reduction ?? "",
        p.montant_total ?? "",
        p.moyen_paiement ?? "",
        boost.validated_at ? "Oui" : "",
        boost.compta_label ?? ""
      ];
    });
    downloadXlsx(`compta-boosts-${month}.xlsx`, headers, rows);
  };

  const toggleValidated = async (messageId: string) => {
    const current = items.find(i => i.gmailMessageId === messageId);
    if (!current) return;
    const wasValidated = Boolean(current.validated_at);
    const optimistic = wasValidated ? undefined : new Date().toISOString();
    setItems(prev => prev.map(i =>
      i.gmailMessageId === messageId ? { ...i, validated_at: optimistic } : i
    ));
    try {
      await setVintedEventValidated(messageId, !wasValidated);
    } catch (err) {
      console.error("Toggle validation failed", err);
      setItems(prev => prev.map(i =>
        i.gmailMessageId === messageId ? { ...i, validated_at: current.validated_at } : i
      ));
    }
  };

  const debounceTimers = useRef<Map<string, NodeJS.Timeout>>(new Map());
  const updateComptaLabel = (messageId: string, label: string) => {
    setItems(prev => prev.map(i =>
      i.gmailMessageId === messageId ? { ...i, compta_label: label } : i
    ));
    const timers = debounceTimers.current;
    const existing = timers.get(messageId);
    if (existing) clearTimeout(existing);
    const timer = setTimeout(async () => {
      try {
        await setVintedEventComptaLabel(messageId, label);
      } catch (err) {
        console.error("Compta label save failed", err);
      } finally {
        timers.delete(messageId);
      }
    }, 500);
    timers.set(messageId, timer);
  };

  // Auto-numérotation simple : "Boost 1, 2, 3…" en ordre chrono. Pas de catégorie ici
  // (contrairement aux achats où Annulation et Achat sont séparés).
  const autoNumberAll = async () => {
    if (autoNumbering) return;
    setAutoNumbering(true);
    try {
      const updates: { messageId: string; label: string }[] = [];
      const updated: VintedEvent[] = [];
      let counter = 0;
      for (const it of sortedItems) {
        counter += 1;
        const newLabel = it.compta_label && it.compta_label.trim().length > 0
          ? it.compta_label
          : `Boost ${counter}`;
        if (newLabel !== it.compta_label) {
          updates.push({ messageId: it.gmailMessageId, label: newLabel });
        }
        updated.push({ ...it, compta_label: newLabel });
      }
      setItems(updated);
      const pool = 5;
      for (let i = 0; i < updates.length; i += pool) {
        await Promise.all(updates.slice(i, i + pool).map(u =>
          setVintedEventComptaLabel(u.messageId, u.label).catch(err => {
            console.error(`Compta label save failed for ${u.messageId}`, err);
          })
        ));
      }
    } finally {
      setAutoNumbering(false);
    }
  };

  return (
    <div className="bg-[#23263A] rounded-2xl shadow-lg p-4">
      {error && (
        <div className="bg-red-500/20 border border-red-500/50 rounded-lg p-3 mb-4 text-red-400 text-sm">{error}</div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3 mb-3 px-2">
        <div className="flex items-center gap-3 flex-wrap">
          <FaCalendarAlt className="text-gray-400 text-sm" />
          <span className="text-sm text-gray-300">
            {loading
              ? `Chargement… (${items.length})`
              : search
              ? `${filteredItems.length} / ${sortedItems.length} boosts`
              : `${sortedItems.length} boosts`}
          </span>
          <div className="relative">
            <FaSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-xs" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Rechercher par montant ou nom…"
              className="pl-8 pr-3 py-1.5 rounded-md bg-[#1c1f2e] border border-[#2c3048] text-xs text-white placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 w-60"
            />
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleExport}
            disabled={loading || filteredItems.length === 0}
            className="cursor-pointer inline-flex items-center gap-2 px-4 py-2 rounded-lg font-semibold transition-colors text-sm bg-emerald-600 hover:bg-emerald-700 text-white disabled:opacity-50 disabled:cursor-not-allowed"
            title="Exporter le tableau filtré au format Excel"
          >
            <FaFileExcel className="text-sm" />
            Exporter Excel
          </button>
          <button
            type="button"
            onClick={autoNumberAll}
            disabled={loading || autoNumbering || sortedItems.length === 0}
            className="cursor-pointer inline-flex items-center gap-2 px-4 py-2 rounded-lg font-semibold transition-colors text-sm bg-amber-600 hover:bg-amber-700 text-white disabled:opacity-50 disabled:cursor-not-allowed"
            title="Remplit les cases N°Transaction vides : Boost 1, 2, 3…"
          >
            <FaMagic className="text-sm" />
            {autoNumbering ? "Numérotation…" : "Auto-numéroter"}
          </button>
        </div>
      </div>

      {filteredItems.length === 0 && !loading ? (
        <div className="text-gray-500 italic py-8 text-center">
          {search ? "Aucun boost ne matche cette recherche." : "Aucun boost sur le mois sélectionné."}
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="text-left text-xs text-gray-400 border-b border-[#2c3048]">
                <th className="py-2 px-2 font-semibold whitespace-nowrap">Date</th>
                <th className="py-2 px-2 font-semibold text-right whitespace-nowrap">Montant Boost</th>
                <th className="py-2 px-2 font-semibold text-right whitespace-nowrap">Réduction</th>
                <th className="py-2 px-2 font-semibold text-right whitespace-nowrap">Montant Total</th>
                <th className="py-2 px-2 font-semibold whitespace-nowrap">Moyen de Paiement</th>
                <th className="py-2 px-2 font-semibold text-center whitespace-nowrap">Vérifié</th>
                <th className="py-2 px-2 font-semibold whitespace-nowrap">N°Transaction</th>
              </tr>
            </thead>
            <tbody>
              {filteredItems.map(boost => (
                <BoostRow
                  key={boost.gmailMessageId}
                  boost={boost}
                  onToggleValidated={() => toggleValidated(boost.gmailMessageId)}
                  onLabelChange={(label) => updateComptaLabel(boost.gmailMessageId, label)}
                />
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-[#2c3048] font-bold">
                <td className="py-3 px-2 text-sm whitespace-nowrap">TOTAL</td>
                <td className="py-3 px-2 text-sm text-right tabular-nums whitespace-nowrap">{formatEur(totals.montantBoost)}</td>
                <td className="py-3 px-2 text-sm text-right tabular-nums whitespace-nowrap">{formatEur(totals.reduction)}</td>
                <td className="py-3 px-2 text-sm text-right tabular-nums whitespace-nowrap">{formatEur(totals.montantTotal)}</td>
                <td colSpan={3} />
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
};

const BoostRow: React.FC<{
  boost: VintedEvent;
  onToggleValidated: () => void;
  onLabelChange: (label: string) => void;
}> = ({ boost, onToggleValidated, onLabelChange }) => {
  const p = boost.payload as {
    montant_boost?: number;
    reduction?: number;
    montant_total?: number;
    moyen_paiement?: string;
  };
  const isValidated = Boolean(boost.validated_at);

  return (
    <tr className="border-b border-[#2c3048] hover:bg-[#1c1f2e]/60">
      <td className="py-2 px-2 text-xs whitespace-nowrap tabular-nums text-gray-300">
        {formatDateOnly(boost.eventDate)}
      </td>
      <td className="py-2 px-2 text-sm text-right tabular-nums whitespace-nowrap text-gray-300">
        {formatEur(p.montant_boost)}
      </td>
      <td className="py-2 px-2 text-sm text-right tabular-nums whitespace-nowrap text-gray-300">
        {formatEur(p.reduction)}
      </td>
      <td className="py-2 px-2 text-sm text-right tabular-nums whitespace-nowrap font-semibold">
        {formatEur(p.montant_total)}
      </td>
      <td className="py-2 px-2 text-xs whitespace-nowrap text-gray-400" title={p.moyen_paiement ?? ""}>
        {formatMoyenPaiementBoost(p.moyen_paiement)}
      </td>
      <td className="py-2 px-2 text-center">
        <input
          type="checkbox"
          checked={isValidated}
          onChange={onToggleValidated}
          aria-label="Vérifié"
          className="w-4 h-4 cursor-pointer accent-emerald-500"
        />
      </td>
      <td className="py-2 px-2">
        <input
          type="text"
          value={boost.compta_label ?? ""}
          onChange={e => onLabelChange(e.target.value)}
          placeholder="Boost X"
          className="w-32 px-2 py-1 rounded text-xs font-semibold bg-amber-600/30 text-amber-200 border border-amber-500/40 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </td>
    </tr>
  );
};
