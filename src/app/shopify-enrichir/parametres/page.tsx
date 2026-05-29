"use client";
import React, { useEffect, useState } from "react";
import Link from "next/link";
import { FaArrowLeft, FaSave, FaSpinner, FaCheckCircle, FaTimesCircle } from "react-icons/fa";
import { fetchLambdaDetails, updateLambda } from "@/lib/api";

const LAMBDA_NAME = "uploadProductToShopify";

// Modèles Claude proposés. Le label sert d'aide à la décision (coût/qualité).
const MODEL_OPTIONS = [
  { value: "claude-sonnet-4-6", label: "Sonnet 4.6 — équilibre coût/qualité (recommandé)" },
  { value: "claude-opus-4-7", label: "Opus 4.7 — qualité max, ~5× plus cher" },
  { value: "claude-haiku-4-5", label: "Haiku 4.5 — ~3× moins cher, qualité un peu en dessous" },
] as const;

type ConfigShape = {
  model: string;
  maxTokens: string; // input forms manipulent toujours des strings
  systemPrompt: string;
  claudePrompt: string;
};

const DEFAULT_CONFIG: ConfigShape = {
  model: "claude-sonnet-4-6",
  maxTokens: "2048",
  systemPrompt: "",
  claudePrompt: "",
};

const ShopifyEnrichirParametresPage = () => {
  const [config, setConfig] = useState<ConfigShape>(DEFAULT_CONFIG);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);

  useEffect(() => {
    const load = async () => {
      try {
        const data = await fetchLambdaDetails(LAMBDA_NAME) as { config: Record<string, string | number> };
        setConfig({
          model: String(data.config?.model ?? DEFAULT_CONFIG.model),
          maxTokens: String(data.config?.maxTokens ?? DEFAULT_CONFIG.maxTokens),
          systemPrompt: String(data.config?.systemPrompt ?? ""),
          claudePrompt: String(data.config?.claudePrompt ?? ""),
        });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Erreur de chargement";
        setLoadError(msg);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const handleSave = async () => {
    setSaving(true);
    setSaveError(null);
    setSaveSuccess(false);

    const parsedTokens = Number(config.maxTokens);
    if (!Number.isFinite(parsedTokens) || parsedTokens < 256 || parsedTokens > 8192) {
      setSaveError("maxTokens doit être un nombre entre 256 et 8192");
      setSaving(false);
      return;
    }
    if (config.claudePrompt.trim().length < 50) {
      setSaveError("Le prompt principal est trop court (50 caractères minimum)");
      setSaving(false);
      return;
    }

    try {
      // L'API attend Record<string,string>. La Lambda côté serveur coerce maxTokens en number.
      await updateLambda(LAMBDA_NAME, {
        model: config.model,
        maxTokens: String(parsedTokens),
        systemPrompt: config.systemPrompt,
        claudePrompt: config.claudePrompt,
      });
      setSaveSuccess(true);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Erreur de sauvegarde";
      setSaveError(msg);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#151826] text-white p-8 flex items-center justify-center">
        <FaSpinner className="animate-spin text-3xl text-blue-400" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#151826] text-white p-4 md:p-8">
      <div className="mb-6">
        <Link
          href="/shopify-enrichir"
          className="inline-flex items-center gap-2 text-sm text-gray-400 hover:text-white transition-colors"
        >
          <FaArrowLeft /> Retour à l&apos;enrichissement
        </Link>
        <h1 className="text-3xl font-bold mt-2">Paramètres Claude</h1>
        <p className="text-gray-400 mt-1">
          Ces paramètres s&apos;appliquent à toute la Lambda <code className="text-blue-300">{LAMBDA_NAME}</code>.
          Pas de redéploiement nécessaire — la prise en compte est immédiate (cache 5 min côté Lambda).
        </p>
      </div>

      {loadError && (
        <div className="bg-red-900/40 border border-red-700 rounded-2xl p-4 mb-6 flex items-start gap-3">
          <FaTimesCircle className="text-red-400 text-xl mt-0.5" />
          <p className="text-red-300">{loadError}</p>
        </div>
      )}

      <div className="space-y-6">
        {/* Model */}
        <section className="bg-[#23263A] rounded-2xl shadow-lg p-6">
          <label className="block">
            <span className="text-lg font-semibold mb-1 block">Modèle Claude</span>
            <span className="text-sm text-gray-400 mb-3 block">
              Switch entre modèles sans redéploy. Tester Haiku avant d&apos;en faire le défaut.
            </span>
            <select
              value={config.model}
              onChange={(e) => setConfig({ ...config, model: e.target.value })}
              className="w-full bg-[#1c1f2e] border border-gray-600 rounded-lg px-4 py-2 text-white focus:border-blue-500 focus:outline-none"
            >
              {MODEL_OPTIONS.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </label>
        </section>

        {/* Max tokens */}
        <section className="bg-[#23263A] rounded-2xl shadow-lg p-6">
          <label className="block">
            <span className="text-lg font-semibold mb-1 block">Max tokens par réponse</span>
            <span className="text-sm text-gray-400 mb-3 block">
              Limite haute. 2048 ≈ description HTML détaillée + SEO + tags. Baisser réduit le coût mais
              risque de tronquer les longues descriptions.
            </span>
            <input
              type="number"
              min={256}
              max={8192}
              step={128}
              value={config.maxTokens}
              onChange={(e) => setConfig({ ...config, maxTokens: e.target.value })}
              className="w-32 bg-[#1c1f2e] border border-gray-600 rounded-lg px-4 py-2 text-white focus:border-blue-500 focus:outline-none"
            />
          </label>
        </section>

        {/* System prompt */}
        <section className="bg-[#23263A] rounded-2xl shadow-lg p-6">
          <label className="block">
            <span className="text-lg font-semibold mb-1 block">System prompt (persona)</span>
            <span className="text-sm text-gray-400 mb-3 block">
              Définit le rôle et le ton du rédacteur. Reste stable entre les rows — ne contient pas
              les données produit.
            </span>
            <textarea
              value={config.systemPrompt}
              onChange={(e) => setConfig({ ...config, systemPrompt: e.target.value })}
              rows={6}
              className="w-full bg-[#1c1f2e] border border-gray-600 rounded-lg px-4 py-2 text-white font-mono text-sm focus:border-blue-500 focus:outline-none resize-y"
              placeholder="Tu es en charge de rédiger des fiches produit pour SUNSET RIDER..."
            />
          </label>
        </section>

        {/* Claude prompt */}
        <section className="bg-[#23263A] rounded-2xl shadow-lg p-6">
          <label className="block">
            <span className="text-lg font-semibold mb-1 block">Prompt principal</span>
            <span className="text-sm text-gray-400 mb-3 block">
              Instructions détaillées pour chaque produit. Les placeholders disponibles :{" "}
              <code className="text-blue-300">${"{product.nom_produit}"}</code>,{" "}
              <code className="text-blue-300">${"{product.marque}"}</code>,{" "}
              <code className="text-blue-300">${"{product.categorie}"}</code>,{" "}
              <code className="text-blue-300">${"{product.taille}"}</code>,{" "}
              <code className="text-blue-300">${"{product.etat}"}</code>,{" "}
              <code className="text-blue-300">${"{product.genre}"}</code>,{" "}
              <code className="text-blue-300">${"{product.matiere}"}</code>,{" "}
              <code className="text-blue-300">${"{product.protections}"}</code>,{" "}
              <code className="text-blue-300">${"{product.doublure}"}</code>,{" "}
              <code className="text-blue-300">${"{product.indications}"}</code>.
            </span>
            <textarea
              value={config.claudePrompt}
              onChange={(e) => setConfig({ ...config, claudePrompt: e.target.value })}
              rows={20}
              className="w-full bg-[#1c1f2e] border border-gray-600 rounded-lg px-4 py-2 text-white font-mono text-xs focus:border-blue-500 focus:outline-none resize-y"
            />
            <p className="text-xs text-gray-500 mt-2">
              {config.claudePrompt.length} caractères
            </p>
          </label>
        </section>

        {/* Save */}
        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="px-6 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white rounded-lg font-semibold transition-colors flex items-center gap-2"
          >
            {saving ? <><FaSpinner className="animate-spin" /> Sauvegarde…</> : <><FaSave /> Sauvegarder</>}
          </button>
          {saveSuccess && (
            <span className="text-green-400 flex items-center gap-2">
              <FaCheckCircle /> Sauvegardé
            </span>
          )}
          {saveError && (
            <span className="text-red-400 flex items-center gap-2">
              <FaTimesCircle /> {saveError}
            </span>
          )}
        </div>
      </div>
    </div>
  );
};

export default ShopifyEnrichirParametresPage;
