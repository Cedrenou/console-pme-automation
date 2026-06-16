"use client";
import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { fetchDealCandidates, updateDealStatus } from "@/lib/api";
import {
  FaSearch, FaExternalLinkAlt, FaCheck, FaTimes, FaUndo, FaSearchDollar,
  FaTruck, FaHandshake, FaCog,
} from "react-icons/fa";

// Candidat produit par l'agent à bonnes affaires (DynamoDB DealCandidates, keyé par external_id).
type DealCandidate = {
  external_id: string;
  url: string;
  title: string | null;
  brand: string | null;
  brand_known: boolean;
  category: string | null;
  gender: string | null;
  price: number | null;
  est_resale: number | null;
  resale_basis: string | null;     // model | category | none
  model_sales: number | null;
  category_sales: number | null;
  recond_cost: number | null;
  est_margin: number | null;
  margin_pct: number | null;
  tier: string;                     // deal | review | excluded | none
  location: string | null;
  zipcode: string | null;
  shippable: boolean | null;        // true=expédiable, false=main propre, null=inconnu
  image_url: string | null;
  ai_summary: string | null;        // résumé Claude
  ai_condition: string | null;      // état estimé
  ai_factor: number | null;
  ai_alert: string | null;          // alerte si douteux
  status: string;                   // new | shortlisted | bought | rejected
  found_at: string;
};

type StatusFilter = "active" | "new" | "bought" | "rejected" | "all";

const STATUS_FILTERS: { id: StatusFilter; label: string }[] = [
  { id: "active", label: "À traiter" },
  { id: "new", label: "Nouveaux" },
  { id: "bought", label: "Achetés" },
  { id: "rejected", label: "Rejetés" },
  { id: "all", label: "Tout" },
];

const formatEur = (n: number | null): string =>
  n === null || n === undefined
    ? "—"
    : n.toLocaleString("fr-FR", { maximumFractionDigits: 0 }) + " €";

const formatPct = (n: number | null): string =>
  n === null || n === undefined ? "—" : Math.round(n * 100) + " %";

const formatDate = (iso: string): string =>
  new Date(iso).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });

// Tri : 🟢 d'abord, puis 🟡, puis marge € décroissante.
const tierRank = (t: string) => (t === "deal" ? 2 : t === "review" ? 1 : 0);

const TierBadge: React.FC<{ tier: string }> = ({ tier }) => {
  if (tier === "deal")
    return <span className="text-xs font-semibold bg-green-600/15 text-green-300 px-2.5 py-1 rounded-full whitespace-nowrap">🟢 Bonne affaire</span>;
  if (tier === "review")
    return <span className="text-xs font-semibold bg-amber-500/15 text-amber-300 px-2.5 py-1 rounded-full whitespace-nowrap">🟡 À vérifier</span>;
  return <span className="text-xs text-gray-500">—</span>;
};

