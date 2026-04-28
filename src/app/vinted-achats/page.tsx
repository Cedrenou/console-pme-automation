"use client";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { fetchVintedEvents, fetchVintedEmail, type VintedEvent } from "@/lib/api";
import { FaCalendarAlt, FaSearch, FaRegCopy, FaCheck, FaPrint } from "react-icons/fa";

// Hook qui persiste un Set d'IDs en localStorage. Utilisé pour la case à cocher
// "achat validé" — c'est un marqueur perso, pas besoin de DynamoDB.
const VALIDATED_STORAGE_KEY = "vinted-achats:validated";

const useValidatedSet = () => {
  const [validated, setValidated] = useState<Set<string>>(new Set());

  // Hydrate depuis localStorage au mount (seul useEffect garantit qu'on n'accède pas
  // à window pendant le SSR)
  useEffect(() => {
    try {
      const stored = localStorage.getItem(VALIDATED_STORAGE_KEY);
      if (stored) setValidated(new Set(JSON.parse(stored)));
    } catch (e) {
      console.error("Failed to load validated set", e);
    }
  }, []);

  const toggle = useCallback((id: string) => {
    setValidated(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      try {
        localStorage.setItem(VALIDATED_STORAGE_KEY, JSON.stringify([...next]));
      } catch (e) {
        console.error("Failed to save validated set", e);
      }
      return next;
    });
  }, []);

  return { validated, toggle };
};

type PeriodId = "30d" | "90d" | "month" | "year" | "all";

const PERIODS: { id: PeriodId; label: string }[] = [
  { id: "30d", label: "30 jours" },
  { id: "90d", label: "90 jours" },
  { id: "month", label: "Ce mois" },
  { id: "year", label: "Cette année" },
  { id: "all", label: "Tout" },
];

const PAGE_SIZE = 200;

const periodToDates = (id: PeriodId): { from?: string; to?: string } => {
  const now = new Date();
  const to = now.toISOString();
  if (id === "all") return {};
  if (id === "30d") return { from: new Date(now.getTime() - 30 * 86400_000).toISOString(), to };
  if (id === "90d") return { from: new Date(now.getTime() - 90 * 86400_000).toISOString(), to };
  if (id === "month") return { from: new Date(now.getFullYear(), now.getMonth(), 1).toISOString(), to };
  if (id === "year") return { from: new Date(now.getFullYear(), 0, 1).toISOString(), to };
  return {};
};

const MONTH_NAMES_FR = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];

const generateMonthOptions = (): { value: string; label: string }[] => {
  const result: { value: string; label: string }[] = [];
  const now = new Date();
  const startYear = 2025;
  for (let y = now.getFullYear(); y >= startYear; y--) {
    const fromMonth = y === now.getFullYear() ? now.getMonth() : 11;
    const toMonth = y === startYear ? 0 : 0;
    for (let m = fromMonth; m >= toMonth; m--) {
      const value = `${y}-${String(m + 1).padStart(2, "0")}`;
      const label = `${MONTH_NAMES_FR[m]} ${y}`;
      result.push({ value, label });
    }
  }
  return result;
};

const monthToDates = (value: string): { from: string; to: string } => {
  const [y, m] = value.split("-").map(Number);
  return {
    from: new Date(Date.UTC(y, m - 1, 1)).toISOString(),
    to: new Date(Date.UTC(y, m, 1)).toISOString(),
  };
};

const formatEur = (n: number | undefined): string =>
  n === undefined
    ? "—"
    : n.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €";

const formatDate = (iso: string): string => {
  const d = new Date(iso);
  return d.toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "2-digit", hour: "2-digit", minute: "2-digit" });
};

const MONTH_OPTIONS = generateMonthOptions();

const VintedAchatsPage = () => {
  const [period, setPeriod] = useState<PeriodId>("30d");
  const [monthFilter, setMonthFilter] = useState<string>("");
  const [search, setSearch] = useState<string>("");
  const [items, setItems] = useState<VintedEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadedCount, setLoadedCount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const requestId = useRef(0);
  const { validated, toggle: toggleValidated } = useValidatedSet();

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
      setLoadedCount(0);
      const accumulator: VintedEvent[] = [];
      let cursor: string | null = null;
      try {
        const { from, to } = effectiveDates;
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

  const validatedCount = filteredItems.filter(it => validated.has(it.gmailMessageId)).length;

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
          <select
            value={monthFilter}
            onChange={e => setMonthFilter(e.target.value)}
            aria-label="Filtrer par mois"
            className={`cursor-pointer px-4 py-2 rounded-lg font-semibold transition-colors text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${
              monthFilter ? "bg-blue-600 text-white" : "bg-[#23263A] text-gray-300 hover:bg-[#2c3048]"
            }`}
          >
            <option value="">📅 Choisir un mois…</option>
            {MONTH_OPTIONS.map(m => (
              <option key={m.value} value={m.value}>{m.label}</option>
            ))}
          </select>
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
                <span className="text-sm bg-blue-600/15 text-blue-300 px-3 py-1 rounded-full">
                  Total : {formatEur(totalSpent)}
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
                    isValidated={validated.has(achat.gmailMessageId)}
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
