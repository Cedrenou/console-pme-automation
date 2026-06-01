"use client";
import React, { useState, useMemo } from "react";
import { FaUpload, FaFileCsv, FaCheckCircle, FaTimesCircle, FaSpinner } from "react-icons/fa";

/**
 * Parser CSV tolérant — supporte l'export caisse Rezomatic (séparateur `;`,
 * colonne "Code article") comme un export WooCommerce / classique (séparateur
 * `,`, colonne "UGS"/"SKU"). Le séparateur est détecté automatiquement depuis
 * la ligne d'en-tête. Volontairement maison (pas de dépendance papaparse).
 */
const detectDelimiter = (headerLine: string): string => {
  const candidates = [";", ",", "\t"];
  let best = ";";
  let bestCount = -1;
  for (const d of candidates) {
    const count = headerLine.split(d).length - 1;
    if (count > bestCount) {
      bestCount = count;
      best = d;
    }
  }
  return best;
};

const parseCsv = (raw: string): Record<string, string>[] => {
  const lines = raw.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length === 0) return [];

  const delimiter = detectDelimiter(lines[0]);

  const parseLine = (line: string): string[] => {
    const cols: string[] = [];
    let buf = "";
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (c === '"') {
        if (inQuotes && line[i + 1] === '"') { buf += '"'; i++; }
        else inQuotes = !inQuotes;
      } else if (c === delimiter && !inQuotes) {
        cols.push(buf);
        buf = "";
      } else {
        buf += c;
      }
    }
    cols.push(buf);
    return cols;
  };

  const headers = parseLine(lines[0]).map((h) => h.trim());
  return lines.slice(1).map((line) => {
    const cols = parseLine(line);
    const obj: Record<string, string> = {};
    headers.forEach((h, i) => { obj[h] = cols[i] ?? ""; });
    return obj;
  });
};

// Noms de colonne acceptés pour le SKU, selon la source du CSV (Rezomatic vs
// WooCommerce export FR/EN). Comparaison insensible à la casse et aux espaces.
const SKU_COLUMN_ALIASES = ["code article", "sku", "ugs", "référence", "reference", "ref"];
const DESIGNATION_COLUMN_ALIASES = ["designation", "désignation", "nom", "name", "produit", "titre"];

const findColumn = (headers: string[], aliases: string[]): string | undefined =>
  headers.find((k) => aliases.includes(k.trim().toLowerCase()));

type ImportResult = {
  success: boolean;
  total: number;
  created: number;
  updated: number;
  errors: number;
  duration_ms: number;
  results: { sku: string; ok: boolean; operation?: string; message?: string }[];
};

