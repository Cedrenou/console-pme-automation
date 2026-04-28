"use client";
import React, { useEffect, useRef, useState } from "react";
import { fetchVintedEvents, type VintedEvent } from "@/lib/api";
import { FaCalendarAlt, FaUser, FaSearch, FaShoppingCart, FaExternalLinkAlt } from "react-icons/fa";

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

const formatEur = (n: number): string =>
  n.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €";

const formatDate = (iso: string): string => {
  const d = new Date(iso);
  return d.toLocaleDateString("fr-FR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
};

const VintedAchatsPage = () => {
  const [period, setPeriod] = useState<PeriodId>("30d");
  const [search, setSearch] = useState<string>("");
  const [items, setItems] = useState<VintedEvent[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestId = useRef(0);

  useEffect(() => {
    const myId = ++requestId.current;
    const load = async () => {
      setLoading(true);
      setError(null);
      setItems([]);
      setCursor(null);
      try {
        const { from, to } = periodToDates(period);
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
  }, [period]);

  const handleLoadMore = async () => {
    if (!cursor || loadingMore) return;
    setLoadingMore(true);
    setError(null);
    try {
      const { from, to } = periodToDates(period);
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
        <div className="flex flex-wrap gap-2">
          {PERIODS.map(p => (
            <button
              key={p.id}
              onClick={() => setPeriod(p.id)}
              aria-pressed={period === p.id}
              className={`cursor-pointer px-4 py-2 rounded-lg font-semibold transition-colors flex items-center gap-2 ${
                period === p.id ? "bg-blue-600 text-white" : "bg-[#23263A] text-gray-300 hover:bg-[#2c3048]"
              }`}
            >
              <FaCalendarAlt className="text-sm" />
              {p.label}
            </button>
          ))}
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

  const vendeurUrl = p.beneficiaire ? `https://www.vinted.fr/member/${encodeURIComponent(p.beneficiaire)}` : null;

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
          {vendeurUrl ? (
            <a
              href={vendeurUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-400 hover:underline inline-flex items-center gap-1"
              title="Voir le profil Vinted du vendeur"
            >
              {p.beneficiaire ?? "?"}
              <FaExternalLinkAlt className="text-[8px]" />
            </a>
          ) : (
            <span>{p.beneficiaire ?? "?"}</span>
          )}
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
