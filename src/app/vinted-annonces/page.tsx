"use client";
import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { FaUpload, FaFileCsv, FaCheckCircle, FaTimesCircle, FaSpinner, FaPenNib, FaCog, FaCopy, FaCheck, FaDownload, FaExclamationTriangle, FaSearch } from "react-icons/fa";
import { fetchLambdaDetails, generateVintedText, type ShopifyBatchUsage, type VintedTextResult, type VintedTextRow } from "@/lib/api";

/**
 * Parser CSV qui gère les valeurs multi-lignes entre guillemets — le CSV Vinted
 * contient des champs "Indications pour description" avec des sauts de ligne dans
 * les quotes. Repris de la page shopify-enrichir.
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

type AggregatedUsage = ShopifyBatchUsage | null;

type GenState =
  | { kind: "idle" }
  | { kind: "running"; done: number; total: number }
  | { kind: "done"; results: VintedTextResult[]; durationMs: number; usage: AggregatedUsage };

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

// Bouton de copie réutilisable (feedback visuel ~1.5s).
const CopyButton = ({ text, label }: { text: string; label: string }) => {
  const [copied, setCopied] = useState(false);
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard indisponible (http non sécurisé) — ignoré */
    }
  };
  return (
    <button
      type="button"
      onClick={handleCopy}
      aria-label={label}
      className={`px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-colors ${
        copied ? "bg-green-600 text-white" : "bg-[#1c1f2e] hover:bg-[#2c3046] text-gray-200 border border-gray-700"
      }`}
    >
      {copied ? <FaCheck /> : <FaCopy />} {copied ? "Copié" : label}
    </button>
  );
};

