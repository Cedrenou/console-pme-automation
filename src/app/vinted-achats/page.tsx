"use client";
import React, { useEffect, useRef, useState } from "react";
import { fetchVintedEvents, fetchVintedEmail, setVintedEventValidated, type VintedEvent } from "@/lib/api";
import { FaCalendarAlt, FaSearch, FaRegCopy, FaCheck, FaPrint } from "react-icons/fa";
import { MONTH_OPTIONS, monthToDates } from "@/lib/months";
import { MonthPicker } from "@/components/MonthPicker";

type PeriodId = "30d" | "90d" | "month" | "year" | "all";

const PERIODS: { id: PeriodId; label: string }[] = [
  { id: "30d", label: "30 jours" },
  { id: "90d", label: "90 jours" },
  { id: "month", label: "Ce mois" },
  { id: "year", label: "Cette année" },
  { id: "all", label: "Tout" },
];

const PAGE_SIZE = 200;

// Bornes en UTC pour être cohérent avec le bucketize serveur (cf. cockpit pour le rationale).
const periodToDates = (id: PeriodId): { from?: string; to?: string } => {
  const now = new Date();
  const tomorrowUtc = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1)).toISOString();
  if (id === "all") return {};
  if (id === "30d") return { from: new Date(now.getTime() - 30 * 86400_000).toISOString(), to: tomorrowUtc };
  if (id === "90d") return { from: new Date(now.getTime() - 90 * 86400_000).toISOString(), to: tomorrowUtc };
  if (id === "month") return {
    from: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString(),
    to: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)).toISOString(),
  };
  if (id === "year") return {
    from: new Date(Date.UTC(now.getUTCFullYear(), 0, 1)).toISOString(),
    to: new Date(Date.UTC(now.getUTCFullYear() + 1, 0, 1)).toISOString(),
  };
  return {};
};

const formatEur = (n: number | undefined): string =>
  n === undefined
    ? "—"
    : n.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €";

const formatDate = (iso: string): string => {
  const d = new Date(iso);
  return d.toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "2-digit", hour: "2-digit", minute: "2-digit" });
};

