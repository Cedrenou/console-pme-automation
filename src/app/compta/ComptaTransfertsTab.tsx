"use client";
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  fetchVintedEvents, setVintedEventValidated, setVintedEventComptaLabel,
  type VintedEvent
} from "@/lib/api";
import { FaCalendarAlt, FaMagic, FaSearch, FaFileExcel } from "react-icons/fa";
import { monthToDates, formatEur, formatDateOnly } from "./utils";
import { filterBySearch, buildHaystack, downloadXlsx } from "./exports";

const PAGE_SIZE = 200;

// Reformate "DD/MM/YYYY" → "YYYY-MM-DD" pour cohérence avec les autres dates affichées.
const formatBankDate = (raw: string | undefined): string => {
  if (!raw) return "—";
  const m = raw.match(/^(\d{2})[\/\-.](\d{2})[\/\-.](\d{4})/);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  return raw;
};

export const ComptaTransfertsTab: React.FC<{ month: string; readOnly?: boolean }> = ({ month, readOnly = false }) => {
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
            type: "transfert",
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
        setError("Erreur lors du chargement des transferts.");
      } finally {
        if (requestId.current === myId) setLoading(false);
      }
    };
    load();
  }, [month]);

  const sortedItems = useMemo(() => {
    return [...items].sort((a, b) => a.eventDate.localeCompare(b.eventDate));
  }, [items]);

  const filteredItems = useMemo(() => filterBySearch(sortedItems, search, transfert => {
    const p = transfert.payload as { beneficiaire?: string; montant?: number; compte?: string };
    return buildHaystack([p.beneficiaire, p.compte, transfert.compta_label, p.montant]);
  }), [sortedItems, search]);

  const totalMontant = useMemo(() => {
    return filteredItems.reduce((acc, it) => {
      const p = it.payload as { montant?: number };
      return acc + (typeof p.montant === "number" ? p.montant : 0);
    }, 0);
  }, [filteredItems]);

  const handleExport = () => {
    const headers = ["Date émission", "Date réception", "Bénéficiaire", "Montant", "Compte", "Vérifié", "N°Transaction"];
    const rows = filteredItems.map(transfert => {
      const p = transfert.payload as {
        beneficiaire?: string; montant?: number; compte?: string; date_reception?: string;
      };
      return [
        formatDateOnly(transfert.eventDate),
        p.date_reception ?? "",
        p.beneficiaire ?? "",
        p.montant ?? "",
        p.compte ?? "",
        transfert.validated_at ? "Oui" : "",
        transfert.compta_label ?? ""
      ];
    });
    downloadXlsx(`compta-transferts-${month}.xlsx`, headers, rows);
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

  // Auto-numérotation "Transfert N" en fallback. La secrétaire écrasera typiquement
  // par "Vente X" pour cross-référencer vers son sheet ventes.
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
          : `Transfert ${counter}`;
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
              ? `${filteredItems.length} / ${sortedItems.length} transferts`
              : `${sortedItems.length} transferts`}
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
          {!readOnly && (
            <button
              type="button"
              onClick={autoNumberAll}
              disabled={loading || autoNumbering || sortedItems.length === 0}
              className="cursor-pointer inline-flex items-center gap-2 px-4 py-2 rounded-lg font-semibold transition-colors text-sm bg-amber-600 hover:bg-amber-700 text-white disabled:opacity-50 disabled:cursor-not-allowed"
              title="Remplit les cases vides avec « Transfert N ». Tu peux écraser par « Vente X » si tu veux référencer la vente d'origine."
            >
              <FaMagic className="text-sm" />
              {autoNumbering ? "Numérotation…" : "Auto-numéroter"}
            </button>
          )}
        </div>
      </div>

      {filteredItems.length === 0 && !loading ? (
        <div className="text-gray-500 italic py-8 text-center">
          {search ? "Aucun transfert ne matche cette recherche." : "Aucun transfert sur le mois sélectionné."}
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="text-left text-xs text-gray-400 border-b border-[#2c3048]">
                <th className="py-2 px-2 font-semibold whitespace-nowrap">Date émission</th>
                <th className="py-2 px-2 font-semibold whitespace-nowrap">Date réception</th>
                <th className="py-2 px-2 font-semibold whitespace-nowrap">Bénéficiaire</th>
                <th className="py-2 px-2 font-semibold text-right whitespace-nowrap">Montant</th>
                <th className="py-2 px-2 font-semibold whitespace-nowrap">Compte</th>
                <th className="py-2 px-2 font-semibold text-center whitespace-nowrap">Vérifié</th>
                <th className="py-2 px-2 font-semibold whitespace-nowrap">N°Transaction</th>
              </tr>
            </thead>
            <tbody>
              {filteredItems.map(transfert => (
                <TransfertRow
                  key={transfert.gmailMessageId}
                  transfert={transfert}
                  readOnly={readOnly}
                  onToggleValidated={() => toggleValidated(transfert.gmailMessageId)}
                  onLabelChange={(label) => updateComptaLabel(transfert.gmailMessageId, label)}
                />
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-[#2c3048] font-bold">
                <td className="py-3 px-2 text-sm whitespace-nowrap" colSpan={3}>TOTAL</td>
                <td className="py-3 px-2 text-sm text-right tabular-nums whitespace-nowrap">{formatEur(totalMontant)}</td>
                <td colSpan={3} />
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
};

const TransfertRow: React.FC<{
  transfert: VintedEvent;
  readOnly: boolean;
  onToggleValidated: () => void;
  onLabelChange: (label: string) => void;
}> = ({ transfert, readOnly, onToggleValidated, onLabelChange }) => {
  const p = transfert.payload as {
    beneficiaire?: string;
    montant?: number;
    compte?: string;
    date_reception?: string;
  };
  const isValidated = Boolean(transfert.validated_at);

  return (
    <tr className="border-b border-[#2c3048] hover:bg-[#1c1f2e]/60">
      <td className="py-2 px-2 text-xs whitespace-nowrap tabular-nums text-gray-300">
        {formatDateOnly(transfert.eventDate)}
      </td>
      <td className="py-2 px-2 text-xs whitespace-nowrap tabular-nums text-gray-300">
        {formatBankDate(p.date_reception)}
      </td>
      <td className="py-2 px-2 text-sm whitespace-nowrap text-gray-300">{p.beneficiaire ?? "—"}</td>
      <td className="py-2 px-2 text-sm text-right tabular-nums whitespace-nowrap font-semibold">
        {formatEur(p.montant)}
      </td>
      <td className="py-2 px-2 text-xs whitespace-nowrap text-gray-400 tabular-nums">{p.compte ?? "—"}</td>
      <td className="py-2 px-2 text-center">
        <input
          type="checkbox"
          checked={isValidated}
          onChange={onToggleValidated}
          disabled={readOnly}
          aria-label="Vérifié"
          className={`w-4 h-4 accent-emerald-500 ${readOnly ? "cursor-not-allowed opacity-60" : "cursor-pointer"}`}
        />
      </td>
      <td className="py-2 px-2">
        <input
          type="text"
          value={transfert.compta_label ?? ""}
          onChange={e => onLabelChange(e.target.value)}
          placeholder="Vente X / Transfert X"
          readOnly={readOnly}
          className={`w-32 px-2 py-1 rounded text-xs font-semibold bg-emerald-600/30 text-emerald-200 border border-emerald-500/40 focus:outline-none focus:ring-2 focus:ring-blue-500 ${readOnly ? "cursor-not-allowed opacity-80" : ""}`}
        />
      </td>
    </tr>
  );
};
