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

type Status = "achat" | "achat_porte_monnaie" | "annulation";

const statusFor = (achat: VintedEvent, refundedTxIds: Set<string>): Status => {
  const p = achat.payload as { mode_paiement?: string; transaction_id?: string };
  if (p.transaction_id && refundedTxIds.has(p.transaction_id)) return "annulation";
  // Paiement mixte (wallet + CB) → on classe comme Achat (CB dominante, c'est elle qui apparaît
  // sur le relevé bancaire). Wallet seul → Achat porte-monnaie.
  const hasCb = p.mode_paiement ? /\*+\s*\d{4}/.test(p.mode_paiement) : false;
  const hasWallet = p.mode_paiement ? /porte\s*-?\s*monnaie/i.test(p.mode_paiement) : false;
  if (hasWallet && !hasCb) return "achat_porte_monnaie";
  return "achat";
};

const STATUS_LABEL: Record<Status, string> = {
  achat: "Achat",
  achat_porte_monnaie: "Achat porte-monnaie",
  annulation: "Annulation",
};

const STATUS_BG: Record<Status, string> = {
  achat: "bg-blue-600/30 text-blue-200 border border-blue-500/40",
  achat_porte_monnaie: "bg-emerald-600/30 text-emerald-200 border border-emerald-500/40",
  annulation: "bg-red-600/30 text-red-200 border border-red-500/40",
};

