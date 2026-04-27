"use client";
import React, { useEffect, useState } from "react";
import { fetchVintedStats, fetchVintedEvents, type VintedStats, type VintedEvent } from "@/lib/api";
import { FaCalendarAlt, FaEuroSign, FaShoppingBag, FaRocket, FaUniversity, FaUndo, FaUser } from "react-icons/fa";

type PeriodId = "30d" | "90d" | "month" | "year" | "all";

const PERIODS: { id: PeriodId; label: string }[] = [
  { id: "30d", label: "30 jours" },
  { id: "90d", label: "90 jours" },
  { id: "month", label: "Ce mois" },
  { id: "year", label: "Cette année" },
  { id: "all", label: "Tout" }
];

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

const formatInt = (n: number): string => n.toLocaleString("fr-FR");

const formatDate = (iso: string): string => {
  const d = new Date(iso);
  return d.toLocaleDateString("fr-FR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
};

const VintedCockpitPage = () => {
  const [period, setPeriod] = useState<PeriodId>("30d");
  const [stats, setStats] = useState<VintedStats | null>(null);
  const [recentSales, setRecentSales] = useState<VintedEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const { from, to } = periodToDates(period);
        const [s, e] = await Promise.all([
          fetchVintedStats(from, to),
          fetchVintedEvents({ type: "vente", from, to, limit: 20 })
        ]);
        setStats(s);
        setRecentSales(e.items);
      } catch (err) {
        console.error(err);
        setError("Erreur lors du chargement des données Vinted.");
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [period]);

  const roiBoost = stats && stats.boosts.total_cost > 0
    ? (stats.transactions.total_revenue / stats.boosts.total_cost).toFixed(1) + "x"
    : "—";

  const margeNetteEstimee = stats
    ? stats.transactions.total_net_recu
        - stats.boosts.total_cost
        - stats.vitrines.total_cost
        - stats.refunds.sunset_vendeur.total
    : 0;

  const tauxFraisVinted = stats && stats.transactions.total_revenue > 0
    ? (stats.transactions.total_frais_vinted / stats.transactions.total_revenue * 100).toFixed(2) + "%"
    : "—";

  return (
    <div className="min-h-screen bg-[#151826] text-white p-8">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold mb-2">Cockpit Vinted</h1>
          <p className="text-gray-400">CA, ventes, boosts et trésorerie quasi-temps réel.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {PERIODS.map(p => (
            <button
              key={p.id}
              onClick={() => setPeriod(p.id)}
              aria-pressed={period === p.id}
              className={`px-4 py-2 rounded-lg font-semibold transition-colors flex items-center gap-2 ${
                period === p.id
                  ? "bg-blue-600 text-white"
                  : "bg-[#23263A] text-gray-300 hover:bg-[#2c3048]"
              }`}
            >
              <FaCalendarAlt className="text-sm" />
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="bg-red-500/20 border border-red-500/50 rounded-lg p-4 mb-6 text-red-400">
          {error}
        </div>
      )}

      {loading && !stats && <div className="text-gray-400">Chargement…</div>}

      {stats && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
            <KpiCard
              icon={<FaEuroSign />}
              label="Chiffre d'affaires"
              value={formatEur(stats.transactions.total_revenue)}
              hint={`${formatInt(stats.transactions.count)} ventes finalisées`}
              accent="text-green-400"
            />
            <KpiCard
              icon={<FaShoppingBag />}
              label="Panier moyen"
              value={formatEur(stats.sales.avg_price)}
              hint="par vente"
            />
            <KpiCard
              icon={<FaUniversity />}
              label="Net reçu Vinted"
              value={formatEur(stats.transactions.total_net_recu)}
              hint={`virements + frais port répercutés`}
              accent="text-blue-400"
            />
            <KpiCard
              icon={<FaUndo />}
              label="Frais Vinted"
              value={formatEur(stats.transactions.total_frais_vinted)}
              hint={`${tauxFraisVinted} du CA`}
              accent="text-amber-400"
            />
            <KpiCard
              icon={<FaRocket />}
              label="Coût boosts"
              value={formatEur(stats.boosts.total_cost)}
              hint={`${formatInt(stats.boosts.total_articles)} articles · ROI ${roiBoost}`}
              accent="text-orange-400"
            />
            <KpiCard
              icon={<FaRocket />}
              label="Vitrines"
              value={formatEur(stats.vitrines.total_cost)}
              hint={`${formatInt(stats.vitrines.count)} mises en vitrine`}
            />
            <KpiCard
              icon={<FaUndo />}
              label="Refunds"
              value={formatEur(stats.refunds.total_amount)}
              hint={`${formatInt(stats.refunds.count)} (${stats.refunds.sunset_acheteur.count} achats / ${stats.refunds.sunset_vendeur.count} ventes)`}
              accent="text-red-400"
            />
            <KpiCard
              icon={<FaEuroSign />}
              label="Marge nette estimée"
              value={formatEur(margeNetteEstimee)}
              hint="net Vinted − boosts − vitrines − refunds"
              accent="text-emerald-300"
            />
          </div>

          <div className="bg-[#23263A] rounded-2xl shadow-lg p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold">Dernières ventes</h2>
              <span className="text-sm text-gray-400">{recentSales.length} affichées</span>
            </div>

            {recentSales.length === 0 ? (
              <p className="text-gray-500 italic">Aucune vente sur la période sélectionnée.</p>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                {recentSales.map(sale => (
                  <SaleRow key={sale.gmailMessageId} sale={sale} />
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
};

type KpiCardProps = {
  icon: React.ReactNode;
  label: string;
  value: string;
  hint?: string;
  accent?: string;
};

const KpiCard: React.FC<KpiCardProps> = ({ icon, label, value, hint, accent }) => (
  <div className="bg-[#23263A] rounded-2xl shadow-lg p-5 border border-transparent hover:border-blue-600/40 transition-colors">
    <div className="flex items-center gap-2 text-gray-400 text-sm mb-2">
      <span className="text-base">{icon}</span>
      <span>{label}</span>
    </div>
    <div className={`text-2xl font-bold ${accent ?? ""}`}>{value}</div>
    {hint && <div className="text-xs text-gray-500 mt-1">{hint}</div>}
  </div>
);

const SaleRow: React.FC<{ sale: VintedEvent }> = ({ sale }) => {
  const p = sale.payload as {
    acheteur_username?: string;
    article_titre?: string;
    prix_vente?: number;
    article_image_url?: string;
    conversation_url?: string;
    vinted_pro?: boolean;
  };

  return (
    <div className="bg-[#1c1f2e] rounded-lg p-4 flex gap-3 items-start">
      {p.article_image_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={p.article_image_url}
          alt={p.article_titre ?? "article"}
          className="w-16 h-20 object-cover rounded flex-shrink-0"
          loading="lazy"
        />
      ) : (
        <div className="w-16 h-20 bg-[#23263A] rounded flex items-center justify-center text-gray-600 text-xs flex-shrink-0">
          —
        </div>
      )}
      <div className="flex-1 min-w-0">
        <div className="font-semibold text-sm leading-tight line-clamp-2">
          {p.article_titre ?? "Article sans titre"}
        </div>
        <div className="text-xs text-gray-400 mt-1 flex items-center gap-1">
          <FaUser className="text-[10px]" />
          {p.conversation_url ? (
            <a
              href={p.conversation_url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-400 hover:underline"
            >
              {p.acheteur_username ?? "?"}
            </a>
          ) : (
            <span>{p.acheteur_username ?? "?"}</span>
          )}
        </div>
        <div className="text-xs text-gray-500 mt-1">{formatDate(sale.eventDate)}</div>
      </div>
      <div className="text-right flex-shrink-0">
        <div className="text-lg font-bold text-green-400">
          {p.prix_vente !== undefined ? formatEur(p.prix_vente) : "—"}
        </div>
      </div>
    </div>
  );
};

export default VintedCockpitPage;
