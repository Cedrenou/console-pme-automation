"use client";
import React, { useEffect, useState } from "react";
import Link from "next/link";
import {
  fetchVintedStats, fetchVintedTimeline, fetchVintedPatterns,
  type VintedStats, type VintedTimeline, type VintedPatterns
} from "@/lib/api";
import { FaCalendarAlt, FaEuroSign, FaShoppingBag, FaRocket, FaUniversity, FaUndo, FaArrowRight, FaClock } from "react-icons/fa";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell
} from "recharts";

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
  const [timeline, setTimeline] = useState<VintedTimeline | null>(null);
  const [patterns, setPatterns] = useState<VintedPatterns | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const { from, to } = periodToDates(period);
        // La timeline charge toujours les 24 derniers mois (saisonnalité indépendante du sélecteur).
        const now = new Date();
        const timelineFrom = new Date(now.getFullYear() - 2, now.getMonth(), 1).toISOString();
        const [s, tl, p] = await Promise.all([
          fetchVintedStats(from, to),
          fetchVintedTimeline({ type: "transaction", granularity: "month", from: timelineFrom }),
          fetchVintedPatterns({ from, to })
        ]);
        setStats(s);
        setTimeline(tl);
        setPatterns(p);
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

          {timeline && timeline.buckets.length > 0 && (
            <div className="bg-[#23263A] rounded-2xl shadow-lg p-6 mb-8">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-xl font-bold">Saisonnalité du CA — 24 derniers mois</h2>
                  <p className="text-sm text-gray-400">Chiffre d&apos;affaires mensuel basé sur les transactions finalisées</p>
                </div>
              </div>
              <SeasonalityChart buckets={timeline.buckets} />
            </div>
          )}

          {patterns && patterns.ventes_count > 0 && (
            <div className="bg-[#23263A] rounded-2xl shadow-lg p-6 mb-8">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-xl font-bold flex items-center gap-2"><FaClock className="text-blue-400" /> Quand mes acheteurs achètent</h2>
                  <p className="text-sm text-gray-400">
                    {formatInt(patterns.ventes_count)} ventes — heure et jour de la semaine en heure de Paris
                  </p>
                </div>
                <PatternsInsights patterns={patterns} />
              </div>
              <SalesHeatmap patterns={patterns} />
            </div>
          )}

          <Link
            href="/vinted-ventes"
            className="bg-[#23263A] hover:bg-[#2c3048] rounded-2xl shadow-lg p-6 flex items-center justify-between transition-colors group"
          >
            <div>
              <div className="text-lg font-semibold">Voir le détail des ventes</div>
              <div className="text-sm text-gray-400 mt-1">Liste complète, recherche, téléchargement des bordereaux d&apos;envoi</div>
            </div>
            <FaArrowRight className="text-blue-400 text-xl group-hover:translate-x-1 transition-transform" />
          </Link>
        </>
      )}
    </div>
  );
};

type SeasonalityChartProps = {
  buckets: { date: string; count: number; total: number }[];
};

const MONTH_LABELS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];

const SeasonalityChart: React.FC<SeasonalityChartProps> = ({ buckets }) => {
  const data = buckets.map(b => {
    const d = new Date(b.date);
    const month = MONTH_LABELS[d.getMonth()];
    const year = String(d.getFullYear()).slice(2);
    return {
      label: `${month} ${year}`,
      monthIdx: d.getMonth(),
      total: b.total,
      count: b.count
    };
  });

  // Couleur saisonnière : printemps/été en chaud (orange), automne/hiver en froid (bleu).
  const colorFor = (monthIdx: number): string => {
    if (monthIdx >= 2 && monthIdx <= 8) return "#f97316"; // mars-sept
    return "#3b82f6"; // oct-fév
  };

  return (
    <div className="w-full h-72">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, left: 8, bottom: 8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#2c3048" vertical={false} />
          <XAxis
            dataKey="label"
            stroke="#9ca3af"
            tick={{ fontSize: 11 }}
            tickLine={false}
            axisLine={{ stroke: "#2c3048" }}
          />
          <YAxis
            stroke="#9ca3af"
            tick={{ fontSize: 11 }}
            tickLine={false}
            axisLine={{ stroke: "#2c3048" }}
            tickFormatter={(v: number) => `${Math.round(v / 1000)}k €`}
          />
          <Tooltip
            cursor={{ fill: "rgba(255,255,255,0.04)" }}
            contentStyle={{
              backgroundColor: "#1c1f2e",
              border: "1px solid #2c3048",
              borderRadius: "0.5rem",
              fontSize: "0.875rem"
            }}
            labelStyle={{ color: "#e5e7eb", fontWeight: "600", marginBottom: "0.25rem" }}
            formatter={(value, name) => {
              if (name === "total" && typeof value === "number") return [formatEur(value), "CA"];
              return [String(value ?? ""), String(name ?? "")];
            }}
          />
          <Bar dataKey="total" radius={[6, 6, 0, 0]}>
            {data.map((d, i) => <Cell key={i} fill={colorFor(d.monthIdx)} />)}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
      <div className="flex items-center justify-end gap-4 text-xs text-gray-400 mt-2">
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-3 h-3 rounded-sm" style={{ background: "#f97316" }} />
          Saison haute (mars-sept.)
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-3 h-3 rounded-sm" style={{ background: "#3b82f6" }} />
          Saison basse
        </span>
      </div>
    </div>
  );
};

