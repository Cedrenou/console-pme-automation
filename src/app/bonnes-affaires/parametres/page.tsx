"use client";
import React, { useEffect, useState } from "react";
import Link from "next/link";
import { FaArrowLeft, FaSave, FaSpinner, FaCheckCircle, FaTimesCircle, FaPlus, FaTrash, FaTag } from "react-icons/fa";
import { fetchLambdaDetails, updateLambda, fetchBrandSuggestions, type BrandSuggestion } from "@/lib/api";

// Item de config (clientA, agent-bonnes-affaires) dans ClientLambdas.
const LAMBDA_NAME = "agent-bonnes-affaires";

// Garde-fou anti-ban : nombre maximum de recherches Leboncoin par run.
const MAX_QUERIES = 10;

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
  queries: string[];
  targetBrands: string[];
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
  queries: ["blouson moto", "veste moto", "pantalon moto", "bottes moto", "gants moto", "combinaison moto", "dorsale moto"],
  targetBrands: ["dainese", "alpinestars", "rev'it", "furygan", "ixon", "spidi", "held", "rukka", "shoei", "shark", "tcx", "sidi", "bering", "segura", "richa"],
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
  label: string; value: string; onChange: (v: string) => void; step?: number; min?: number; hint?: string; disabled?: boolean;
}> = ({ label, value, onChange, step = 1, min = 0, hint, disabled = false }) => (
  <label className="block">
    <span className="text-sm font-medium block mb-1">{label}</span>
    <input
      type="number" step={step} min={min} value={value} disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
      className="w-full bg-card border border-gray-600 rounded-lg px-3 py-2 text-fg focus:border-blue-500 focus:outline-none disabled:opacity-60 disabled:cursor-not-allowed"
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
  const [suggestions, setSuggestions] = useState<BrandSuggestion[]>([]);
  const [sugLoading, setSugLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const data = await fetchLambdaDetails(LAMBDA_NAME) as { config?: Record<string, string> };
        const c = data.config ?? {};
        const pct = c.minMarginPct !== undefined ? Math.round(Number(c.minMarginPct) * 100) : 20;
        const parsedQueries = c.queries
          ? String(c.queries).split(",").map((q) => q.trim()).filter(Boolean)
          : [];
        const parsedBrands = c.targetBrands
          ? String(c.targetBrands).split(",").map((b) => b.trim()).filter(Boolean)
          : [];
        setConfig({
          queries: parsedQueries.length ? parsedQueries.slice(0, MAX_QUERIES) : DEFAULT_CONFIG.queries,
          targetBrands: parsedBrands.length ? parsedBrands : DEFAULT_CONFIG.targetBrands,
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

  useEffect(() => {
    fetchBrandSuggestions()
      .then(setSuggestions)
      .catch(() => setSuggestions([]))
      .finally(() => setSugLoading(false));
  }, []);

  const set = (patch: Partial<ConfigShape>) => setConfig((c) => ({ ...c, ...patch }));

  const setQuery = (i: number, val: string) => set({ queries: config.queries.map((q, idx) => (idx === i ? val : q)) });
  const addQuery = () => { if (config.queries.length < MAX_QUERIES) set({ queries: [...config.queries, ""] }); };
  const removeQuery = (i: number) => set({ queries: config.queries.filter((_, idx) => idx !== i) });

  const setBrand = (i: number, val: string) => set({ targetBrands: config.targetBrands.map((b, idx) => (idx === i ? val : b)) });
  const addBrand = () => set({ targetBrands: [...config.targetBrands, ""] });
  const removeBrand = (i: number) => set({ targetBrands: config.targetBrands.filter((_, idx) => idx !== i) });
  const hasBrand = (name: string) => config.targetBrands.some((b) => b.trim().toLowerCase() === name.toLowerCase());
  const addBrandFromSuggestion = (name: string) => {
    if (!hasBrand(name)) set({ targetBrands: [...config.targetBrands.filter((b) => b.trim()), name] });
  };

  const handleSave = async () => {
    setSaving(true); setSaveError(null); setSaveSuccess(false);

    const pct = Number(config.minMarginPctDisplay);
    if (!Number.isFinite(pct) || pct < 0 || pct > 100) {
      setSaveError("Le taux de marge doit être un pourcentage entre 0 et 100.");
      setSaving(false); return;
    }
    const cleanQueries = config.queries.map((q) => q.trim()).filter(Boolean);
    if (cleanQueries.length === 0) {
      setSaveError("Au moins une recherche est requise.");
      setSaving(false); return;
    }
    if (cleanQueries.length > MAX_QUERIES) {
      setSaveError(`Maximum ${MAX_QUERIES} recherches (garde-fou anti-ban).`);
      setSaving(false); return;
    }
    if (Number(config.reqDelayMin) > Number(config.reqDelayMax)) {
      setSaveError("Le délai mini ne peut pas dépasser le délai maxi.");
      setSaving(false); return;
    }

    try {
      await updateLambda(LAMBDA_NAME, {
        queries: cleanQueries.join(","),
        targetBrands: config.targetBrands.map((b) => b.trim().toLowerCase()).filter(Boolean).join(","),
        sort: config.sort,
        owner: config.owner,
        priceMin: String(Number(config.priceMin)),
        priceMax: String(Number(config.priceMax)),
        limit: "100",   // verrouillé : max API LBC par requête
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
        <Section title="Recherches Leboncoin" desc="Une recherche par ligne (catégorie Équipement moto). Cible large (« veste moto ») ou par marque (« blouson dainese »).">
          <div className="sm:col-span-2">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium">Recherches</span>
              <span className={`text-xs ${config.queries.length >= MAX_QUERIES ? "text-amber-400" : "text-gray-500"}`}>
                {config.queries.length}/{MAX_QUERIES}
              </span>
            </div>
            <div className="space-y-2">
              {config.queries.map((q, i) => (
                <div key={i} className="flex items-center gap-2">
                  <input
                    type="text" value={q} onChange={(e) => setQuery(i, e.target.value)}
                    placeholder="ex : blouson dainese"
                    className="flex-1 bg-card border border-gray-600 rounded-lg px-3 py-2 text-fg focus:border-blue-500 focus:outline-none"
                  />
                  <button
                    type="button" onClick={() => removeQuery(i)} disabled={config.queries.length <= 1}
                    title="Supprimer cette recherche"
                    className="p-2.5 rounded-lg text-gray-400 hover:text-red-400 hover:bg-card disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                  >
                    <FaTrash />
                  </button>
                </div>
              ))}
            </div>
            <button
              type="button" onClick={addQuery} disabled={config.queries.length >= MAX_QUERIES}
              className="mt-3 inline-flex items-center gap-2 text-sm px-3 py-2 rounded-lg bg-card border border-gray-600 hover:border-blue-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              <FaPlus className="text-xs" /> Ajouter une recherche
            </button>
            {config.queries.length >= MAX_QUERIES && (
              <p className="text-xs text-amber-400 mt-2">Maximum {MAX_QUERIES} recherches atteint (garde-fou anti-ban).</p>
            )}
            {config.queries.filter((q) => q.trim()).length > Number(config.maxRequests) && (
              <p className="text-xs text-amber-400 mt-2">
                ⚠️ {config.queries.filter((q) => q.trim()).length} recherches &gt; plafond de {config.maxRequests} requêtes/run :
                les dernières seront ignorées. Augmente le plafond (section Cadence) ou réduis les recherches.
              </p>
            )}
          </div>
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

        <Section title="Marques cibles" desc="Seule une annonce dont la marque est dans cette liste peut être flaggée 🟢/🟡 (marque détectée dans le titre).">
          <div className="sm:col-span-2">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {config.targetBrands.map((b, i) => (
                <div key={i} className="flex items-center gap-1.5">
                  <input
                    type="text" value={b} onChange={(e) => setBrand(i, e.target.value)} placeholder="ex : dainese"
                    className="flex-1 min-w-0 bg-card border border-gray-600 rounded-lg px-3 py-2 text-fg text-sm focus:border-blue-500 focus:outline-none"
                  />
                  <button type="button" onClick={() => removeBrand(i)} title="Retirer cette marque"
                    className="p-2 rounded-lg text-gray-400 hover:text-red-400 hover:bg-card transition-colors">
                    <FaTrash className="text-xs" />
                  </button>
                </div>
              ))}
            </div>
            <button type="button" onClick={addBrand}
              className="mt-3 inline-flex items-center gap-2 text-sm px-3 py-2 rounded-lg bg-card border border-gray-600 hover:border-blue-500 transition-colors">
              <FaPlus className="text-xs" /> Ajouter une marque
            </button>
          </div>

          <div className="sm:col-span-2 border-t border-edge pt-4 mt-1">
            <div className="flex items-center gap-2 mb-1">
              <FaTag className="text-emerald-400 text-sm" />
              <span className="text-sm font-medium">Suggestions d&apos;après tes ventes</span>
            </div>
            <p className="text-xs text-gray-400 mb-3">
              Marques qui se vendent le mieux dans ton historique Vinted (365 j). Clique pour ajouter à ta liste.
            </p>
            {sugLoading ? (
              <div className="text-sm text-gray-500 flex items-center gap-2"><FaSpinner className="animate-spin" /> Analyse de tes ventes…</div>
            ) : suggestions.length === 0 ? (
              <p className="text-sm text-gray-500 italic">Aucune suggestion disponible.</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {suggestions.slice(0, 20).map((s) => {
                  const added = hasBrand(s.brand);
                  return (
                    <button
                      key={s.brand} type="button" disabled={added} onClick={() => addBrandFromSuggestion(s.brand)}
                      title={`${s.sales} ventes · ${s.revenue.toLocaleString("fr-FR")} €`}
                      className={`inline-flex items-center gap-2 text-sm px-3 py-1.5 rounded-full border transition-colors ${
                        added ? "border-emerald-600/40 bg-emerald-600/10 text-emerald-300 cursor-default"
                              : "border-gray-600 bg-card hover:border-blue-500 text-gray-200 cursor-pointer"
                      }`}
                    >
                      {added ? <FaCheckCircle className="text-xs" /> : <FaPlus className="text-xs" />}
                      <span className="font-medium">{s.brand}</span>
                      <span className="text-xs text-gray-400">{s.sales}× · {s.revenue.toLocaleString("fr-FR")} €</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </Section>

        <Section title="Cadence & anti-ban" desc="Volume et espacement des requêtes pour rester sous le radar Datadome.">
          <NumberField label="Résultats par recherche" value="100" onChange={() => {}} disabled hint="🔒 Verrouillé : maximum de l'API Leboncoin par requête (100). Au-delà il faudrait paginer (+ de requêtes = risque de ban)." />
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
