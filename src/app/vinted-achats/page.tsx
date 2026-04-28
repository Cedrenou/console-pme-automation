"use client";
import React, { useEffect, useRef, useState } from "react";
import { fetchVintedEvents, type VintedEvent } from "@/lib/api";
import { FaCalendarAlt, FaUser, FaSearch, FaShoppingCart, FaRegCopy, FaCheck } from "react-icons/fa";

type PeriodId = "30d" | "90d" | "month" | "year" | "all";

const PERIODS: { id: PeriodId; label: string }[] = [
  { id: "30d", label: "30 jours" },
  { id: "90d", label: "90 jours" },
  { id: "month", label: "Ce mois" },
  { id: "year", label: "Cette année" },
  { id: "all", label: "Tout" },
];

const PAGE_SIZE = 50;

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

// Génère la liste des mois disponibles depuis le démarrage Sunset (janv. 2025) jusqu'à
// aujourd'hui, ordre décroissant (le plus récent en premier).
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

// Donne la fenêtre [from, to[ correspondant à un mois (ex: "2025-04")
const monthToDates = (value: string): { from: string; to: string } => {
  const [y, m] = value.split("-").map(Number);
  return {
    from: new Date(Date.UTC(y, m - 1, 1)).toISOString(),
    to: new Date(Date.UTC(y, m, 1)).toISOString(),
  };
};

const formatEur = (n: number): string =>
  n.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €";