const BonnesAffairesPage = () => {
  const [items, setItems] = useState<DealCandidate[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("active");
  const [category, setCategory] = useState<string>("");
  const [search, setSearch] = useState<string>("");

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const data = (await fetchDealCandidates()) as DealCandidate[];
        // Tri par défaut : plus récents d'abord (Dynamo renvoie par clé de tri).
        data.sort((a, b) => (b.found_at ?? "").localeCompare(a.found_at ?? ""));
        setItems(data ?? []);
      } catch (err) {
        console.error(err);
        setError("Erreur lors du chargement des candidats.");
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  // Maj de statut : update optimiste + rollback en cas d'échec.
  const setStatus = async (externalId: string, status: string) => {
    const prev = items;
    setItems(curr => curr.map(it => (it.external_id === externalId ? { ...it, status } : it)));
    try {
      await updateDealStatus(externalId, status);
    } catch (err) {
      console.error(err);
      setItems(prev); // rollback
    }
  };

  const categories = useMemo(
    () => Array.from(new Set(items.map(i => i.category).filter(Boolean))).sort() as string[],
    [items],
  );

  const filtered = useMemo(() => {
    let rows = items;
    if (statusFilter === "active") rows = rows.filter(i => i.status === "new" || i.status === "shortlisted");
    else if (statusFilter !== "all") rows = rows.filter(i => i.status === statusFilter);
    if (category) rows = rows.filter(i => i.category === category);
    if (search.trim()) {
      const q = search.toLowerCase();
      rows = rows.filter(i => `${i.title ?? ""} ${i.brand ?? ""}`.toLowerCase().includes(q));
    }
    return [...rows].sort(
      (a, b) => tierRank(b.tier) - tierRank(a.tier) || (b.est_margin ?? 0) - (a.est_margin ?? 0),
    );
  }, [items, statusFilter, category, search]);

  const deals = filtered.filter(i => i.tier === "deal").length;
  const reviews = filtered.filter(i => i.tier === "review").length;

  return (
    <div className="min-h-screen bg-app text-fg p-4 md:p-8">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold mb-2 flex items-center gap-3">
            <FaSearchDollar className="text-emerald-400" /> Bonnes affaires
          </h1>
          <p className="text-gray-400">
            Annonces Leboncoin sourcées par l&apos;agent, valorisées via ton historique de ventes Vinted.
          </p>
        </div>
        <div className="flex flex-wrap gap-2 items-center">
          <Link
            href="/bonnes-affaires/parametres"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg font-semibold bg-card-2 text-gray-300 hover:bg-edge transition-colors"
          >
            <FaCog /> Paramètres
          </Link>
          {STATUS_FILTERS.map(s => {
            const active = statusFilter === s.id;
            return (
              <button
                key={s.id}
                onClick={() => setStatusFilter(s.id)}
                aria-pressed={active}
                className={`cursor-pointer px-4 py-2 rounded-lg font-semibold transition-colors ${
                  active ? "bg-blue-600 text-white" : "bg-card-2 text-gray-300 hover:bg-edge"
                }`}
              >
                {s.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="bg-card-2 rounded-2xl shadow-lg p-6">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div className="flex items-center gap-3 flex-wrap">
            <h2 className="text-xl font-bold">Candidats</h2>
            <span className="text-sm text-gray-400">
              {loading ? "Chargement…" : `${filtered.length} affichés`}
            </span>
            {!loading && (
              <>
                <span className="text-sm bg-green-600/15 text-green-300 px-3 py-1 rounded-full">🟢 {deals}</span>
                <span className="text-sm bg-amber-500/15 text-amber-300 px-3 py-1 rounded-full">🟡 {reviews}</span>
              </>
            )}
          </div>
          <div className="flex items-center gap-2">
            {categories.length > 0 && (
              <select
                value={category}
                onChange={e => setCategory(e.target.value)}
                className="px-3 py-2 rounded-lg bg-card border border-edge text-sm text-fg focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Toutes catégories</option>
                {categories.map(c => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            )}
            <div className="relative">
              <FaSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-sm" />
              <input
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Filtrer (titre, marque)…"
                className="pl-9 pr-3 py-2 rounded-lg bg-card border border-edge text-sm text-fg placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 w-56"
              />
            </div>
          </div>
        </div>

        {error && (
          <div className="bg-red-500/20 border border-red-500/50 rounded-lg p-3 mb-4 text-red-400 text-sm">{error}</div>
        )}

        {filtered.length === 0 && !loading ? (
          <div className="text-gray-500 italic py-8 text-center">
            Aucun candidat. L&apos;agent en ajoute à chaque passage matinal.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-gray-400 border-b border-edge">
                  <th className="py-2 px-2 font-semibold">Statut</th>
                  <th className="py-2 px-2 font-semibold"></th>
                  <th className="py-2 px-3 font-semibold">Article</th>
                  <th className="py-2 px-3 font-semibold">Marque</th>
                  <th className="py-2 px-3 font-semibold">Catégorie</th>
                  <th className="py-2 px-3 font-semibold text-right whitespace-nowrap">Prix</th>
                  <th className="py-2 px-3 font-semibold text-right whitespace-nowrap">Revente est.</th>
                  <th className="py-2 px-3 font-semibold text-right whitespace-nowrap">Marge</th>
                  <th className="py-2 px-3 font-semibold whitespace-nowrap">Lieu</th>
                  <th className="py-2 px-3 font-semibold text-right whitespace-nowrap">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(it => (
                  <DealRow key={it.external_id} it={it} onStatus={setStatus} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

const DealRow: React.FC<{ it: DealCandidate; onStatus: (externalId: string, s: string) => void }> = ({ it, onStatus }) => {
  const bought = it.status === "bought";
  const rejected = it.status === "rejected";
  const rowClass = rejected
    ? "border-b border-edge/60 opacity-40 hover:opacity-60 transition-opacity"
    : bought
    ? "border-b border-edge/60 bg-green-500/5 hover:bg-green-500/10 transition-colors"
    : "border-b border-edge/60 hover:bg-card/60 transition-colors";

  const marginColor =
    it.est_margin === null ? "text-gray-400"
    : it.est_margin >= 50 ? "text-emerald-400"
    : it.est_margin > 0 ? "text-gray-200"
    : "text-red-400";

  // Fiabilité de l'estimation : match modèle (n ventes) vs moyenne catégorie.
  const basisLabel =
    it.resale_basis === "model" ? `${it.model_sales ?? 0}× ce modèle`
    : it.resale_basis === "category" ? `moy. catégorie (${it.category_sales ?? 0})`
    : "—";

  return (
    <tr className={rowClass}>
      <td className="py-2.5 px-2"><TierBadge tier={it.tier} /></td>
      <td className="py-2.5 px-2">
        {it.image_url ? (
          <div className="group relative w-16 h-16">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={it.image_url}
              alt=""
              className="w-16 h-16 rounded-lg object-cover cursor-zoom-in transition-transform group-hover:scale-105"
            />
            {/* Aperçu agrandi au survol : position fixed → échappe au rognage du conteneur overflow-x-auto. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={it.image_url}
              alt=""
              className="hidden group-hover:block fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-80 h-80 object-contain rounded-xl border border-edge shadow-2xl bg-card p-1 pointer-events-none"
            />
          </div>
        ) : (
          <div className="w-16 h-16 rounded-lg bg-card border border-edge" />
        )}
      </td>
      <td className="py-2.5 px-3 max-w-xs">
        <a
          href={it.url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm leading-tight line-clamp-2 text-blue-300 hover:underline inline-flex items-start gap-1"
          title={it.title ?? ""}
        >
          {it.title ?? "—"}
          <FaExternalLinkAlt className="text-[9px] mt-1 shrink-0 opacity-70" />
        </a>
        {it.ai_summary && (
          <span className="block text-[11px] text-gray-400 leading-snug mt-0.5 line-clamp-2" title={it.ai_summary}>
            🤖 {it.ai_summary}
          </span>
        )}
        {it.ai_alert && (
          <span className="mt-0.5 inline-block text-[10px] bg-red-500/15 text-red-300 px-1.5 py-0.5 rounded">
            ⚠️ {it.ai_alert}
          </span>
        )}
      </td>
      <td className="py-2.5 px-3 whitespace-nowrap">
        <span className={`text-sm ${it.brand_known ? "text-gray-200 font-medium" : "text-gray-500"}`}>
          {it.brand ?? "—"}
        </span>
      </td>
      <td className="py-2.5 px-3 text-sm text-gray-300 whitespace-nowrap">{it.category ?? "—"}</td>
      <td className="py-2.5 px-3 text-right text-sm tabular-nums whitespace-nowrap">{formatEur(it.price)}</td>
      <td className="py-2.5 px-3 text-right text-xs tabular-nums whitespace-nowrap text-gray-300" title={basisLabel}>
        {formatEur(it.est_resale)}
        <span className="block text-[10px] text-gray-500">{basisLabel}</span>
      </td>
      <td className={`py-2.5 px-3 text-right text-sm font-bold tabular-nums whitespace-nowrap ${marginColor}`}>
        {formatEur(it.est_margin)}
        <span className="block text-[10px] font-normal text-gray-500">{formatPct(it.margin_pct)}</span>
      </td>
      <td className="py-2.5 px-3 text-xs text-gray-400 whitespace-nowrap">
        <span className="flex items-center gap-1.5">
          {it.shippable === true ? (
            <FaTruck className="text-emerald-400" title="Livraison possible" />
          ) : it.shippable === false ? (
            <FaHandshake className="text-amber-400" title="Remise en main propre" />
          ) : (
            <span className="text-gray-600" title="Livraison non précisée">?</span>
          )}
          {it.location ?? "—"}
        </span>
        <span className="block text-[10px] text-gray-600">{formatDate(it.found_at)}</span>
      </td>
      <td className="py-2.5 px-3 text-right whitespace-nowrap">
        <div className="inline-flex gap-1.5">
          {bought || rejected ? (
            <button
              type="button"
              onClick={() => onStatus(it.external_id, "new")}
              title="Réinitialiser"
              className="cursor-pointer inline-flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-md bg-card-2 text-gray-300 hover:bg-edge transition-colors"
            >
              <FaUndo className="text-[10px]" /> Reset
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={() => onStatus(it.external_id, "bought")}
                title="Marquer comme acheté"
                className="cursor-pointer inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1.5 rounded-md bg-green-600/90 text-white hover:bg-green-600 transition-colors"
              >
                <FaCheck className="text-[10px]" /> Acheté
              </button>
              <button
                type="button"
                onClick={() => onStatus(it.external_id, "rejected")}
                title="Rejeter"
                className="cursor-pointer inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1.5 rounded-md bg-card-2 text-gray-300 hover:bg-red-600/80 hover:text-white transition-colors"
              >
                <FaTimes className="text-[10px]" /> Rejeter
              </button>
            </>
          )}
        </div>
      </td>
    </tr>
  );
};

export default BonnesAffairesPage;
