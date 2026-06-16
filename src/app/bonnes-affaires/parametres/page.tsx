"use client";
import React, { useEffect, useState } from "react";
import Link from "next/link";
import { FaArrowLeft, FaSave, FaSpinner, FaCheckCircle, FaTimesCircle } from "react-icons/fa";
import { fetchLambdaDetails, updateLambda } from "@/lib/api";

// Item de config (clientA, agent-bonnes-affaires) dans ClientLambdas.
const LAMBDA_NAME = "agent-bonnes-affaires";

const MODEL_OPTIONS = [
  { value: "claude-opus-4-8", label: "Opus 4.8 — meilleur jugement (recommandé, faible volume)" },
  { value: "claude-sonnet-4-6", label: "Sonnet 4.6 — équilibre coût/qualité" },
  { value: "claude-haiku-4-5", label: "Haiku 4.5 — le moins cher" },
] as const;

const SORT_OPTIONS = [
  { value: "newest", label: "Plus récentes d'abord" },
  { value: "relevance", label: "Pertinence" },
  { value: "cheapest", label: "Moins chères d'abord" },
  { value: "oldest", label: "Plus anciennes" },
  { value: "expensive", label: "Plus chères d'abord" },
] as const;

const OWNER_OPTIONS = [
  { value: "private", label: "Particuliers" },
  { value: "all", label: "Tous" },
  { value: "pro", label: "Pros" },
] as const;

// Toutes les valeurs sont stockées en string côté DynamoDB (config map).
type ConfigShape = {
  queries: string;
  sort: string;
  owner: string;
  priceMin: string;
  priceMax: string;
  limit: string;
  pages: string;
  maxRequests: string;
  reqDelayMin: string;
  reqDelayMax: string;
  apparelOnly: boolean;
  shippableOnly: boolean;
  minMarginEur: string;
  minMarginPctDisplay: string;   // en % dans l'UI (stocké en fraction)
  modelMinSales: string;
  categoryMinSales: string;
  aiEnabled: boolean;
  aiModel: string;
  aiMaxCandidates: string;
};

const DEFAULT_CONFIG: ConfigShape = {
  queries: "blouson moto,veste moto,pantalon moto,bottes moto,gants moto,combinaison moto,dorsale moto",
  sort: "newest", owner: "private",
  priceMin: "0", priceMax: "300",
  limit: "100", pages: "1", maxRequests: "8",
  reqDelayMin: "45", reqDelayMax: "120",
  apparelOnly: true, shippableOnly: false,
  minMarginEur: "30", minMarginPctDisplay: "20",
  modelMinSales: "2", categoryMinSales: "25",
  aiEnabled: true, aiModel: "claude-opus-4-8", aiMaxCandidates: "15",
};

const asBool = (v: unknown) => String(v) === "1" || String(v) === "true";

const Section: React.FC<{ title: string; desc?: string; children: React.ReactNode }> = ({ title, desc, children }) => (
  <section className="bg-card-2 rounded-2xl shadow-lg p-6">
    <h2 className="text-lg font-semibold mb-1">{title}</h2>
    {desc && <p className="text-sm text-gray-400 mb-4">{desc}</p>}
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">{children}</div>
  </section>
);

const NumberField: React.FC<{
  label: string; value: string; onChange: (v: string) => void; step?: number; min?: number; hint?: string;
}> = ({ label, value, onChange, step = 1, min = 0, hint }) => (
  <label className="block">
    <span className="text-sm font-medium block mb-1">{label}</span>
    <input
      type="number" step={step} min={min} value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full bg-card border border-gray-600 rounded-lg px-3 py-2 text-fg focus:border-blue-500 focus:outline-none"
    />
    {hint && <span className="text-xs text-gray-500 mt-1 block">{hint}</span>}
  </label>
);