export const ComptaAchatsTab: React.FC<{ month: string }> = ({ month }) => {
  const [items, setItems] = useState<VintedEvent[]>([]);
  const [refundedTxIds, setRefundedTxIds] = useState<Set<string>>(new Set());
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
      setRefundedTxIds(new Set());
      try {
        const { from, to } = monthToDates(month);
        const refundPromise = fetchVintedEvents({ type: "refund", from, to, limit: PAGE_SIZE })
          .then(r => {
            const txIds = new Set<string>();
            for (const e of r.items) {
              const p = e.payload as { is_sunset_acheteur?: boolean; transaction_id?: string };
              if (p.is_sunset_acheteur === true && p.transaction_id) txIds.add(p.transaction_id);
            }
            return txIds;
          })
          .catch(() => new Set<string>());

        const accumulator: VintedEvent[] = [];
        let cursor: string | null = null;
        do {
          const res = await fetchVintedEvents({
            type: "achat",
            from, to,
            limit: PAGE_SIZE,
            cursor: cursor ?? undefined,
          });
          if (requestId.current !== myId) return;
          accumulator.push(...res.items);
          cursor = res.nextCursor;
          setItems([...accumulator]);
        } while (cursor);

        const refunds = await refundPromise;
        if (requestId.current !== myId) return;
        setRefundedTxIds(refunds);
      } catch (err) {
        if (requestId.current !== myId) return;
        console.error(err);
        setError("Erreur lors du chargement des achats.");
      } finally {
        if (requestId.current === myId) setLoading(false);
      }
    };
    load();
  }, [month]);

  const sortedItems = useMemo(() => {
    return [...items].sort((a, b) => a.eventDate.localeCompare(b.eventDate));
  }, [items]);

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

  const autoNumberAll = async () => {
    if (autoNumbering) return;
    setAutoNumbering(true);
    try {
      const counters: Record<Status, number> = { achat: 0, achat_porte_monnaie: 0, annulation: 0 };
      const updates: { messageId: string; label: string }[] = [];
      const updated: VintedEvent[] = [];
      for (const it of sortedItems) {
        const status = statusFor(it, refundedTxIds);
        counters[status] += 1;
        const newLabel = it.compta_label && it.compta_label.trim().length > 0
          ? it.compta_label
          : `${STATUS_LABEL[status]} ${counters[status]}`;
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
            {loading ? `Chargement… (${items.length})` : `${sortedItems.length} achats`}
          </span>
        </div>
        <button
          type="button"
          onClick={autoNumberAll}
          disabled={loading || autoNumbering || sortedItems.length === 0}
          className="cursor-pointer inline-flex items-center gap-2 px-4 py-2 rounded-lg font-semibold transition-colors text-sm bg-amber-600 hover:bg-amber-700 text-white disabled:opacity-50 disabled:cursor-not-allowed"
          title="Remplit les cases N°Transaction vides avec une numérotation séquentielle par statut"
        >
          <FaMagic className="text-sm" />
          {autoNumbering ? "Numérotation…" : "Auto-numéroter"}
        </button>
      </div>

      {sortedItems.length === 0 && !loading ? (
        <div className="text-gray-500 italic py-8 text-center">Aucun achat sur le mois sélectionné.</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="text-left text-xs text-gray-400 border-b border-[#2c3048]">
                <th className="py-2 px-2 font-semibold whitespace-nowrap">Date</th>
                <th className="py-2 px-2 font-semibold whitespace-nowrap">Article</th>
                <th className="py-2 px-2 font-semibold whitespace-nowrap">Bénéficiaire</th>
                <th className="py-2 px-2 font-semibold text-right whitespace-nowrap">Montant total</th>
                <th className="py-2 px-2 font-semibold text-right whitespace-nowrap">Frais port</th>
                <th className="py-2 px-2 font-semibold text-right whitespace-nowrap">Montant article</th>
                <th className="py-2 px-2 font-semibold text-right whitespace-nowrap">Frais protection</th>
                <th className="py-2 px-2 font-semibold whitespace-nowrap">Transaction ID</th>
                <th className="py-2 px-2 font-semibold whitespace-nowrap">Mode de paiement</th>
                <th className="py-2 px-2 font-semibold text-center whitespace-nowrap">Vérifié</th>
                <th className="py-2 px-2 font-semibold whitespace-nowrap">N°Transaction</th>
              </tr>
            </thead>
            <tbody>
              {sortedItems.map(achat => (
                <AchatRow
                  key={achat.gmailMessageId}
                  achat={achat}
                  status={statusFor(achat, refundedTxIds)}
                  onToggleValidated={() => toggleValidated(achat.gmailMessageId)}
                  onLabelChange={(label) => updateComptaLabel(achat.gmailMessageId, label)}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

const AchatRow: React.FC<{
  achat: VintedEvent;
  status: Status;
  onToggleValidated: () => void;
  onLabelChange: (label: string) => void;
}> = ({ achat, status, onToggleValidated, onLabelChange }) => {
  const p = achat.payload as {
    article?: string;
    beneficiaire?: string;
    montant_total?: number;
    frais_port?: number;
    montant_commande?: number;
    frais_protection?: number;
    transaction_id?: string;
    mode_paiement?: string;
  };
  const isValidated = Boolean(achat.validated_at);

  return (
    <tr className="border-b border-[#2c3048] hover:bg-[#1c1f2e]/60">
      <td className="py-2 px-2 text-xs whitespace-nowrap tabular-nums text-gray-300">
        {formatDateOnly(achat.eventDate)}
      </td>
      <td className="py-2 px-2 text-sm max-w-xs truncate" title={p.article ?? ""}>
        {p.article ?? "—"}
      </td>
      <td className="py-2 px-2 text-sm whitespace-nowrap text-gray-300">{p.beneficiaire ?? "—"}</td>
      <td className="py-2 px-2 text-sm text-right tabular-nums whitespace-nowrap font-semibold">
        {formatEur(p.montant_total)}
      </td>
      <td className="py-2 px-2 text-sm text-right tabular-nums whitespace-nowrap text-gray-300">
        {formatEur(p.frais_port)}
      </td>
      <td className="py-2 px-2 text-sm text-right tabular-nums whitespace-nowrap text-gray-300">
        {formatEur(p.montant_commande)}
      </td>
      <td className="py-2 px-2 text-sm text-right tabular-nums whitespace-nowrap text-gray-300">
        {formatEur(p.frais_protection)}
      </td>
      <td className="py-2 px-2 text-xs whitespace-nowrap text-gray-400 tabular-nums">
        {p.transaction_id ? <CopyableId value={p.transaction_id} /> : "—"}
      </td>
      <td className="py-2 px-2 text-xs whitespace-nowrap text-gray-400 tabular-nums" title={p.mode_paiement ?? ""}>
        {formatModePaiementAchat(p.mode_paiement)}
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
          value={achat.compta_label ?? ""}
          onChange={e => onLabelChange(e.target.value)}
          placeholder={STATUS_LABEL[status]}
          className={`w-32 px-2 py-1 rounded text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500 ${STATUS_BG[status]}`}
        />
      </td>
    </tr>
  );
};