const formatDate = (iso: string): string => {
  const d = new Date(iso);
  return d.toLocaleDateString("fr-FR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
};

const MONTH_OPTIONS = generateMonthOptions();

const VintedAchatsPage = () => {
  const [period, setPeriod] = useState<PeriodId>("30d");
  const [monthFilter, setMonthFilter] = useState<string>(""); // "" = pas de filtre mois actif
  const [search, setSearch] = useState<string>("");
  const [items, setItems] = useState<VintedEvent[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestId = useRef(0);

  // Le filtre mois prend le pas sur les boutons de période s'il est actif
  const effectiveDates = monthFilter ? monthToDates(monthFilter) : periodToDates(period);

  // Quand l'utilisateur clique un preset, on désactive le filtre mois
  const handleSelectPeriod = (id: PeriodId) => {
    setPeriod(id);
    setMonthFilter("");
  };

  useEffect(() => {
    const myId = ++requestId.current;
    const load = async () => {
      setLoading(true);
      setError(null);
      setItems([]);
      setCursor(null);
      try {
        const { from, to } = effectiveDates;
        const res = await fetchVintedEvents({ type: "achat", from, to, limit: PAGE_SIZE });
        if (requestId.current !== myId) return;
        setItems(res.items);
        setCursor(res.nextCursor);
      } catch (err) {
        if (requestId.current !== myId) return;
        console.error(err);
        setError("Erreur lors du chargement des achats.");
      } finally {
        if (requestId.current === myId) setLoading(false);
      }
    };
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [period, monthFilter]);

  const handleLoadMore = async () => {
    if (!cursor || loadingMore) return;
    setLoadingMore(true);
    setError(null);
    try {
      const { from, to } = effectiveDates;
      const res = await fetchVintedEvents({ type: "achat", from, to, limit: PAGE_SIZE, cursor });
      setItems(prev => [...prev, ...res.items]);
      setCursor(res.nextCursor);
    } catch (err) {
      console.error(err);
      setError("Erreur lors du chargement de la suite.");
    } finally {
      setLoadingMore(false);
    }
  };

  const filteredItems = search.trim().length === 0
    ? items
    : items.filter(it => {
        const p = it.payload as { article?: string; beneficiaire?: string };
        const haystack = `${p.article ?? ""} ${p.beneficiaire ?? ""}`.toLowerCase();
        return haystack.includes(search.toLowerCase());
      });

  // Total dépensé sur la page actuelle (utile pour avoir une idée du budget achats)
  const totalSpent = filteredItems.reduce((acc, it) => {
    const p = it.payload as { montant_total?: number };
    return acc + (typeof p.montant_total === "number" ? p.montant_total : 0);
  }, 0);

  return (
    <div className="min-h-screen bg-[#151826] text-white p-8">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold mb-2">Achats Vinted</h1>
          <p className="text-gray-400">Consulte tes achats Vinted (sourcing inventaire) avec le détail des frais.</p>
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
              {loading ? "Chargement…" : `${filteredItems.length}${cursor ? "+" : ""} affichés`}
            </span>
            {!loading && filteredItems.length > 0 && (
              <span className="text-sm bg-blue-600/15 text-blue-300 px-3 py-1 rounded-full">
                Total : {formatEur(totalSpent)}
              </span>
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

        {loading ? (
          <div className="text-gray-400 italic py-8 text-center">Chargement des achats…</div>
        ) : filteredItems.length === 0 ? (
          <div className="text-gray-500 italic py-8 text-center">
            {search ? "Aucun achat ne matche ce filtre." : "Aucun achat sur la période sélectionnée."}
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
              {filteredItems.map(achat => (
                <AchatRow key={achat.gmailMessageId} achat={achat} />
              ))}
            </div>
            {cursor && (
              <div className="flex justify-center mt-6">
                <button
                  type="button"
                  onClick={handleLoadMore}
                  disabled={loadingMore}
                  className="cursor-pointer px-6 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loadingMore ? "Chargement…" : "Charger plus"}
                </button>
              </div>
            )}
          </>
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
      className={`cursor-pointer ml-0.5 p-1 rounded transition-colors ${
        copied ? "text-green-400 bg-green-500/15" : "text-gray-500 hover:text-blue-300 hover:bg-blue-600/15"
      }`}
    >
      {copied ? <FaCheck className="text-[10px]" /> : <FaRegCopy className="text-[10px]" />}
    </button>
  );
};

const AchatRow: React.FC<{ achat: VintedEvent }> = ({ achat }) => {
  const p = achat.payload as {
    beneficiaire?: string;
    article?: string;
    montant_total?: number;
    frais_port?: number;
    frais_protection?: number;
    montant_commande?: number;
    reduction?: number;
    transaction_id?: string;
    mode_paiement?: string;
  };

  return (
    <div className="bg-[#1c1f2e] rounded-lg p-4 flex gap-3 items-start">
      <div className="w-12 h-12 bg-[#23263A] rounded flex items-center justify-center text-gray-600 flex-shrink-0">
        <FaShoppingCart className="text-xl" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="font-semibold text-sm leading-tight line-clamp-2">
          {p.article ?? "Article sans titre"}
        </div>

        <div className="text-xs text-gray-400 mt-1 flex items-center gap-1">
          <FaUser className="text-[10px]" />
          <span className="text-gray-300">{p.beneficiaire ?? "?"}</span>
          {p.beneficiaire && <InlineCopyButton text={p.beneficiaire} label="le pseudo vendeur" />}
        </div>

        <div className="text-xs text-gray-500 mt-1">{formatDate(achat.eventDate)}</div>

        {/* Breakdown des frais */}
        {(p.montant_commande !== undefined || p.frais_port !== undefined || p.frais_protection !== undefined) && (
          <div className="mt-3 pt-3 border-t border-[#2c3048] grid grid-cols-3 gap-2 text-[11px]">
            {p.montant_commande !== undefined && (
              <div>
                <div className="text-gray-500">Article</div>
                <div className="text-gray-200 font-medium">{formatEur(p.montant_commande)}</div>
              </div>
            )}
            {p.frais_port !== undefined && (
              <div>
                <div className="text-gray-500">Port</div>
                <div className="text-gray-200 font-medium">{formatEur(p.frais_port)}</div>
              </div>
            )}
            {p.frais_protection !== undefined && (
              <div>
                <div className="text-gray-500">Protection</div>
                <div className="text-gray-200 font-medium">{formatEur(p.frais_protection)}</div>
              </div>
            )}
          </div>
        )}
      </div>
      <div className="text-right flex-shrink-0">
        <div className="text-lg font-bold text-orange-400">
          {p.montant_total !== undefined ? formatEur(p.montant_total) : "—"}
        </div>
        <div className="text-[10px] text-gray-500 mt-0.5">payé</div>
      </div>
    </div>
  );
};

export default VintedAchatsPage;