type SalesHeatmapProps = { patterns: VintedPatterns };

const DAY_LABELS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];

const SalesHeatmap: React.FC<SalesHeatmapProps> = ({ patterns }) => {
  const max = Math.max(...patterns.heatmap.map(c => c.count), 1);

  // Color scale : transparent → bleu → orange chaud, échelle racine carrée pour révéler aussi les petits volumes.
  const colorFor = (count: number): string => {
    if (count === 0) return "rgba(255,255,255,0.03)";
    const t = Math.sqrt(count / max); // 0..1
    // gradient from bleu (240°) à orange (25°), saturation 70%, luminosité variable
    const hue = 240 - t * 215;
    const lum = 30 + t * 25;
    return `hsl(${hue}, 70%, ${lum}%)`;
  };

  // Construit une matrice [day][hour] pour accès rapide
  const matrix: number[][] = Array.from({ length: 7 }, () => new Array(24).fill(0));
  const matrixRev: number[][] = Array.from({ length: 7 }, () => new Array(24).fill(0));
  for (const c of patterns.heatmap) {
    matrix[c.day][c.hour] = c.count;
    matrixRev[c.day][c.hour] = c.total_revenue;
  }

  return (
    <div className="overflow-x-auto">
      <div className="min-w-[700px]">
        {/* Header heures */}
        <div className="grid gap-0.5 mb-1" style={{ gridTemplateColumns: "32px repeat(24, minmax(0, 1fr))" }}>
          <div></div>
          {Array.from({ length: 24 }).map((_, h) => (
            <div key={h} className="text-[10px] text-gray-500 text-center">
              {h % 3 === 0 ? `${h}h` : ''}
            </div>
          ))}
        </div>
        {/* Lignes jours */}
        {DAY_LABELS.map((label, d) => (
          <div key={d} className="grid gap-0.5 mb-0.5" style={{ gridTemplateColumns: "32px repeat(24, minmax(0, 1fr))" }}>
            <div className="text-xs text-gray-400 flex items-center">{label}</div>
            {Array.from({ length: 24 }).map((_, h) => {
              const count = matrix[d][h];
              const rev = matrixRev[d][h];
              return (
                <div
                  key={h}
                  className="aspect-square rounded-sm transition-all hover:ring-2 hover:ring-white/40"
                  style={{ backgroundColor: colorFor(count), minHeight: 18 }}
                  title={`${label} ${h}h–${h + 1}h : ${count} vente${count !== 1 ? 's' : ''}${rev > 0 ? ` · ${formatEur(rev)}` : ''}`}
                />
              );
            })}
          </div>
        ))}
        {/* Légende */}
        <div className="flex items-center justify-end gap-2 mt-3 text-xs text-gray-400">
          <span>Faible</span>
          <div className="flex gap-0.5">
            {[0, 0.15, 0.35, 0.6, 0.85, 1].map((t, i) => (
              <div key={i} className="w-4 h-4 rounded-sm" style={{ backgroundColor: colorFor(Math.round(max * t)) }} />
            ))}
          </div>
          <span>Élevé</span>
        </div>
      </div>
    </div>
  );
};

const PatternsInsights: React.FC<{ patterns: VintedPatterns }> = ({ patterns }) => {
  const topDay = [...patterns.by_day_of_week].sort((a, b) => b.count - a.count)[0];
  const topHourBucket = [...patterns.by_hour_of_day].sort((a, b) => b.count - a.count)[0];
  return (
    <div className="text-right text-sm">
      <div>
        <span className="text-gray-400">Meilleur jour : </span>
        <span className="font-semibold text-orange-400">{topDay.label} ({formatInt(topDay.count)})</span>
      </div>
      <div className="mt-1">
        <span className="text-gray-400">Meilleure heure : </span>
        <span className="font-semibold text-orange-400">
          {topHourBucket.hour}h–{topHourBucket.hour + 1}h ({formatInt(topHourBucket.count)})
        </span>
      </div>
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

export default VintedCockpitPage;