const VintedAnnoncesPage = () => {
  const [rows, setRows] = useState<VintedTextRow[]>([]);
  const [filename, setFilename] = useState<string | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [state, setState] = useState<GenState>({ kind: "idle" });
  const [dragDepth, setDragDepth] = useState(0);
  const [skuQuery, setSkuQuery] = useState("");
  const isDragging = dragDepth > 0;

  // Garde-fou : les prompts (systemPrompt + claudePrompt) doivent exister dans la
  // config DynamoDB — la Lambda refuse de générer sans (422 MISSING_PROMPT).
  // null = vérification en cours ; en cas d'échec réseau on ne bloque pas (la
  // Lambda reste le backstop).
  const [promptsMissing, setPromptsMissing] = useState<boolean | null>(null);

  useEffect(() => {
    const checkPrompts = async () => {
      try {
        const data = await fetchLambdaDetails("vintedLambdaClaude") as { config?: Record<string, string | number> };
        const systemPrompt = String(data.config?.systemPrompt ?? "").trim();
        const claudePrompt = String(data.config?.claudePrompt ?? "").trim();
        setPromptsMissing(systemPrompt.length === 0 || claudePrompt.length === 0);
      } catch {
        setPromptsMissing(false);
      }
    };
    checkPrompts();
  }, []);

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

  const handleGenerate = async () => {
    if (rows.length === 0 || state.kind === "running" || promptsMissing) return;
    const started = Date.now();
    const total = rows.length;
    setState({ kind: "running", done: 0, total });

    const batches: VintedTextRow[][] = [];
    for (let i = 0; i < rows.length; i += BATCH_SIZE) {
      batches.push(rows.slice(i, i + BATCH_SIZE));
    }

    const allResults: VintedTextResult[] = [];
    let aggregatedUsage: AggregatedUsage = null;
    let done = 0;

    let nextBatch = 0;
    const worker = async () => {
      while (true) {
        const idx = nextBatch++;
        if (idx >= batches.length) return;
        const batch = batches[idx];
        try {
          const resp = await generateVintedText(batch);
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
    setSkuQuery("");
    setState({ kind: "idle" });
  };

  const previewRows = useMemo(() => rows.slice(0, 10), [rows]);

  const okResults = useMemo(
    () => (state.kind === "done" ? state.results.filter(r => r.status === "ok") : []),
    [state],
  );
  const errorResults = useMemo(
    () => (state.kind === "done" ? state.results.filter(r => r.status === "error") : []),
    [state],
  );

  // Recherche par SKU/UGS (et titre) dans les annonces générées — filtre
  // uniquement l'affichage des cartes ; "Tout copier" / .txt restent globaux.
  const normalizedQuery = skuQuery.trim().toLowerCase();
  const filteredResults = useMemo(
    () =>
      normalizedQuery.length === 0
        ? okResults
        : okResults.filter(r =>
            r.code_article.toLowerCase().includes(normalizedQuery) ||
            (r.titre ?? "").toLowerCase().includes(normalizedQuery)),
    [okResults, normalizedQuery],
  );

  // Texte global (titre + corps de chaque annonce) pour "Tout copier" / téléchargement.
  const allText = useMemo(
    () => okResults.map(r => `${r.titre}\n\n${r.corps}`).join("\n\n───────────────────────────────\n\n"),
    [okResults],
  );

  const handleDownload = () => {
    const blob = new Blob([allText], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `annonces-vinted-${new Date().toISOString().slice(0, 10)}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="min-h-screen bg-[#151826] text-white p-4 md:p-8">
      <div className="mb-8 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-bold mb-2 flex items-center gap-3">
            <FaPenNib className="text-purple-400" />
            Générer les annonces Vinted
          </h1>
          <p className="text-gray-400 max-w-3xl">
            Importez votre CSV (mêmes colonnes que l&apos;export habituel : Code article, Designation, Famille,
            Taille, Protections, Doublure, Matière, État, Indications). Claude rédige chaque annonce (titre +
            description) — copiez-les directement dans Vinted.
          </p>
        </div>
        <Link
          href="/vinted-annonces/parametres"
          className="shrink-0 px-4 py-2 bg-[#23263A] hover:bg-[#2c3046] border border-gray-700 hover:border-blue-500 text-gray-200 rounded-lg transition-colors flex items-center gap-2 text-sm"
        >
          <FaCog />
          Paramètres
        </Link>
      </div>

      {/* Upload */}
      <div className="bg-[#23263A] rounded-2xl shadow-lg p-6 mb-6">
        <div className="flex items-center gap-4 mb-4">
          <FaFileCsv className="text-3xl text-blue-400" />
          <div>
            <h2 className="text-xl font-semibold">1. Sélectionner le CSV</h2>
            <p className="text-sm text-gray-400">Une annonce sera générée par ligne.</p>
          </div>
        </div>
        <label
          onDragEnter={(e) => { e.preventDefault(); setDragDepth(d => d + 1); }}
          onDragLeave={(e) => { e.preventDefault(); setDragDepth(d => Math.max(0, d - 1)); }}
          onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = "copy"; }}
          onDrop={(e) => {
            e.preventDefault();
            setDragDepth(0);
            const file = e.dataTransfer.files?.[0];
            if (file) handleFile(file);
          }}
          className={`flex flex-col items-center justify-center gap-2 px-6 py-10 border-2 border-dashed rounded-xl cursor-pointer transition-colors ${
            isDragging
              ? "border-purple-400 bg-purple-500/10"
              : "border-gray-600 hover:border-blue-500 hover:bg-[#1c1f2e]"
          }`}
          tabIndex={0}
        >
          <FaUpload className={`text-3xl transition-colors ${isDragging ? "text-purple-300" : "text-gray-400"}`} />
          <span className="text-gray-300">
            {isDragging ? (
              <strong className="text-purple-200">Relâche pour charger le fichier</strong>
            ) : filename ? (
              <strong className="text-white">{filename}</strong>
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

      {promptsMissing && (
        <div className="bg-yellow-900/40 border border-yellow-700 rounded-2xl p-4 mb-6 flex items-start gap-3">
          <FaExclamationTriangle className="text-yellow-400 text-xl mt-0.5" />
          <div>
            <p className="text-yellow-200 font-semibold">Aucun prompt configuré — génération bloquée.</p>
            <p className="text-yellow-300/80 text-sm mt-1">
              La Lambda a besoin d&apos;un system prompt et d&apos;un prompt principal pour rédiger les annonces.
              Ajoutez-les dans les{" "}
              <Link href="/vinted-annonces/parametres" className="underline text-yellow-200 hover:text-white">
                Paramètres
              </Link>{" "}
              puis revenez ici.
            </p>
          </div>
        </div>
      )}

      {parseError && (
        <div className="bg-red-900/40 border border-red-700 rounded-2xl p-4 mb-6 flex items-start gap-3">
          <FaTimesCircle className="text-red-400 text-xl mt-0.5" />
          <p className="text-red-300">{parseError}</p>
        </div>
      )}

      {/* Preview & launch */}
      {rows.length > 0 && state.kind !== "done" && (
        <div className="bg-[#23263A] rounded-2xl shadow-lg p-6 mb-6">
          <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
            <div>
              <h2 className="text-xl font-semibold">2. Vérifier &amp; générer</h2>
              <p className="text-sm text-gray-400">
                <strong className="text-white">{rows.length}</strong> annonce(s) à générer.
              </p>
            </div>
            <button
              type="button"
              onClick={handleGenerate}
              disabled={state.kind === "running" || promptsMissing === true}
              aria-label="Lancer la génération"
              className="px-6 py-3 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white rounded-lg font-semibold transition-colors flex items-center gap-2"
            >
              {state.kind === "running" ? (
                <><FaSpinner className="animate-spin" /> {state.done} / {state.total} générées…</>
              ) : (
                <><FaPenNib /> Générer les annonces</>
              )}
            </button>
          </div>

          {state.kind === "running" && (
            <div className="mb-4">
              <div className="w-full bg-[#1c1f2e] rounded-full h-2 overflow-hidden">
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
              <p className="text-xs text-gray-500 mt-3 italic">+ {rows.length - 10} autres non affichés</p>
            )}
          </div>
        </div>
      )}

      {/* Result */}
      {state.kind === "done" && (
        <div className="space-y-6">
          {/* Barre de synthèse + actions globales */}
          <div className="bg-[#23263A] rounded-2xl shadow-lg p-6">
            <div className="flex items-center justify-between flex-wrap gap-4">
              <div className="flex items-center gap-3">
                {errorResults.length === 0 ? (
                  <FaCheckCircle className="text-green-400 text-3xl" />
                ) : (
                  <FaTimesCircle className="text-yellow-400 text-3xl" />
                )}
                <div>
                  <h2 className="text-2xl font-bold">{okResults.length} annonce(s) générée(s)</h2>
                  {errorResults.length > 0 && (
                    <p className="text-sm text-red-300">{errorResults.length} en erreur</p>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2">
                {okResults.length > 0 && (
                  <>
                    <CopyButton text={allText} label="Tout copier" />
                    <button
                      type="button"
                      onClick={handleDownload}
                      className="px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 bg-[#1c1f2e] hover:bg-[#2c3046] text-gray-200 border border-gray-700 transition-colors"
                    >
                      <FaDownload /> Télécharger .txt
                    </button>
                  </>
                )}
                <button
                  type="button"
                  onClick={handleReset}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium bg-gray-700 hover:bg-gray-600 text-white transition-colors"
                >
                  Nouveau lot
                </button>
              </div>
            </div>

            {okResults.length > 0 && (
              <div className="mt-4 flex items-center gap-3 flex-wrap">
                <div className="relative flex-1 min-w-[220px] max-w-md">
                  <FaSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-sm pointer-events-none" />
                  <input
                    type="search"
                    value={skuQuery}
                    onChange={(e) => setSkuQuery(e.target.value)}
                    placeholder="Rechercher par SKU / UGS ou titre…"
                    aria-label="Rechercher une annonce par SKU, UGS ou titre"
                    className="w-full bg-[#1c1f2e] border border-gray-700 rounded-lg pl-9 pr-3 py-2 text-sm text-white placeholder-gray-500 focus:border-purple-500 focus:outline-none"
                  />
                </div>
                {normalizedQuery.length > 0 && (
                  <span className="text-xs text-gray-400">
                    <strong className="text-white">{filteredResults.length}</strong> / {okResults.length} annonce(s)
                  </span>
                )}
              </div>
            )}

            <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-gray-500 mt-4">
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
          </div>

          {/* Erreurs */}
          {errorResults.length > 0 && (
            <div className="bg-[#23263A] rounded-2xl shadow-lg p-4">
              <h3 className="text-sm font-semibold text-red-300 mb-2">Articles en erreur :</h3>
              <ul className="text-sm space-y-1">
                {errorResults.map((r) => (
                  <li key={r.code_article} className="font-mono text-red-200">
                    {r.code_article} <span className="text-gray-400 italic ml-2">{r.error}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Cartes d'annonces */}
          {normalizedQuery.length > 0 && filteredResults.length === 0 && okResults.length > 0 && (
            <div className="bg-[#23263A] rounded-2xl shadow-lg p-6 text-center text-gray-400">
              Aucune annonce ne correspond à «&nbsp;{skuQuery.trim()}&nbsp;».
            </div>
          )}
          {filteredResults.map((r) => (
            <div key={r.code_article} className="bg-[#23263A] rounded-2xl shadow-lg p-5">
              <div className="flex items-start justify-between gap-4 mb-3">
                <div className="min-w-0">
                  <span className="text-xs font-mono text-gray-500">{r.code_article}</span>
                  <h3 className="text-lg font-semibold text-white break-words">{r.titre}</h3>
                </div>
                <div className="flex flex-col gap-2 shrink-0">
                  <CopyButton text={r.titre ?? ""} label="Copier titre" />
                  <CopyButton text={r.corps ?? ""} label="Copier description" />
                </div>
              </div>
              <pre className="whitespace-pre-wrap font-sans text-sm text-gray-300 bg-[#1c1f2e] rounded-xl p-4 border border-gray-800">
                {r.corps}
              </pre>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default VintedAnnoncesPage;