const BonnesAffairesParametresPage = () => {
  const [config, setConfig] = useState<ConfigShape>(DEFAULT_CONFIG);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);

  useEffect(() => {
    const load = async () => {
      try {
        const data = await fetchLambdaDetails(LAMBDA_NAME) as { config?: Record<string, string> };
        const c = data.config ?? {};
        const pct = c.minMarginPct !== undefined ? Math.round(Number(c.minMarginPct) * 100) : 20;
        setConfig({
          queries: c.queries ?? DEFAULT_CONFIG.queries,
          sort: c.sort ?? DEFAULT_CONFIG.sort,
          owner: c.owner ?? DEFAULT_CONFIG.owner,
          priceMin: String(c.priceMin ?? DEFAULT_CONFIG.priceMin),
          priceMax: String(c.priceMax ?? DEFAULT_CONFIG.priceMax),
          limit: String(c.limit ?? DEFAULT_CONFIG.limit),
          pages: String(c.pages ?? DEFAULT_CONFIG.pages),
          maxRequests: String(c.maxRequests ?? DEFAULT_CONFIG.maxRequests),
          reqDelayMin: String(c.reqDelayMin ?? DEFAULT_CONFIG.reqDelayMin),
          reqDelayMax: String(c.reqDelayMax ?? DEFAULT_CONFIG.reqDelayMax),
          apparelOnly: c.apparelOnly !== undefined ? asBool(c.apparelOnly) : true,
          shippableOnly: c.shippableOnly !== undefined ? asBool(c.shippableOnly) : false,
          minMarginEur: String(c.minMarginEur ?? DEFAULT_CONFIG.minMarginEur),
          minMarginPctDisplay: String(Number.isFinite(pct) ? pct : 20),
          modelMinSales: String(c.modelMinSales ?? DEFAULT_CONFIG.modelMinSales),
          categoryMinSales: String(c.categoryMinSales ?? DEFAULT_CONFIG.categoryMinSales),
          aiEnabled: c.aiEnabled !== undefined ? asBool(c.aiEnabled) : true,
          aiModel: c.aiModel ?? DEFAULT_CONFIG.aiModel,
          aiMaxCandidates: String(c.aiMaxCandidates ?? DEFAULT_CONFIG.aiMaxCandidates),
        });
      } catch (err: unknown) {
        setLoadError(err instanceof Error ? err.message : "Erreur de chargement");
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const set = (patch: Partial<ConfigShape>) => setConfig((c) => ({ ...c, ...patch }));

  const handleSave = async () => {
    setSaving(true); setSaveError(null); setSaveSuccess(false);

    const pct = Number(config.minMarginPctDisplay);
    if (!Number.isFinite(pct) || pct < 0 || pct > 100) {
      setSaveError("Le taux de marge doit être un pourcentage entre 0 et 100.");
      setSaving(false); return;
    }
    if (config.queries.trim().length === 0) {
      setSaveError("Au moins une recherche est requise.");
      setSaving(false); return;
    }
    if (Number(config.reqDelayMin) > Number(config.reqDelayMax)) {
      setSaveError("Le délai mini ne peut pas dépasser le délai maxi.");
      setSaving(false); return;
    }

    try {
      await updateLambda(LAMBDA_NAME, {
        queries: config.queries.split(",").map((q) => q.trim()).filter(Boolean).join(","),
        sort: config.sort,
        owner: config.owner,
        priceMin: String(Number(config.priceMin)),
        priceMax: String(Number(config.priceMax)),
        limit: String(Number(config.limit)),
        pages: String(Number(config.pages)),
        maxRequests: String(Number(config.maxRequests)),
        reqDelayMin: String(Number(config.reqDelayMin)),
        reqDelayMax: String(Number(config.reqDelayMax)),
        apparelOnly: config.apparelOnly ? "1" : "0",
        shippableOnly: config.shippableOnly ? "1" : "0",
        minMarginEur: String(Number(config.minMarginEur)),
        minMarginPct: String(pct / 100),
        modelMinSales: String(Number(config.modelMinSales)),
        categoryMinSales: String(Number(config.categoryMinSales)),
        aiEnabled: config.aiEnabled ? "1" : "0",
        aiModel: config.aiModel,
        aiMaxCandidates: String(Number(config.aiMaxCandidates)),
      });
      setSaveSuccess(true);
    } catch (err: unknown) {
      setSaveError(err instanceof Error ? err.message : "Erreur de sauvegarde");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-app text-fg p-8 flex items-center justify-center">
        <FaSpinner className="animate-spin text-3xl text-blue-400" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-app text-fg p-4 md:p-8">
      <div className="mb-6">
        <Link href="/bonnes-affaires" className="inline-flex items-center gap-2 text-sm text-gray-400 hover:text-fg transition-colors">
          <FaArrowLeft /> Retour aux bonnes affaires
        </Link>
        <h1 className="text-3xl font-bold mt-2">Paramètres de l&apos;agent à bonnes affaires</h1>
        <p className="text-gray-400 mt-1">
          Pilote le scan Leboncoin, le scoring et l&apos;étape IA. Pris en compte au prochain run de l&apos;agent (CRON hebdo).
        </p>
      </div>

      {loadError && (
        <div className="bg-red-900/40 border border-red-700 rounded-2xl p-4 mb-6 flex items-start gap-3">
          <FaTimesCircle className="text-red-400 text-xl mt-0.5" />
          <p className="text-red-300">{loadError}</p>
        </div>
      )}

      <div className="space-y-6">
        <Section title="Recherches Leboncoin" desc="Une recherche par mot-clé (catégorie Équipement moto). Sépare par des virgules.">
          <label className="block sm:col-span-2">
            <span className="text-sm font-medium block mb-1">Mots-clés</span>
            <textarea
              value={config.queries} onChange={(e) => set({ queries: e.target.value })} rows={3}
              className="w-full bg-card border border-gray-600 rounded-lg px-3 py-2 text-fg font-mono text-sm focus:border-blue-500 focus:outline-none resize-y"
            />
          </label>
          <label className="block">
            <span className="text-sm font-medium block mb-1">Tri</span>
            <select value={config.sort} onChange={(e) => set({ sort: e.target.value })}
              className="w-full bg-card border border-gray-600 rounded-lg px-3 py-2 text-fg focus:border-blue-500 focus:outline-none">
              {SORT_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="text-sm font-medium block mb-1">Type de vendeur</span>
            <select value={config.owner} onChange={(e) => set({ owner: e.target.value })}
              className="w-full bg-card border border-gray-600 rounded-lg px-3 py-2 text-fg focus:border-blue-500 focus:outline-none">
              {OWNER_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </label>
          <NumberField label="Prix min (€)" value={config.priceMin} onChange={(v) => set({ priceMin: v })} />
          <NumberField label="Prix max (€)" value={config.priceMax} onChange={(v) => set({ priceMax: v })} />
          <label className="flex items-center gap-2 sm:col-span-2 mt-1">
            <input type="checkbox" checked={config.apparelOnly} onChange={(e) => set({ apparelOnly: e.target.checked })} className="w-4 h-4" />
            <span className="text-sm">Équipement uniquement (exclut les pièces mécaniques)</span>
          </label>
          <label className="flex items-center gap-2 sm:col-span-2">
            <input type="checkbox" checked={config.shippableOnly} onChange={(e) => set({ shippableOnly: e.target.checked })} className="w-4 h-4" />
            <span className="text-sm">Annonces « livraison possible » uniquement
              <span className="text-gray-500"> (décoché = on capte aussi les vendeurs qui ont oublié de cocher)</span></span>
          </label>
        </Section>

        <Section title="Cadence & anti-ban" desc="Volume et espacement des requêtes pour rester sous le radar Datadome.">
          <NumberField label="Résultats par recherche" value={config.limit} onChange={(v) => set({ limit: v })} hint="100 = max page LBC" />
          <NumberField label="Pages par mot-clé" value={config.pages} onChange={(v) => set({ pages: v })} />
          <NumberField label="Plafond de requêtes / run" value={config.maxRequests} onChange={(v) => set({ maxRequests: v })} hint="Garde-fou anti-ban" />
          <div />
          <NumberField label="Délai mini entre requêtes (s)" value={config.reqDelayMin} onChange={(v) => set({ reqDelayMin: v })} />
          <NumberField label="Délai maxi entre requêtes (s)" value={config.reqDelayMax} onChange={(v) => set({ reqDelayMax: v })} />
        </Section>

        <Section title="Scoring & marge" desc="Seuils décidant qu'une annonce est une bonne affaire (les prix LBC se négocient → reste tolérant).">
          <NumberField label="Marge minimale (€)" value={config.minMarginEur} onChange={(v) => set({ minMarginEur: v })} />
          <NumberField label="Marge minimale (%)" value={config.minMarginPctDisplay} onChange={(v) => set({ minMarginPctDisplay: v })} hint="Ex : 20 = 20 %" />
          <NumberField label="Ventes min. (match modèle → 🟢)" value={config.modelMinSales} onChange={(v) => set({ modelMinSales: v })} />
          <NumberField label="Ventes min. (catégorie fiable → 🟡)" value={config.categoryMinSales} onChange={(v) => set({ categoryMinSales: v })} />
        </Section>

        <Section title="Étape IA (Claude)" desc="Résumé de l'annonce + affinage du scoring sur les meilleurs candidats.">
          <label className="flex items-center gap-2 sm:col-span-2">
            <input type="checkbox" checked={config.aiEnabled} onChange={(e) => set({ aiEnabled: e.target.checked })} className="w-4 h-4" />
            <span className="text-sm">Activer l&apos;évaluation Claude</span>
          </label>
          <label className="block">
            <span className="text-sm font-medium block mb-1">Modèle</span>
            <select value={config.aiModel} onChange={(e) => set({ aiModel: e.target.value })} disabled={!config.aiEnabled}
              className="w-full bg-card border border-gray-600 rounded-lg px-3 py-2 text-fg focus:border-blue-500 focus:outline-none disabled:opacity-50">
              {MODEL_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </label>
          <NumberField label="Max candidats évalués / run" value={config.aiMaxCandidates} onChange={(v) => set({ aiMaxCandidates: v })} hint="Borne de coût" />
        </Section>

        <div className="flex items-center gap-4">
          <button type="button" onClick={handleSave} disabled={saving}
            className="px-6 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white rounded-lg font-semibold transition-colors flex items-center gap-2">
            {saving ? <><FaSpinner className="animate-spin" /> Sauvegarde…</> : <><FaSave /> Sauvegarder</>}
          </button>
          {saveSuccess && <span className="text-green-400 flex items-center gap-2"><FaCheckCircle /> Sauvegardé</span>}
          {saveError && <span className="text-red-400 flex items-center gap-2"><FaTimesCircle /> {saveError}</span>}
        </div>
      </div>
    </div>
  );
};

export default BonnesAffairesParametresPage;