const ShopifyCataloguePage = () => {
  const [skus, setSkus] = useState<string[]>([]);
  const [previewRows, setPreviewRows] = useState<{ codeArt: string; designation: string; couleur: string }[]>([]);
  const [filename, setFilename] = useState<string | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);

  const handleFile = (file: File) => {
    setParseError(null);
    setResult(null);
    setFilename(file.name);

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const text = String(e.target?.result ?? "");
        const rows = parseCsv(text);
        if (rows.length === 0) {
          setParseError("Le fichier ne contient aucune ligne après le header");
          setSkus([]);
          return;
        }
        // Recherche tolérante de la colonne SKU (Rezomatic, WooCommerce…)
        const headers = Object.keys(rows[0]);
        const skuKey = findColumn(headers, SKU_COLUMN_ALIASES);
        if (!skuKey) {
          setParseError(
            `Colonne SKU introuvable. Colonnes acceptées : ${SKU_COLUMN_ALIASES.join(", ")}. ` +
            `En-têtes détectés : ${headers.join(", ")}`
          );
          setSkus([]);
          return;
        }
        const designationKey = findColumn(headers, DESIGNATION_COLUMN_ALIASES);
        const couleurKey = headers.find((k) => ["couleur", "color"].includes(k.trim().toLowerCase()));
        const extracted: string[] = [];
        const preview: typeof previewRows = [];
        for (const r of rows) {
          const sku = r[skuKey]?.trim();
          if (!sku) continue;
          if (!/^[A-Za-z0-9_-]+$/.test(sku)) continue;
          extracted.push(sku);
          preview.push({
            codeArt: sku,
            designation: (designationKey ? r[designationKey] : "")?.trim() ?? "",
            couleur: (couleurKey ? r[couleurKey] : "")?.trim() ?? "",
          });
        }
        if (extracted.length === 0) {
          setParseError(`Colonne "${skuKey}" trouvée mais aucun SKU valide dedans (vérifiez le contenu).`);
          setSkus([]);
          return;
        }
        // Dédoublonnage
        const unique = Array.from(new Set(extracted));
        setSkus(unique);
        setPreviewRows(preview);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Erreur de parsing";
        setParseError(msg);
        setSkus([]);
      }
    };
    reader.readAsText(file, "UTF-8");
  };

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  };

  const handleImport = async () => {
    if (skus.length === 0 || importing) return;
    setImporting(true);
    setResult(null);
    try {
      const res = await fetch("/api/shopify-import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ skus }),
      });
      const data: ImportResult & { error?: string } = await res.json();
      if (!res.ok) {
        setParseError(data.error ?? `Erreur HTTP ${res.status}`);
      } else {
        setResult(data);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Erreur réseau";
      setParseError(msg);
    } finally {
      setImporting(false);
    }
  };

  const previewToShow = useMemo(() => previewRows.slice(0, 10), [previewRows]);

  return (
    <div className="min-h-screen bg-[#151826] text-white p-4 md:p-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">Import catalogue Shopify</h1>
        <p className="text-gray-400">
          Importez un CSV de réception fournisseur (export caisse) pour créer ou mettre à jour les produits Shopify correspondants.
        </p>
      </div>

      {/* Upload zone */}
      <div className="bg-[#23263A] rounded-2xl shadow-lg p-6 mb-6">
        <div className="flex items-center gap-4 mb-4">
          <FaFileCsv className="text-3xl text-blue-400" />
          <div>
            <h2 className="text-xl font-semibold">1. Sélectionner le CSV</h2>
            <p className="text-sm text-gray-400">Format attendu : export caisse Rezomatic avec colonne &laquo; Code article &raquo;.</p>
          </div>
        </div>
        <label
          className="flex items-center justify-center gap-3 px-6 py-8 border-2 border-dashed border-gray-600 rounded-xl cursor-pointer hover:border-blue-500 hover:bg-[#1c1f2e] transition-colors"
          tabIndex={0}
        >
          <FaUpload className="text-2xl text-gray-400" />
          <span className="text-gray-300">
            {filename ? <strong className="text-white">{filename}</strong> : "Cliquer pour choisir un fichier CSV"}
          </span>
          <input type="file" accept=".csv,text/csv" onChange={onFileChange} className="hidden" />
        </label>
      </div>

      {/* Erreur parsing */}
      {parseError && (
        <div className="bg-red-900/40 border border-red-700 rounded-2xl p-4 mb-6 flex items-start gap-3">
          <FaTimesCircle className="text-red-400 text-xl mt-0.5" />
          <p className="text-red-300">{parseError}</p>
        </div>
      )}

      {/* Aperçu + lancement */}
      {skus.length > 0 && !result && (
        <div className="bg-[#23263A] rounded-2xl shadow-lg p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-xl font-semibold">2. Vérifier &amp; importer</h2>
              <p className="text-sm text-gray-400">
                <strong className="text-white">{skus.length}</strong> SKU(s) détecté(s) dans le fichier.
              </p>
            </div>
            <button
              onClick={handleImport}
              disabled={importing}
              aria-label="Lancer l'import"
              className="px-6 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white rounded-lg font-semibold transition-colors flex items-center gap-2"
            >
              {importing ? (
                <><FaSpinner className="animate-spin" /> Import en cours…</>
              ) : (
                <>Lancer l&apos;import</>
              )}
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-gray-400 border-b border-gray-700">
                <tr>
                  <th className="text-left py-2 pr-4">Code article</th>
                  <th className="text-left py-2 pr-4">Désignation</th>
                  <th className="text-left py-2">Marque</th>
                </tr>
              </thead>
              <tbody>
                {previewToShow.map((r) => (
                  <tr key={r.codeArt} className="border-b border-gray-800">
                    <td className="py-2 pr-4 font-mono">{r.codeArt}</td>
                    <td className="py-2 pr-4 text-gray-300">{r.designation}</td>
                    <td className="py-2 text-gray-400">{r.couleur || <span className="italic">(vide)</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {previewRows.length > 10 && (
              <p className="text-xs text-gray-500 mt-3 italic">
                + {previewRows.length - 10} autres SKU(s) non affichés
              </p>
            )}
          </div>
        </div>
      )}

      {/* Résultat */}
      {result && (
        <div className="bg-[#23263A] rounded-2xl shadow-lg p-6 mb-6">
          <div className="flex items-center gap-3 mb-4">
            {result.success ? (
              <FaCheckCircle className="text-green-400 text-3xl" />
            ) : (
              <FaTimesCircle className="text-yellow-400 text-3xl" />
            )}
            <h2 className="text-2xl font-bold">Résultat de l&apos;import</h2>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <div className="bg-[#1c1f2e] rounded-xl p-4">
              <div className="text-gray-400 text-sm">Total traités</div>
              <div className="text-2xl font-bold">{result.total}</div>
            </div>
            <div className="bg-green-900/30 border border-green-700 rounded-xl p-4">
              <div className="text-green-300 text-sm">Créés</div>
              <div className="text-2xl font-bold text-green-400">{result.created}</div>
            </div>
            <div className="bg-blue-900/30 border border-blue-700 rounded-xl p-4">
              <div className="text-blue-300 text-sm">Mis à jour</div>
              <div className="text-2xl font-bold text-blue-400">{result.updated}</div>
            </div>
            <div className={`rounded-xl p-4 border ${result.errors > 0 ? "bg-red-900/30 border-red-700" : "bg-[#1c1f2e] border-gray-700"}`}>
              <div className={`text-sm ${result.errors > 0 ? "text-red-300" : "text-gray-400"}`}>Erreurs</div>
              <div className={`text-2xl font-bold ${result.errors > 0 ? "text-red-400" : "text-white"}`}>{result.errors}</div>
            </div>
          </div>

          <p className="text-xs text-gray-500 mb-3">
            Durée : {(result.duration_ms / 1000).toFixed(1)}s
          </p>

          {result.errors > 0 && (
            <div className="bg-[#1c1f2e] rounded-xl p-4 max-h-64 overflow-y-auto">
              <h3 className="text-sm font-semibold text-red-300 mb-2">SKUs en erreur :</h3>
              <ul className="text-sm space-y-1">
                {result.results.filter((r) => !r.ok).map((r) => (
                  <li key={r.sku} className="font-mono text-red-200">
                    {r.sku} <span className="text-gray-400 italic ml-2">{r.message}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <button
            onClick={() => { setResult(null); setSkus([]); setPreviewRows([]); setFilename(null); }}
            className="mt-6 px-6 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors"
          >
            Faire un nouvel import
          </button>
        </div>
      )}
    </div>
  );
};

export default ShopifyCataloguePage;
