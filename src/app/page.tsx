"use client";
import React, { useEffect, useState } from "react";
import Link from "next/link";
import {
  fetchVintedStats, fetchVintedTimeline, fetchVintedPatterns, fetchVintedTopArticles,
  type VintedStats, type VintedTimeline, type VintedPatterns, type VintedTopArticles
} from "@/lib/api";
import { FaCalendarAlt, FaEuroSign, FaShoppingBag, FaRocket, FaUniversity, FaUndo, FaArrowRight, FaClock, FaTrophy, FaTshirt, FaLightbulb } from "react-icons/fa";
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
  const [topArticles, setTopArticles] = useState<VintedTopArticles | null>(null);
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
        const [s, tl, p, ta] = await Promise.all([
          fetchVintedStats(from, to),
          fetchVintedTimeline({ type: "transaction", granularity: "month", from: timelineFrom }),
          fetchVintedPatterns({ from, to }),
          fetchVintedTopArticles({ from, to }),
        ]);
        setStats(s);
        setTimeline(tl);
        setPatterns(p);
        setTopArticles(ta);
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

          {topArticles && topArticles.total_count > 0 && (
            <div className="bg-[#23263A] rounded-2xl shadow-lg p-6 mb-8">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h2 className="text-xl font-bold flex items-center gap-2"><FaTshirt className="text-blue-400" /> Top articles vendus</h2>
                  <p className="text-sm text-gray-400">
                    {formatInt(topArticles.total_count)} ventes finalisées — répartition par catégorie, genre et modèle
                  </p>
                </div>
              </div>
              <TopArticlesView data={topArticles} />
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
              <BestPostingTimes patterns={patterns} />
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

type TopArticlesViewProps = { data: VintedTopArticles };

const CATEGORY_COLORS: Record<string, string> = {
  "Veste/Blouson": "#f97316",
  "Bottes/Chaussures": "#3b82f6",
  "Pantalon": "#10b981",
  "Gants": "#a855f7",
  "Casque": "#ec4899",
  "Dorsale/Protection": "#14b8a6",
  "Cuir (combinaison/ensemble)": "#eab308",
  "Sac/Bagagerie": "#6366f1",
  "Accessoire": "#94a3b8",
  "Autre": "#64748b",
};

const GENDER_COLORS: Record<string, string> = {
  "Homme": "#3b82f6",
  "Femme": "#ec4899",
  "Mixte": "#94a3b8",
};

const TopArticlesView: React.FC<TopArticlesViewProps> = ({ data }) => {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Catégorie */}
      <div>
        <h3 className="text-sm font-semibold text-gray-300 mb-3">Par catégorie</h3>
        <div className="space-y-2">
          {data.by_category.map(c => (
            <CategoryRow
              key={c.category}
              label={c.category}
              count={c.count}
              total={c.total_revenue}
              pct={c.share_pct}
              color={CATEGORY_COLORS[c.category] || "#64748b"}
            />
          ))}
        </div>
      </div>

      {/* Genre */}
      <div>
        <h3 className="text-sm font-semibold text-gray-300 mb-3">Par audience</h3>
        <div className="space-y-2 mb-6">
          {data.by_gender.map(g => (
            <CategoryRow
              key={g.gender}
              label={g.gender}
              count={g.count}
              total={g.total_revenue}
              pct={g.share_pct}
              color={GENDER_COLORS[g.gender] || "#94a3b8"}
            />
          ))}
        </div>

        {/* Top titres */}
        <h3 className="text-sm font-semibold text-gray-300 mb-3 flex items-center gap-2">
          <FaTrophy className="text-amber-400 text-xs" /> Top modèles (≥ 2 ventes)
        </h3>
        {data.top_titles.length === 0 ? (
          <p className="text-xs text-gray-500 italic">Pas encore assez de répétitions pour identifier des modèles récurrents.</p>
        ) : (
          <div className="space-y-1.5 max-h-72 overflow-y-auto pr-2">
            {data.top_titles.slice(0, 10).map((t, i) => (
              <div
                key={i}
                className="flex items-start gap-3 p-2.5 rounded bg-[#1c1f2e] hover:bg-[#252839] transition-colors"
                title={t.title}
              >
                <div className="text-amber-400 font-bold text-sm w-5 flex-shrink-0">#{i + 1}</div>
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-medium leading-tight line-clamp-2">{t.title}</div>
                  <div className="text-[11px] text-gray-500 mt-0.5">
                    {t.count} ventes · {formatEur(t.avg_price)} / vente
                  </div>
                </div>
                <div className="text-sm font-bold text-green-400 flex-shrink-0">{formatEur(t.total_revenue)}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

const CategoryRow: React.FC<{ label: string; count: number; total: number; pct: number; color: string }> = ({ label, count, total, pct, color }) => (
  <div>
    <div className="flex items-center justify-between text-sm mb-1">
      <div className="flex items-center gap-2 min-w-0">
        <span className="inline-block w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: color }} />
        <span className="truncate">{label}</span>
      </div>
      <div className="flex items-baseline gap-2 flex-shrink-0">
        <span className="font-semibold">{formatInt(count)}</span>
        <span className="text-xs text-gray-500">({pct.toFixed(1)}%)</span>
        <span className="text-xs text-green-400 font-medium tabular-nums">{formatEur(total)}</span>
      </div>
    </div>
    <div className="h-1.5 bg-[#1c1f2e] rounded overflow-hidden">
      <div className="h-full transition-all" style={{ width: `${pct}%`, background: color }} />
    </div>
  </div>
);

// Détecte les "créneaux chauds" : heures où le volume de ventes dépasse un seuil,
// puis groupe les heures consécutives sur le même jour en fenêtres ("Vendredi 19h-22h").
type PostingWindow = {
  day: number;
  startHour: number;
  endHour: number; // inclusive
  count: number;
  totalRevenue: number;
};

function computeTopPostingWindows(patterns: VintedPatterns, limit = 5): PostingWindow[] {
  // Matrice [day][hour] et seuil "chaud"
  const matrix: { count: number; total_revenue: number }[][] = Array.from({ length: 7 }, () =>
    Array.from({ length: 24 }, () => ({ count: 0, total_revenue: 0 })),
  );
  for (const c of patterns.heatmap) {
    matrix[c.day][c.hour] = { count: c.count, total_revenue: c.total_revenue };
  }
  const max = Math.max(...patterns.heatmap.map(c => c.count), 1);
  // Seuil = 35% du max — capture les vrais pics, ignore le bruit
  const threshold = Math.max(max * 0.35, 1);

  const windows: PostingWindow[] = [];
  for (let d = 0; d < 7; d++) {
    let current: PostingWindow | null = null;
    for (let h = 0; h < 24; h++) {
      const cell = matrix[d][h];
      if (cell.count >= threshold) {
        if (current && h === current.endHour + 1) {
          current.endHour = h;
          current.count += cell.count;
          current.totalRevenue += cell.total_revenue;
        } else {
          if (current) windows.push(current);
          current = { day: d, startHour: h, endHour: h, count: cell.count, totalRevenue: cell.total_revenue };
        }
      } else if (current) {
        windows.push(current);
        current = null;
      }
    }
    if (current) windows.push(current);
  }
  return windows.sort((a, b) => b.count - a.count).slice(0, limit);
}

const BestPostingTimes: React.FC<{ patterns: VintedPatterns }> = ({ patterns }) => {
  const windows = computeTopPostingWindows(patterns, 5);
  if (windows.length === 0) return null;
  const totalCount = patterns.ventes_count || 1;

  return (
    <div className="mt-6 pt-6 border-t border-[#2c3048]">
      <h3 className="text-base font-semibold mb-3 flex items-center gap-2">
        <FaLightbulb className="text-amber-400" />
        <span>Quand poster tes annonces pour qu&apos;elles tombent au pic</span>
      </h3>
      <p className="text-xs text-gray-400 mb-4">
        Les annonces fraîches remontent dans le fil Vinted. Poste sur ces créneaux pour qu&apos;elles soient visibles
        au moment où tes acheteurs sont les plus actifs.
      </p>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {windows.map((w, i) => {
          const pct = (w.count / totalCount) * 100;
          const dayLabel = DAY_LABELS_FULL[w.day];
          const slot = w.startHour === w.endHour
            ? `${w.startHour}h–${w.startHour + 1}h`
            : `${w.startHour}h–${w.endHour + 1}h`;
          return (
            <div
              key={i}
              className="bg-[#1c1f2e] rounded-lg p-3 flex items-center gap-3 border border-[#2c3048]/60"
            >
              <div className="text-amber-400 font-bold text-base w-6 flex-shrink-0">#{i + 1}</div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold text-white">
                  {dayLabel} <span className="text-orange-300">{slot}</span>
                </div>
                <div className="text-[11px] text-gray-400 mt-0.5">
                  {w.count} ventes · {pct.toFixed(1)}% du total
                  {w.totalRevenue > 0 && <span> · {formatEur(w.totalRevenue)}</span>}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

type SalesHeatmapProps = { patterns: VintedPatterns };

const DAY_LABELS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];
const DAY_LABELS_FULL = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];

type HoverState = {
  day: number;
  hour: number;
  count: number;
  revenue: number;
  x: number;
  y: number;
};

const SalesHeatmap: React.FC<SalesHeatmapProps> = ({ patterns }) => {
  const max = Math.max(...patterns.heatmap.map(c => c.count), 1);
  const totalCount = patterns.ventes_count || 1;
  const [hover, setHover] = useState<HoverState | null>(null);

  // Color scale : transparent → bleu → orange chaud, échelle racine carrée pour révéler aussi les petits volumes.
  const colorFor = (count: number): string => {
    if (count === 0) return "rgba(255,255,255,0.03)";
    const t = Math.sqrt(count / max); // 0..1
    const hue = 240 - t * 215;
    const lum = 30 + t * 25;
    return `hsl(${hue}, 70%, ${lum}%)`;
  };

  // Construit une matrice [day][hour] pour accès rapide + totaux par jour et par heure
  const matrix: number[][] = Array.from({ length: 7 }, () => new Array(24).fill(0));
  const matrixRev: number[][] = Array.from({ length: 7 }, () => new Array(24).fill(0));
  const dayTotals: number[] = new Array(7).fill(0);
  const hourTotals: number[] = new Array(24).fill(0);
  for (const c of patterns.heatmap) {
    matrix[c.day][c.hour] = c.count;
    matrixRev[c.day][c.hour] = c.total_revenue;
    dayTotals[c.day] += c.count;
    hourTotals[c.hour] += c.count;
  }
  const maxDayTotal = Math.max(...dayTotals, 1);
  const maxHourTotal = Math.max(...hourTotals, 1);

  const gridTemplate = "32px repeat(24, minmax(0, 1fr)) 56px";

  return (
    <div className="overflow-x-auto relative">
      <div className="min-w-[760px]">
        {/* Header heures */}
        <div className="grid gap-0.5 mb-1" style={{ gridTemplateColumns: gridTemplate }}>
          <div></div>
          {Array.from({ length: 24 }).map((_, h) => (
            <div key={h} className="text-[10px] text-gray-500 text-center">
              {h % 3 === 0 ? `${h}h` : ''}
            </div>
          ))}
          <div className="text-[10px] text-gray-400 text-center font-semibold">Total</div>
        </div>
        {/* Lignes jours */}
        {DAY_LABELS.map((label, d) => (
          <div key={d} className="grid gap-0.5 mb-0.5" style={{ gridTemplateColumns: gridTemplate }}>
            <div className="text-xs text-gray-400 flex items-center">{label}</div>
            {Array.from({ length: 24 }).map((_, h) => {
              const count = matrix[d][h];
              const rev = matrixRev[d][h];
              return (
                <div
                  key={h}
                  className="aspect-square rounded-sm transition-all hover:ring-2 hover:ring-white/60 cursor-default"
                  style={{ backgroundColor: colorFor(count), minHeight: 18 }}
                  onMouseEnter={(e) => setHover({ day: d, hour: h, count, revenue: rev, x: e.clientX, y: e.clientY })}
                  onMouseMove={(e) => setHover(prev => prev ? { ...prev, x: e.clientX, y: e.clientY } : null)}
                  onMouseLeave={() => setHover(null)}
                />
              );
            })}
            {/* Total du jour */}
            <div
              className="text-xs font-semibold text-orange-300 flex items-center justify-end pr-1.5 rounded-sm tabular-nums"
              style={{ background: `rgba(249, 115, 22, ${0.06 + 0.18 * (dayTotals[d] / maxDayTotal)})` }}
              title={`${DAY_LABELS_FULL[d]} : ${dayTotals[d]} ventes au total`}
            >
              {dayTotals[d]}
            </div>
          </div>
        ))}
        {/* Ligne totaux par heure */}
        <div className="grid gap-0.5 mt-2 pt-2 border-t border-[#2c3048]" style={{ gridTemplateColumns: gridTemplate }}>
          <div className="text-[10px] text-gray-400 font-semibold flex items-center">Total</div>
          {Array.from({ length: 24 }).map((_, h) => (
            <div
              key={h}
              className="text-[10px] font-semibold text-orange-300 text-center tabular-nums rounded-sm"
              style={{ background: `rgba(249, 115, 22, ${0.06 + 0.18 * (hourTotals[h] / maxHourTotal)})`, minHeight: 18, lineHeight: '18px' }}
              title={`${h}h–${h + 1}h : ${hourTotals[h]} ventes`}
            >
              {hourTotals[h] > 0 ? hourTotals[h] : ''}
            </div>
          ))}
          <div className="text-[10px] font-bold text-orange-300 flex items-center justify-end pr-1.5 tabular-nums" title="Total ventes sur la période">
            {totalCount}
          </div>
        </div>
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

      {hover && (
        <HeatmapTooltip
          state={hover}
          totalCount={totalCount}
          max={max}
          byHour={patterns.by_hour_of_day}
        />
      )}
    </div>
  );
};

const HeatmapTooltip: React.FC<{
  state: HoverState;
  totalCount: number;
  max: number;
  byHour: VintedPatterns["by_hour_of_day"];
}> = ({ state, totalCount, max, byHour }) => {
  const pct = (state.count / totalCount) * 100;
  const intensity = state.count / max;
  // Position le tooltip à droite du curseur, mais à gauche s'il déborde de l'écran
  const tooltipWidth = 260;
  const overflowsRight = typeof window !== "undefined" && state.x + tooltipWidth + 24 > window.innerWidth;
  const left = overflowsRight ? state.x - tooltipWidth - 12 : state.x + 14;
  const top = state.y - 8;

  // Panier moyen sur la tranche horaire (toutes journées confondues) — plus
  // statistiquement parlant que la moyenne d'une seule case (souvent N=1).
  const hourBucket = byHour.find(b => b.hour === state.hour);
  const hourAvg = hourBucket && hourBucket.count > 0 ? hourBucket.total_revenue / hourBucket.count : null;
  // Panier moyen de la case précise (ce jour-là à cette heure) — affiché en complément si N >= 2
  const cellAvg = state.count >= 2 ? state.revenue / state.count : null;

  return (
    <div
      className="fixed z-50 pointer-events-none bg-[#1c1f2e]/95 backdrop-blur-sm border border-[#2c3048] rounded-lg shadow-2xl px-3.5 py-2.5 text-sm"
      style={{ left, top, width: tooltipWidth }}
    >
      <div className="font-semibold text-white mb-1.5 flex items-center justify-between">
        <span>{DAY_LABELS_FULL[state.day]}</span>
        <span className="text-orange-400 text-xs">{state.hour.toString().padStart(2, '0')}h – {(state.hour + 1).toString().padStart(2, '0')}h</span>
      </div>
      <div className="flex items-baseline gap-1.5 mb-1">
        <span className="text-2xl font-bold text-white">{state.count}</span>
        <span className="text-xs text-gray-400">vente{state.count !== 1 ? 's' : ''}</span>
      </div>
      {state.revenue > 0 && (
        <div className="text-xs text-green-400 mb-1.5">{formatEur(state.revenue)}</div>
      )}
      {(hourAvg !== null || cellAvg !== null) && (
        <div className="border-t border-[#2c3048] pt-1.5 mt-1.5 mb-1.5 space-y-0.5 text-[11px]">
          {hourAvg !== null && (
            <div className="flex items-center justify-between">
              <span className="text-gray-400">Panier moyen sur la tranche</span>
              <span className="text-white font-medium">{formatEur(hourAvg)}</span>
            </div>
          )}
          {cellAvg !== null && cellAvg !== hourAvg && (
            <div className="flex items-center justify-between">
              <span className="text-gray-400">Panier moyen sur cette case</span>
              <span className="text-white font-medium">{formatEur(cellAvg)}</span>
            </div>
          )}
        </div>
      )}
      <div className="border-t border-[#2c3048] pt-1.5 flex items-center justify-between text-xs">
        <span className="text-gray-400">{pct.toFixed(1)}% de la période</span>
        <span className="text-gray-500">{intensity >= 0.8 ? "🔥 pic" : intensity >= 0.5 ? "fort" : intensity >= 0.2 ? "modéré" : state.count > 0 ? "faible" : "—"}</span>
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
