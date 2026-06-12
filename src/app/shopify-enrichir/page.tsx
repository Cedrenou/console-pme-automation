"use client";
import React, { useMemo, useState } from "react";
import Link from "next/link";
import { FaUpload, FaFileCsv, FaCheckCircle, FaTimesCircle, FaSpinner, FaMagic, FaCog } from "react-icons/fa";
import { enrichShopifyProducts, type ShopifyBatchUsage, type ShopifyEnrichResult, type ShopifyEnrichRow } from "@/lib/api";

/**
 * Parser CSV qui gère les valeurs multi-lignes entre guillemets — le CSV
 * enrichissement Sunset contient des champs "Indications pour description"
 * avec des sauts de ligne dans les quotes. Le parser line-based de
 * shopify-catalogue ne suffit pas ici.
 *
 * Séparateur : `,` — quotes : `"` — escape : `""`.
 */
const parseCsv = (raw: string): Record<string, string>[] => {
  const rows: string[][] = [];
  let cur: string[] = [];
  let buf = "";
  let inQuotes = false;

  for (let i = 0; i < raw.length; i++) {
    const c = raw[i];
    if (c === '"') {
      if (inQuotes && raw[i + 1] === '"') {
        buf += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (c === "," && !inQuotes) {
      cur.push(buf);
      buf = "";
    } else if ((c === "\n" || c === "\r") && !inQuotes) {
      if (c === "\r" && raw[i + 1] === "\n") i++;
      cur.push(buf);
      buf = "";
      if (cur.some(v => v.length > 0)) rows.push(cur);
      cur = [];
    } else {
      buf += c;
    }
  }
  if (buf.length > 0 || cur.length > 0) {
    cur.push(buf);
    if (cur.some(v => v.length > 0)) rows.push(cur);
  }

  if (rows.length === 0) return [];
  const headers = rows[0];
  return rows.slice(1).map(cols => {
    const obj: Record<string, string> = {};
    headers.forEach((h, i) => { obj[h] = (cols[i] ?? "").trim(); });
    return obj;
  });
};

const REQUIRED_HEADERS = ["Code article", "Designation"];
const BATCH_SIZE = 5;
const PARALLEL_BATCHES = 3;

// Cumul des `usage` retournés par chaque batch — un usage null signifie qu'on n'a
// rien obtenu d'Anthropic sur ce batch (uniquement des erreurs avant l'appel modèle).
type AggregatedUsage = ShopifyBatchUsage | null;

type EnrichState =
  | { kind: "idle" }
  | { kind: "running"; done: number; total: number }
  | { kind: "done"; results: ShopifyEnrichResult[]; durationMs: number; usage: AggregatedUsage };

function mergeUsage(a: AggregatedUsage, b: AggregatedUsage): AggregatedUsage {
  if (!a) return b;
  if (!b) return a;
  return {
    model: a.model === b.model ? a.model : `${a.model}+${b.model}`,
    input_tokens: a.input_tokens + b.input_tokens,
    output_tokens: a.output_tokens + b.output_tokens,
    cache_read_input_tokens: a.cache_read_input_tokens + b.cache_read_input_tokens,
    cache_creation_input_tokens: a.cache_creation_input_tokens + b.cache_creation_input_tokens,
    cost_usd: a.cost_usd + b.cost_usd,
    cost_eur: a.cost_eur + b.cost_eur,
  };
}

const ShopifyEnrichirPage = () => {
  const [rows, setRows] = useState<ShopifyEnrichRow[]>([]);
  const [filename, setFilename] = useState<string | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [state, setState] = useState<EnrichState>({ kind: "idle" });
  // Counter, pas booléen : onDragEnter/Leave fire à chaque traversée d'enfant,
  // on incrémente sur Enter et décrémente sur Leave pour éviter le flicker.
  const [dragDepth, setDragDepth] = useState(0);
  const isDragging = dragDepth > 0;

  const handleFile = (file: File) => {
    if (!file.name.toLowerCase().endsWith(".csv") && file.type !== "text/csv") {
      setParseError(`Fichier ignoré : seuls les .csv sont acceptés (reçu ${file.name})`);
      return;
    }
    setParseError(null);
    setState({ kind: "idle" });
    setFilename(file.name);

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const text = String(e.target?.result ?? "");
        const parsed = parseCsv(text);
        if (parsed.length === 0) {
          setParseError("Le fichier ne contient aucune ligne après le header");
          setRows([]);
          return;
        }
        const missing = REQUIRED_HEADERS.filter(h => !(h in parsed[0]));
        if (missing.length > 0) {
          setParseError(`Colonne(s) manquante(s) : ${missing.join(", ")}`);
          setRows([]);
          return;
        }
        const filtered = parsed.filter(r => (r["Code article"] ?? "").length > 0);
        setRows(filtered);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Erreur de parsing";
        setParseError(msg);
        setRows([]);
      }
    };
    reader.readAsText(file, "UTF-8");
  };

  const handleEnrich = async () => {
    if (rows.length === 0 || state.kind === "running") return;
    const started = Date.now();
    const total = rows.length;
    setState({ kind: "running", done: 0, total });

    const batches: ShopifyEnrichRow[][] = [];
    for (let i = 0; i < rows.length; i += BATCH_SIZE) {
      batches.push(rows.slice(i, i + BATCH_SIZE));
    }

    const allResults: ShopifyEnrichResult[] = [];
    let aggregatedUsage: AggregatedUsage = null;
    let done = 0;

    // Pool de workers : PARALLEL_BATCHES requêtes simultanées
    let nextBatch = 0;
    const worker = async () => {
      while (true) {
        const idx = nextBatch++;
        if (idx >= batches.length) return;
        const batch = batches[idx];
        try {
          const resp = await enrichShopifyProducts(batch);
          allResults.push(...resp.results);
          if (resp.usage) aggregatedUsage = mergeUsage(aggregatedUsage, resp.usage);
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : "Erreur batch";
          for (const row of batch) {
            allResults.push({
              code_article: row["Code article"] ?? "?",
              status: "error",
              error: msg,
            });
          }
        }
        done += batch.length;
        setState({ kind: "running", done, total });
      }
    };

    await Promise.all(Array.from({ length: PARALLEL_BATCHES }, worker));

    setState({ kind: "done", results: allResults, durationMs: Date.now() - started, usage: aggregatedUsage });
  };

  const handleReset = () => {
    setRows([]);
    setFilename(null);
    setParseError(null);
    setState({ kind: "idle" });
  };

  const previewRows = useMemo(() => rows.slice(0, 10), [rows]);
  const summary = useMemo(() => {
    if (state.kind !== "done") return null;
    return state.results.reduce(
      (acc, r) => ({ ...acc, [r.status]: (acc[r.status] ?? 0) + 1 }),
      { ok: 0, error: 0 } as Record<"ok" | "error", number>,
    );
  }, [state]);

  const errorResults = useMemo(() => {
    if (state.kind !== "done") return [];
    return state.results.filter(r => r.status === "error");
  }, [state]);

  return (
    <div className="min-h-screen bg-app text-fg p-4 md:p-8">
      <div className="mb-8 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-bold mb-2 flex items-center gap-3">
            <FaMagic className="text-purple-400" />
            Enrichir descriptions Shopify
          </h1>
          <p className="text-gray-400">
            Importez un CSV d&apos;enrichissement (Code article, Désignation, Famille, Protections, Doublure, Matière, État,
            Indications). Claude génère les descriptions et SEO, et met à jour les produits Shopify existants.
          </p>
        </div>
        <Link
          href="/shopify-enrichir/parametres"
          className="shrink-0 px-4 py-2 bg-card-2 hover:bg-edge border border-gray-700 hover:border-blue-500 text-gray-200 rounded-lg transition-colors flex items-center gap-2 text-sm"
        >
          <FaCog />
          Paramètres Claude
        </Link>
      </div>

      {/* Upload */}
      <div className="bg-card-2 rounded-2xl shadow-lg p-6 mb-6">
        <div className="flex items-center gap-4 mb-4">
          <FaFileCsv className="text-3xl text-blue-400" />
          <div>
            <h2 className="text-xl font-semibold">1. Sélectionner le CSV</h2>
            <p className="text-sm text-gray-400">
              Le produit doit déjà exister sur Shopify (matching par SKU = Code article).
            </p>
          </div>
        </div>
        <label
          onDragEnter={(e) => {
            e.preventDefault();
            setDragDepth(d => d + 1);
          }}
          onDragLeave={(e) => {
            e.preventDefault();
            setDragDepth(d => Math.max(0, d - 1));
          }}
          onDragOver={(e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = "copy";
          }}
          onDrop={(e) => {
            e.preventDefault();
            setDragDepth(0);
            const file = e.dataTransfer.files?.[0];
            if (file) handleFile(file);
          }}
          className={`flex flex-col items-center justify-center gap-2 px-6 py-10 border-2 border-dashed rounded-xl cursor-pointer transition-colors ${
            isDragging
              ? "border-purple-400 bg-purple-500/10"
              : "border-gray-600 hover:border-blue-500 hover:bg-card"
          }`}
          tabIndex={0}
        >
          <FaUpload className={`text-3xl transition-colors ${isDragging ? "text-purple-300" : "text-gray-400"}`} />
          <span className="text-gray-300">
            {isDragging ? (
              <strong className="text-purple-200">Relâche pour charger le fichier</strong>
            ) : filename ? (
              <strong className="text-fg">{filename}</strong>
            ) : (
              <>Glisser-déposer un CSV ici, ou <span className="text-blue-400 underline">cliquer pour choisir</span></>
            )}
          </span>
          <input
            type="file"
            accept=".csv,text/csv"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleFile(file);
            }}
            className="hidden"
          />
        </label>
      </div>

      {parseError && (
        <div className="bg-red-900/40 border border-red-700 rounded-2xl p-4 mb-6 flex items-start gap-3">
          <FaTimesCircle className="text-red-400 text-xl mt-0.5" />
          <p className="text-red-300">{parseError}</p>
        </div>
      )}

      {/* Preview & launch */}
      {rows.length > 0 && state.kind !== "done" && (
        <div className="bg-card-2 rounded-2xl shadow-lg p-6 mb-6">
          <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
            <div>
              <h2 className="text-xl font-semibold">2. Vérifier &amp; enrichir</h2>
              <p className="text-sm text-gray-400">
                <strong className="text-fg">{rows.length}</strong> produit(s) à enrichir — estimation ~
                {Math.ceil((rows.length * 5) / 60)} min via Claude Sonnet 4.6.
              </p>
            </div>
            <button
              type="button"
              onClick={handleEnrich}
              disabled={state.kind === "running"}
              aria-label="Lancer l'enrichissement"
              className="px-6 py-3 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white rounded-lg font-semibold transition-colors flex items-center gap-2"
            >
              {state.kind === "running" ? (
                <><FaSpinner className="animate-spin" /> {state.done} / {state.total} enrichis…</>
              ) : (
                <><FaMagic /> Lancer l&apos;enrichissement</>
              )}
            </button>
          </div>

          {state.kind === "running" && (
            <div className="mb-4">
              <div className="w-full bg-card rounded-full h-2 overflow-hidden">
                <div
                  className="h-full bg-purple-500 transition-all duration-300"
                  style={{ width: `${Math.round((state.done / state.total) * 100)}%` }}
                />
              </div>
            </div>
          )}

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-gray-400 border-b border-gray-700">
                <tr>
                  <th className="text-left py-2 pr-4">Code article</th>
                  <th className="text-left py-2 pr-4">Désignation</th>
                  <th className="text-left py-2 pr-4">Famille</th>
                  <th className="text-left py-2">Taille</th>
                </tr>
              </thead>
              <tbody>
                {previewRows.map((r) => (
                  <tr key={r["Code article"]} className="border-b border-gray-800">
                    <td className="py-2 pr-4 font-mono">{r["Code article"]}</td>
                    <td className="py-2 pr-4 text-gray-300">{r["Designation"]}</td>
                    <td className="py-2 pr-4 text-gray-400">{r["Famille"]}</td>
                    <td className="py-2 text-gray-400">{r["Taille"] || <span className="italic">—</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {rows.length > 10 && (
              <p className="text-xs text-gray-500 mt-3 italic">
                + {rows.length - 10} autres produits non affichés
              </p>
            )}
          </div>
        </div>
      )}

      {/* Result */}
      {state.kind === "done" && summary && (
        <div className="bg-card-2 rounded-2xl shadow-lg p-6 mb-6">
          <div className="flex items-center gap-3 mb-4">
            {summary.error === 0 ? (
              <FaCheckCircle className="text-green-400 text-3xl" />
            ) : (
              <FaTimesCircle className="text-yellow-400 text-3xl" />
            )}
            <h2 className="text-2xl font-bold">Résultat de l&apos;enrichissement</h2>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-6">
            <div className="bg-card rounded-xl p-4">
              <div className="text-gray-400 text-sm">Total traités</div>
              <div className="text-2xl font-bold">{state.results.length}</div>
            </div>
            <div className="bg-green-900/30 border border-green-700 rounded-xl p-4">
              <div className="text-green-300 text-sm">Enrichis</div>
              <div className="text-2xl font-bold text-green-400">{summary.ok}</div>
            </div>
            <div className={`rounded-xl p-4 border ${summary.error > 0 ? "bg-red-900/30 border-red-700" : "bg-card border-gray-700"}`}>
              <div className={`text-sm ${summary.error > 0 ? "text-red-300" : "text-gray-400"}`}>Erreurs</div>
              <div className={`text-2xl font-bold ${summary.error > 0 ? "text-red-400" : "text-fg"}`}>{summary.error}</div>
            </div>
          </div>

          <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-gray-500 mb-3">
            <span>Durée : {(state.durationMs / 1000).toFixed(1)}s</span>
            {state.usage && (
              <>
                <span>
                  Coût : <span className="text-gray-300">
                    {state.usage.cost_eur < 0.01
                      ? `${(state.usage.cost_eur * 100).toFixed(2)} ¢ €`
                      : `${state.usage.cost_eur.toFixed(3)} €`}
                  </span>
                  <span className="text-gray-600 ml-1">(≈ ${state.usage.cost_usd.toFixed(3)})</span>
                </span>
                <span>
                  Tokens : <span className="text-gray-300">{state.usage.input_tokens.toLocaleString("fr-FR")} in</span>
                  {" / "}
                  <span className="text-gray-300">{state.usage.output_tokens.toLocaleString("fr-FR")} out</span>
                </span>
                <span>Modèle : <span className="text-gray-300 font-mono">{state.usage.model}</span></span>
              </>
            )}
          </div>

          {errorResults.length > 0 && (
            <div className="bg-card rounded-xl p-4 max-h-64 overflow-y-auto">
              <h3 className="text-sm font-semibold text-red-300 mb-2">SKUs en erreur :</h3>
              <ul className="text-sm space-y-1">
                {errorResults.map((r) => (
                  <li key={r.code_article} className="font-mono text-red-200">
                    {r.code_article} <span className="text-gray-400 italic ml-2">{r.error}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <button
            type="button"
            onClick={handleReset}
            className="mt-6 px-6 py-2 bg-gray-700 hover:bg-gray-600 text-fg rounded-lg transition-colors"
          >
            Faire un nouvel enrichissement
          </button>
        </div>
      )}
    </div>
  );
};

export default ShopifyEnrichirPage;