const VintedAchatsPage = () => {
  const [period, setPeriod] = useState<PeriodId>("month");
  const [monthFilter, setMonthFilter] = useState<string>("");
  const [search, setSearch] = useState<string>("");
  const [items, setItems] = useState<VintedEvent[]>([]);
  const [refundEvents, setRefundEvents] = useState<VintedEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadedCount, setLoadedCount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const requestId = useRef(0);

  // Toggle validation : update optimiste de la liste locale + appel API.
  // En cas d'échec, on rollback l'état local au précédent.
  const toggleValidated = async (messageId: string) => {
    const current = items.find(i => i.gmailMessageId === messageId);
    if (!current) return;
    const wasValidated = Boolean(current.validated_at);
    const optimisticDate = wasValidated ? undefined : new Date().toISOString();
    setItems(prev => prev.map(i =>
      i.gmailMessageId === messageId ? { ...i, validated_at: optimisticDate } : i
    ));
    try {
      await setVintedEventValidated(messageId, !wasValidated);
    } catch (err) {
      // Rollback
      setItems(prev => prev.map(i =>
        i.gmailMessageId === messageId ? { ...i, validated_at: current.validated_at } : i
      ));
      console.error("Toggle validation failed", err);
    }
  };

  const effectiveDates = monthFilter ? monthToDates(monthFilter) : periodToDates(period);

  const handleSelectPeriod = (id: PeriodId) => {
    setPeriod(id);
    setMonthFilter("");
  };

  // Auto-load TOUS les achats de la période en suivant la pagination cursor
  useEffect(() => {
    const myId = ++requestId.current;
    const loadAll = async () => {
      setLoading(true);
      setError(null);
      setItems([]);
      setRefundEvents([]);
      setLoadedCount(0);
      const accumulator: VintedEvent[] = [];
      let cursor: string | null = null;
      try {
        const { from, to } = effectiveDates;
        // Charge les refunds en parallèle (peu volumineux, sans pagination nécessaire)
        const refundPromise = fetchVintedEvents({ type: "refund", from, to, limit: PAGE_SIZE })
          .then(r => r.items.filter(e => (e.payload as { is_sunset_acheteur?: boolean })?.is_sunset_acheteur === true))
          .catch(() => [] as VintedEvent[]);
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
          setLoadedCount(accumulator.length);
          setItems([...accumulator]);
        } while (cursor);
        const refunds = await refundPromise;
        if (requestId.current !== myId) return;
        setRefundEvents(refunds);
      } catch (err) {
        if (requestId.current !== myId) return;
        console.error(err);
        setError("Erreur lors du chargement des achats.");
      } finally {
        if (requestId.current === myId) setLoading(false);
      }
    };
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [period, monthFilter]);

  const filteredItems = search.trim().length === 0
    ? items
    : items.filter(it => {
        const p = it.payload as { article?: string; beneficiaire?: string };
        const haystack = `${p.article ?? ""} ${p.beneficiaire ?? ""}`.toLowerCase();
        return haystack.includes(search.toLowerCase());
      });

  const totalSpent = filteredItems.reduce((acc, it) => {
    const p = it.payload as { montant_total?: number };
    return acc + (typeof p.montant_total === "number" ? p.montant_total : 0);
  }, 0);

  // Refunds = achats annulés par le vendeur tiers (à déduire pour obtenir le coût d'achat net).
  // On ne filtre PAS par search car les refunds ne portent pas le même article/beneficiaire.
  const refundsTotal = refundEvents.reduce((acc, it) => {
    const p = it.payload as { montant?: number };
    return acc + (typeof p.montant === "number" ? p.montant : 0);
  }, 0);
  const refundsCount = refundEvents.length;
  const totalNet = totalSpent - refundsTotal;

  const validatedCount = filteredItems.filter(it => it.validated_at).length;

  return (
    <div className="min-h-screen bg-[#151826] text-white p-8">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold mb-2">Achats Vinted</h1>
          <p className="text-gray-400">Liste complète des achats Vinted (sourcing inventaire) avec le détail des frais.</p>
        </div>
        <div className="flex flex-wrap gap-2 items-center">
          {PERIODS.map(p => {
            const isActive = period === p.id && !monthFilter;
            return (
              <button
                key={p.id}
                onClick={() => handleSelectPeriod(p.id)}
                aria-pressed={isActive}
                className={`cursor-pointer px-4 py-2 rounded-lg font-semibold transition-colors flex items-center gap-2 ${
                  isActive ? "bg-blue-600 text-white" : "bg-[#23263A] text-gray-300 hover:bg-[#2c3048]"
                }`}
              >
                <FaCalendarAlt className="text-sm" />
                {p.label}
              </button>
            );
          })}
          <div className="h-6 w-px bg-[#2c3048] mx-1" aria-hidden />
          <MonthPicker
            value={monthFilter}
            onChange={setMonthFilter}
            options={MONTH_OPTIONS}
          />
        </div>
      </div>

      <div className="bg-[#23263A] rounded-2xl shadow-lg p-6">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div className="flex items-center gap-3 flex-wrap">
            <h2 className="text-xl font-bold">Liste des achats</h2>
            <span className="text-sm text-gray-400">
              {loading ? `Chargement… (${loadedCount})` : `${filteredItems.length} achats`}
            </span>
            {!loading && filteredItems.length > 0 && (
              <>
                <span
                  className="text-sm bg-blue-600/15 text-blue-300 px-3 py-1 rounded-full"
                  title="Somme des montants d'achat (avant déduction des annulations)"
                >
                  Brut : {formatEur(totalSpent)}
                </span>
                {refundsCount > 0 && (
                  <span
                    className="text-sm bg-red-600/15 text-red-300 px-3 py-1 rounded-full"
                    title="Achats annulés par le vendeur tiers — déduits du brut"
                  >
                    − {formatEur(refundsTotal)} ({refundsCount} annulé{refundsCount > 1 ? "s" : ""})
                  </span>
                )}
                <span
                  className="text-sm bg-emerald-600/15 text-emerald-300 px-3 py-1 rounded-full font-semibold"
                  title="Coût d'achat réel après déduction des refunds"
                >
                  Net : {formatEur(totalNet)}
                </span>
                <span
                  className="text-sm bg-green-600/15 text-green-300 px-3 py-1 rounded-full"
                  title="Achats que tu as marqués comme validés"
                >
                  ✓ {validatedCount} / {filteredItems.length} validés
                </span>
              </>
            )}
          </div>
          <div className="relative">
            <FaSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-sm" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Filtrer par article ou vendeur..."
              className="pl-9 pr-3 py-2 rounded-lg bg-[#1c1f2e] border border-[#2c3048] text-sm text-white placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent w-64"
            />
          </div>
        </div>

        {error && (
          <div className="bg-red-500/20 border border-red-500/50 rounded-lg p-3 mb-4 text-red-400 text-sm">{error}</div>
        )}

        {filteredItems.length === 0 && !loading ? (
          <div className="text-gray-500 italic py-8 text-center">
            {search ? "Aucun achat ne matche ce filtre." : "Aucun achat sur la période sélectionnée."}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-gray-400 border-b border-[#2c3048]">
                  <th className="py-2 px-2 font-semibold w-8" aria-label="Validé"></th>
                  <th className="py-2 px-3 font-semibold whitespace-nowrap">Date</th>
                  <th className="py-2 px-3 font-semibold">Article</th>
                  <th className="py-2 px-3 font-semibold whitespace-nowrap">Vendeur</th>
                  <th className="py-2 px-3 font-semibold text-right whitespace-nowrap">Article</th>
                  <th className="py-2 px-3 font-semibold text-right whitespace-nowrap">Port</th>
                  <th className="py-2 px-3 font-semibold text-right whitespace-nowrap">Protection</th>
                  <th className="py-2 px-3 font-semibold text-right whitespace-nowrap">Total</th>
                  <th className="py-2 px-3 font-semibold text-right whitespace-nowrap">Action</th>
                </tr>
              </thead>
              <tbody>
                {filteredItems.map(achat => (
                  <AchatTableRow
                    key={achat.gmailMessageId}
                    achat={achat}
                    isValidated={Boolean(achat.validated_at)}
                    onToggleValidated={() => toggleValidated(achat.gmailMessageId)}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

const InlineCopyButton: React.FC<{ text: string; label: string }> = ({ text, label }) => {
  const [copied, setCopied] = useState(false);
  const handle = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch (err) {
      console.error("Clipboard write failed", err);
    }
  };
  return (
    <button
      type="button"
      onClick={handle}
      aria-label={`Copier ${label}`}
      title={copied ? "Copié !" : `Copier ${label}`}
      className={`cursor-pointer ml-1 p-1 rounded transition-colors ${
        copied ? "text-green-400 bg-green-500/15" : "text-gray-500 hover:text-blue-300 hover:bg-blue-600/15"
      }`}
    >
      {copied ? <FaCheck className="text-[10px]" /> : <FaRegCopy className="text-[10px]" />}
    </button>
  );
};

const AchatTableRow: React.FC<{
  achat: VintedEvent;
  isValidated: boolean;
  onToggleValidated: () => void;
}> = ({ achat, isValidated, onToggleValidated }) => {
  const p = achat.payload as {
    beneficiaire?: string;
    article?: string;
    montant_total?: number;
    frais_port?: number;
    frais_protection?: number;
    montant_commande?: number;
  };

  const [printLoading, setPrintLoading] = useState(false);
  const [printError, setPrintError] = useState<string | null>(null);

  const handlePrintInvoice = async () => {
    setPrintLoading(true);
    setPrintError(null);
    try {
      const { html, subject } = await fetchVintedEmail(achat.gmailMessageId);
      const wrapped = `<!DOCTYPE html>
<html lang="fr"><head><meta charset="utf-8" /><title>${subject || "Facture Vinted"}</title>
<style>@page { margin: 1.5cm; } body { font-family: Helvetica, Arial, sans-serif; }</style>
</head><body>${html}</body></html>`;
      const iframe = document.createElement("iframe");
      iframe.style.position = "fixed";
      iframe.style.left = "-9999px";
      iframe.style.width = "0";
      iframe.style.height = "0";
      iframe.srcdoc = wrapped;
      document.body.appendChild(iframe);
      iframe.onload = () => {
        setTimeout(() => {
          try {
            iframe.contentWindow?.focus();
            iframe.contentWindow?.print();
          } catch (err) {
            console.error("Print failed", err);
          }
          setTimeout(() => document.body.removeChild(iframe), 60_000);
        }, 500);
      };
    } catch (err) {
      console.error(err);
      setPrintError(err instanceof Error ? err.message : "Erreur");
    } finally {
      setPrintLoading(false);
    }
  };

  // Style "validé" : ligne légèrement teintée vert + texte estompé + total barré
  const rowClass = isValidated
    ? "border-b border-[#2c3048]/60 bg-green-500/5 hover:bg-green-500/10 transition-colors"
    : "border-b border-[#2c3048]/60 hover:bg-[#1c1f2e]/60 transition-colors";
  const textMutedClass = isValidated ? "opacity-60" : "";

  return (
    <tr className={rowClass}>
      <td className="py-2.5 px-2 text-center">
        <button
          type="button"
          onClick={onToggleValidated}
          aria-label={isValidated ? "Marquer comme non validé" : "Marquer comme validé"}
          aria-pressed={isValidated}
          title={isValidated ? "Cliquer pour décocher" : "Marquer cet achat comme validé"}
          className={`cursor-pointer w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${
            isValidated
              ? "bg-green-500 border-green-500 text-white hover:bg-green-600 hover:border-green-600"
              : "bg-transparent border-gray-500 text-transparent hover:border-green-400"
          }`}
        >
          <FaCheck className="text-[10px]" />
        </button>
      </td>
      <td className={`py-2.5 px-3 text-xs whitespace-nowrap tabular-nums ${isValidated ? "text-gray-500" : "text-gray-400"}`}>{formatDate(achat.eventDate)}</td>
      <td className={`py-2.5 px-3 max-w-md ${textMutedClass}`}>
        <div className={`text-sm leading-tight line-clamp-2 ${isValidated ? "line-through text-gray-400" : ""}`} title={p.article}>{p.article ?? "—"}</div>
      </td>
      <td className={`py-2.5 px-3 whitespace-nowrap ${textMutedClass}`}>
        <span className="text-sm text-gray-300">{p.beneficiaire ?? "—"}</span>
        {p.beneficiaire && <InlineCopyButton text={p.beneficiaire} label="le pseudo vendeur" />}
      </td>
      <td className={`py-2.5 px-3 text-right text-xs text-gray-300 tabular-nums whitespace-nowrap ${textMutedClass}`}>{formatEur(p.montant_commande)}</td>
      <td className={`py-2.5 px-3 text-right text-xs text-gray-400 tabular-nums whitespace-nowrap ${textMutedClass}`}>{formatEur(p.frais_port)}</td>
      <td className={`py-2.5 px-3 text-right text-xs text-gray-400 tabular-nums whitespace-nowrap ${textMutedClass}`}>{formatEur(p.frais_protection)}</td>
      <td className={`py-2.5 px-3 text-right text-sm font-bold tabular-nums whitespace-nowrap ${isValidated ? "text-gray-500 line-through" : "text-orange-400"}`}>{formatEur(p.montant_total)}</td>
      <td className="py-2.5 px-3 text-right whitespace-nowrap">
        <button
          type="button"
          onClick={handlePrintInvoice}
          disabled={printLoading}
          className="cursor-pointer inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1.5 rounded-md bg-orange-600/90 text-white hover:bg-orange-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          aria-label="Imprimer la facture Vinted"
          title={printError || "Imprimer la facture (le mail Vinted)"}
        >
          <FaPrint className="text-[11px]" />
          {printLoading ? "…" : "Facture"}
        </button>
      </td>
    </tr>
  );
};

export default VintedAchatsPage;
