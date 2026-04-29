"use client";
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  fetchVintedEvents, setVintedEventValidated, setVintedEventComptaLabel,
  type VintedEvent
} from "@/lib/api";
import { FaCalendarAlt, FaMagic } from "react-icons/fa";
import { monthToDates, formatEur, formatDateOnly, formatModePaiementAchat } from "./utils";
import { CopyableId } from "./CopyableId";

const PAGE_SIZE = 200;

// Reformate "DD/MM/YYYY" ou "DD-MM-YYYY" en YYYY-MM-DD pour cohérence avec les autres dates
const formatRefundDate = (raw: string | undefined): string => {
  if (!raw) return "—";
  const m = raw.match(/^(\d{2})[\/\-.](\d{2})[\/\-.](\d{4})/);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  // Si déjà ISO ou autre format, on retourne la chaîne brute
  return raw;
};

export const ComptaRemboursementsTab: React.FC<{ month: string }> = ({ month }) => {
  const [items, setItems] = useState<VintedEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [autoNumbering, setAutoNumbering] = useState(false);
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
            type: "refund",
            from, to,
            limit: PAGE_SIZE,
            cursor: cursor ?? undefined,
          });
          if (requestId.current !== myId) return;
          accumulator.push(...res.items);
          cursor = res.nextCursor;
          // On garde uniquement les remboursements où Sunset est acheteur (= achats annulés
          // par le vendeur, ce qui réapparaît sur le relevé bancaire). Les autres (côté
          // ventes Sunset) ne sont pas pertinents pour ce sheet compta.
          const filtered = accumulator.filter(e => {
            const p = e.payload as { is_sunset_acheteur?: boolean };
            return p.is_sunset_acheteur === true;
          });
          setItems([...filtered]);
        } while (cursor);
      } catch (err) {
        if (requestId.current !== myId) return;
        console.error(err);
        setError("Erreur lors du chargement des remboursements.");
      } finally {
        if (requestId.current === myId) setLoading(false);
      }
    };
    load();
  }, [month]);

  const sortedItems = useMemo(() => {
    return [...items].sort((a, b) => a.eventDate.localeCompare(b.eventDate));
  }, [items]);

  const totalRembourse = useMemo(() => {
    return sortedItems.reduce((acc, it) => {
      const p = it.payload as { montant?: number };
      return acc + (typeof p.montant === "number" ? p.montant : 0);
    }, 0);
  }, [sortedItems]);

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

  // Numérotation simple : "Annulation 1, 2, 3…" par ordre chrono du mail.
  // Les cas de chevauchement de mois ("Mars Annulation 5") sont gérés à la main.
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
          : `Annulation ${counter}`;
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
        <div className="flex items-center gap-3">
          <FaCalendarAlt className="text-gray-400 text-sm" />
          <span className="text-sm text-gray-300">
            {loading ? `Chargement… (${items.length})` : `${sortedItems.length} remboursements`}
          </span>
        </div>
        <button
          type="button"
          onClick={autoNumberAll}
          disabled={loading || autoNumbering || sortedItems.length === 0}
          className="cursor-pointer inline-flex items-center gap-2 px-4 py-2 rounded-lg font-semibold transition-colors text-sm bg-amber-600 hover:bg-amber-700 text-white disabled:opacity-50 disabled:cursor-not-allowed"
          title="Remplit les cases vides : Annulation 1, 2, 3…"
        >
          <FaMagic className="text-sm" />
          {autoNumbering ? "Numérotation…" : "Auto-numéroter"}
        </button>
      </div>

      {sortedItems.length === 0 && !loading ? (
        <div className="text-gray-500 italic py-8 text-center">Aucun remboursement sur le mois sélectionné.</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="text-left text-xs text-gray-400 border-b border-[#2c3048]">
                <th className="py-2 px-2 font-semibold whitespace-nowrap">Date de réception</th>
                <th className="py-2 px-2 font-semibold whitespace-nowrap">Date remboursement</th>
                <th className="py-2 px-2 font-semibold whitespace-nowrap">Article</th>
                <th className="py-2 px-2 font-semibold text-right whitespace-nowrap">Montant</th>
                <th className="py-2 px-2 font-semibold whitespace-nowrap">Mode de paiement</th>
                <th className="py-2 px-2 font-semibold whitespace-nowrap">Transaction ID</th>
                <th className="py-2 px-2 font-semibold whitespace-nowrap">Destinataire</th>
                <th className="py-2 px-2 font-semibold text-center whitespace-nowrap">Vérifié</th>
                <th className="py-2 px-2 font-semibold whitespace-nowrap">N°Transaction</th>
              </tr>
            </thead>
            <tbody>
              {sortedItems.map(refund => (
                <RefundRow
                  key={refund.gmailMessageId}
                  refund={refund}
                  onToggleValidated={() => toggleValidated(refund.gmailMessageId)}
                  onLabelChange={(label) => updateComptaLabel(refund.gmailMessageId, label)}
                />
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-[#2c3048] font-bold">
                <td className="py-3 px-2 text-sm whitespace-nowrap" colSpan={3}>TOTAL</td>
                <td className="py-3 px-2 text-sm text-right tabular-nums whitespace-nowrap">{formatEur(totalRembourse)}</td>
                <td colSpan={5} />
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
};

const RefundRow: React.FC<{
  refund: VintedEvent;
  onToggleValidated: () => void;
  onLabelChange: (label: string) => void;
}> = ({ refund, onToggleValidated, onLabelChange }) => {
  const p = refund.payload as {
    commande?: string;
    montant?: number;
    mode_paiement?: string;
    transaction_id?: string;
    destinataire?: string;
    date_remboursement?: string;
  };
  const isValidated = Boolean(refund.validated_at);

  return (
    <tr className="border-b border-[#2c3048] hover:bg-[#1c1f2e]/60">
      <td className="py-2 px-2 text-xs whitespace-nowrap tabular-nums text-gray-300">
        {formatDateOnly(refund.eventDate)}
      </td>
      <td className="py-2 px-2 text-xs whitespace-nowrap tabular-nums text-gray-300">
        {formatRefundDate(p.date_remboursement)}
      </td>
      <td className="py-2 px-2 text-sm max-w-xs truncate" title={p.commande ?? ""}>
        {p.commande ?? "—"}
      </td>
      <td className="py-2 px-2 text-sm text-right tabular-nums whitespace-nowrap font-semibold">
        {formatEur(p.montant)}
      </td>
      <td className="py-2 px-2 text-xs whitespace-nowrap text-gray-400 tabular-nums" title={p.mode_paiement ?? ""}>
        {formatModePaiementAchat(p.mode_paiement)}
      </td>
      <td className="py-2 px-2 text-xs whitespace-nowrap text-gray-400 tabular-nums">
        {p.transaction_id ? <CopyableId value={p.transaction_id} /> : "—"}
      </td>
      <td className="py-2 px-2 text-sm whitespace-nowrap text-gray-300">{p.destinataire ?? "—"}</td>
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
          value={refund.compta_label ?? ""}
          onChange={e => onLabelChange(e.target.value)}
          placeholder="Annulation X"
          className="w-32 px-2 py-1 rounded text-xs font-semibold bg-red-600/30 text-red-200 border border-red-500/40 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </td>
    </tr>
  );
};
