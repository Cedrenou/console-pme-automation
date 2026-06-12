"use client";
import React, { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  FaUpload, FaFileCsv, FaCheckCircle, FaTimesCircle, FaSpinner, FaTimes, FaPlus,
  FaBoxOpen, FaMagic, FaCog, FaMinusCircle, FaArrowRight,
} from "react-icons/fa";
import { enrichShopifyProducts, type ShopifyBatchUsage, type ShopifyEnrichRow } from "@/lib/api";

/**
 * Import complet Shopify — page "tout-en-un".
 *
 * Fusionne en un seul écran les 3 opérations qui existaient en pages séparées
 * (Import catalogue, Import photos, Enrichir descriptions). L'utilisateur dépose
 * un CSV d'enrichissement → la liste s'affiche → il glisse les photos par article
 * → un bouton "Importer" enchaîne :
 *   1. Catalogue : create/update produit (POST /api/shopify-import)
 *   2. Photos    : upload séquentiel (POST /api/shopify-photos)
 *   3. Enrichir  : descriptions + SEO via Claude (lambda csv-to-shopify)
 *
 * IDEMPOTENCE — aucun garde backend. La brique Catalogue renvoie déjà, par SKU,
 * `operation: 'created' | 'updated'`. On s'appuie dessus :
 *   - SKU `created` (produit neuf)  → on upload les photos ET on enrichit.
 *   - SKU `updated` (préexistant)   → on saute photos + enrichissement (il les a
 *     déjà ; évite les doublons d'images et de repayer Claude).
 * Cas-limite (produit créé avant mais jamais enrichi/photographié) : utiliser les
 * pages dédiées /shopify-photos et /shopify-enrichir comme échappatoire.
 *
 * NB : cette page ne fait qu'APPELER les endpoints existants — rien n'est modifié
 * côté middleware ni côté Lambda.
 */

// ─── Parsing CSV ──────────────────────────────────────────────────────
//
// Parser robuste (caractère par caractère) repris de /shopify-enrichir : le CSV
// d'enrichissement Sunset contient des champs ("Indications…") avec des sauts de
// ligne entre guillemets, que le parser ligne-à-ligne de /shopify-catalogue
// casserait. Séparateur `,` — quotes `"` — escape `""`.
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
      if (cur.some((v) => v.length > 0)) rows.push(cur);
      cur = [];
    } else {
      buf += c;
    }
  }
  if (buf.length > 0 || cur.length > 0) {
    cur.push(buf);
    if (cur.some((v) => v.length > 0)) rows.push(cur);
  }

  if (rows.length === 0) return [];
  const headers = rows[0];
  return rows.slice(1).map((cols) => {
    const obj: Record<string, string> = {};
    headers.forEach((h, i) => { obj[h] = (cols[i] ?? "").trim(); });
    return obj;
  });
};

// Noms de colonne acceptés pour le SKU (insensible casse/espaces). Repris des
// pages catalogue/photos.
const SKU_COLUMN_ALIASES = ["code article", "sku", "ugs", "référence", "reference", "ref"];
const DESIGNATION_COLUMN_ALIASES = ["designation", "désignation", "nom", "name", "produit", "titre"];

const findColumn = (headers: string[], aliases: string[]): string | undefined =>
  headers.find((k) => aliases.includes(k.trim().toLowerCase()));

// ─── Constantes & helpers photos (repris de /shopify-photos) ──────────
// Amplify SSR (Lambda) plafonne le payload requête ; après base64 (+33%) on
// reste sous 4.5Mo binaire — on retient 4Mo de marge.
const MAX_FILE_BYTES = 4 * 1024 * 1024;
const ACCEPTED_MIME = ["image/jpeg", "image/jpg", "image/png", "image/webp"];

const uid = (): string => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;

// Encodage base64 sans préfixe data:URI (le middleware attend du base64 brut).
const fileToBase64 = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result ?? "");
      const comma = result.indexOf(",");
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.onerror = () => reject(reader.error ?? new Error("Lecture fichier impossible"));
    reader.readAsDataURL(file);
  });

// ─── Constantes enrichissement (repris de /shopify-enrichir) ──────────
const BATCH_SIZE = 5;
const PARALLEL_BATCHES = 3;

type AggregatedUsage = ShopifyBatchUsage | null;

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

// ─── Types ────────────────────────────────────────────────────────────
type Article = {
  codeArt: string;
  designation: string;
  raw: Record<string, string>; // ligne CSV complète → envoyée telle quelle à l'enrichissement
};

type PhotoItem = {
  id: string;
  file: File;
  previewUrl: string;
  assignedTo: string; // codeArt
};

// "skipped" ajouté vs la page Photos : photos d'un SKU non créé (déjà existant).
type PhotoUpload =
  | { status: "pending" }
  | { status: "uploading" }
  | { status: "done"; imageId: number }
  | { status: "error"; message: string }
  | { status: "skipped" };

type CatalogStatus = { ok: boolean; operation?: string; message?: string };
type EnrichStatus = { status: "ok" | "error" | "skipped"; error?: string };

// Réponse de POST /api/shopify-import (cf. /shopify-catalogue)
type ImportResult = {
  success: boolean;
  total: number;
  created: number;
  updated: number;
  errors: number;
  duration_ms: number;
  results: { sku: string; ok: boolean; operation?: string; message?: string }[];
};

type Phase =
  | { kind: "idle" }
  | { kind: "catalog" }
  | { kind: "photos"; done: number; total: number }
  | { kind: "enrich"; done: number; total: number }
  | { kind: "done"; durationMs: number; usage: AggregatedUsage };

const ShopifyImportCompletPage = () => {
  const [articles, setArticles] = useState<Article[]>([]);
  const [filename, setFilename] = useState<string | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [csvDragOver, setCsvDragOver] = useState(false);

  const [photos, setPhotos] = useState<PhotoItem[]>([]);
  const [uploadState, setUploadState] = useState<Record<string, PhotoUpload>>({});
  const [catalogBySku, setCatalogBySku] = useState<Record<string, CatalogStatus>>({});
  const [enrichBySku, setEnrichBySku] = useState<Record<string, EnrichStatus>>({});

  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const [importError, setImportError] = useState<string | null>(null);

  // Cleanup des objectURLs au unmount pour éviter une fuite mémoire.
  useEffect(() => {
    return () => {
      photos.forEach((p) => URL.revokeObjectURL(p.previewUrl));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const importing = phase.kind === "catalog" || phase.kind === "photos" || phase.kind === "enrich";
  const showStatus = phase.kind !== "idle";

  // ─── Chargement CSV ─────────────────────────────────────────────────
  const resetResults = () => {
    setUploadState({});
    setCatalogBySku({});
    setEnrichBySku({});
    setImportError(null);
    setPhase({ kind: "idle" });
  };

  const handleCsvFile = (file: File) => {
    if (importing) return;
    setParseError(null);
    setFilename(file.name);
    // Nouveau CSV → on repart propre (photos précédentes révoquées + résultats vidés).
    photos.forEach((p) => URL.revokeObjectURL(p.previewUrl));
    setPhotos([]);
    resetResults();

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const text = String(e.target?.result ?? "");
        const parsed = parseCsv(text);
        if (parsed.length === 0) {
          setParseError("Le fichier ne contient aucune ligne après le header");
          setArticles([]);
          return;
        }
        const headers = Object.keys(parsed[0]);
        const skuKey = findColumn(headers, SKU_COLUMN_ALIASES);
        if (!skuKey) {
          setParseError(
            `Colonne SKU introuvable. Colonnes acceptées : ${SKU_COLUMN_ALIASES.join(", ")}. ` +
            `En-têtes détectés : ${headers.join(", ")}`
          );
          setArticles([]);
          return;
        }
        const designationKey = findColumn(headers, DESIGNATION_COLUMN_ALIASES);
        const extracted: Article[] = [];
        const seen = new Set<string>();
        for (const r of parsed) {
          const sku = r[skuKey]?.trim();
          if (!sku) continue;
          if (!/^[A-Za-z0-9_-]+$/.test(sku)) continue;
          if (seen.has(sku)) continue;
          seen.add(sku);
          extracted.push({
            codeArt: sku,
            designation: (designationKey ? r[designationKey] : "")?.trim() ?? "",
            raw: r,
          });
        }
        if (extracted.length === 0) {
          setParseError(`Colonne "${skuKey}" trouvée mais aucun SKU valide dedans (vérifiez le contenu).`);
          setArticles([]);
          return;
        }
        setArticles(extracted);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Erreur de parsing";
        setParseError(msg);
        setArticles([]);
      }
    };
    reader.readAsText(file, "UTF-8");
  };

  const onCsvChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleCsvFile(file);
  };

  const handleCsvDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setCsvDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (!file) return;
    const isCsv = /\.csv$/i.test(file.name) || file.type === "text/csv" || file.type === "application/vnd.ms-excel";
    if (!isCsv) {
      setParseError(`Fichier ignoré : "${file.name}" n'est pas un CSV.`);
      return;
    }
    handleCsvFile(file);
  };

  const handleCsvDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = "copy";
    setCsvDragOver(true);
  };

  // ─── Gestion photos (repris de /shopify-photos) ─────────────────────
  const addFilesToSku = (files: FileList | File[], skuCode: string) => {
    const accepted: PhotoItem[] = [];
    const rejected: string[] = [];
    for (const file of Array.from(files)) {
      if (!ACCEPTED_MIME.includes(file.type)) {
        rejected.push(`${file.name} (format non supporté)`);
        continue;
      }
      if (file.size > MAX_FILE_BYTES) {
        rejected.push(`${file.name} (>${(MAX_FILE_BYTES / 1024 / 1024).toFixed(0)} Mo)`);
        continue;
      }
      accepted.push({ id: uid(), file, previewUrl: URL.createObjectURL(file), assignedTo: skuCode });
    }
    if (rejected.length > 0) {
      setParseError(`Fichiers rejetés : ${rejected.join(", ")}`);
    } else {
      setParseError(null);
    }
    if (accepted.length > 0) {
      setPhotos((prev) => [...prev, ...accepted]);
    }
  };

  const handleDropOnSku = (e: React.DragEvent, skuCode: string) => {
    e.preventDefault();
    e.stopPropagation();
    const draggedPhotoId = e.dataTransfer.getData("photo-id");
    if (draggedPhotoId) {
      setPhotos((prev) => prev.map((p) => (p.id === draggedPhotoId ? { ...p, assignedTo: skuCode } : p)));
      return;
    }
    if (e.dataTransfer.files.length > 0) {
      addFilesToSku(e.dataTransfer.files, skuCode);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  };

  const handleDragStart = (e: React.DragEvent, photoId: string) => {
    e.dataTransfer.setData("photo-id", photoId);
    e.dataTransfer.effectAllowed = "move";
  };

  const removePhoto = (photoId: string) => {
    setPhotos((prev) => {
      const target = prev.find((p) => p.id === photoId);
      if (target) URL.revokeObjectURL(target.previewUrl);
      return prev.filter((p) => p.id !== photoId);
    });
  };

  // Drop d'une photo SUR une autre : insère la glissée juste avant la cible et lui
  // attribue le SKU de la cible. L'ordre du tableau `photos` = l'ordre affiché =
  // la position envoyée à Shopify (n°1 = couverture).
  const handleDropOnPhoto = (draggedPhotoId: string, targetPhotoId: string) => {
    if (draggedPhotoId === targetPhotoId) return;
    setPhotos((prev) => {
      const dragged = prev.find((p) => p.id === draggedPhotoId);
      const target = prev.find((p) => p.id === targetPhotoId);
      if (!dragged || !target) return prev;
      const without = prev.filter((p) => p.id !== draggedPhotoId);
      const targetIdx = without.findIndex((p) => p.id === targetPhotoId);
      const moved = { ...dragged, assignedTo: target.assignedTo };
      return [...without.slice(0, targetIdx), moved, ...without.slice(targetIdx)];
    });
  };

  const removeArticle = (skuCode: string) => {
    setPhotos((prev) => {
      const removed = prev.filter((p) => p.assignedTo === skuCode);
      removed.forEach((p) => URL.revokeObjectURL(p.previewUrl));
      return prev.filter((p) => p.assignedTo !== skuCode);
    });
    setArticles((prev) => prev.filter((a) => a.codeArt !== skuCode));
  };

  const photosBySku = useMemo(() => {
    const map = new Map<string, PhotoItem[]>();
    for (const p of photos) {
      const arr = map.get(p.assignedTo) ?? [];
      arr.push(p);
      map.set(p.assignedTo, arr);
    }
    return map;
  }, [photos]);

  const getPhotoStatus = (photoId: string): PhotoUpload | undefined => uploadState[photoId];

  const canImport = phase.kind === "idle" && articles.length > 0;

  // ─── Orchestration ──────────────────────────────────────────────────
  const handleImport = async () => {
    if (!canImport) return;
    const started = Date.now();
    resetResults();

    const initialPhotos: Record<string, PhotoUpload> = {};
    for (const p of photos) initialPhotos[p.id] = { status: "pending" };
    setUploadState(initialPhotos);

    // ── Phase 1 : Catalogue (un seul appel groupé) ──
    setPhase({ kind: "catalog" });
    let catalogResults: ImportResult["results"] = [];
    try {
      const res = await fetch("/api/shopify-import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ skus: articles.map((a) => a.codeArt) }),
      });
      const data: ImportResult & { error?: string } = await res.json();
      if (!res.ok) {
        setImportError(data.error ?? `Erreur HTTP ${res.status} sur l'import catalogue`);
        setPhase({ kind: "idle" });
        return;
      }
      catalogResults = data.results ?? [];
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Erreur réseau";
      setImportError(`Import catalogue échoué : ${msg}`);
      setPhase({ kind: "idle" });
      return;
    }

    const catalogMap: Record<string, CatalogStatus> = {};
    for (const r of catalogResults) {
      catalogMap[r.sku] = { ok: r.ok, operation: r.operation, message: r.message };
    }
    setCatalogBySku(catalogMap);

    // Seuls les SKU réellement CRÉÉS reçoivent photos + enrichissement.
    const createdSkus = new Set(
      catalogResults.filter((r) => r.ok && r.operation === "created").map((r) => r.sku)
    );

    // ── Phase 2 : Photos (uniquement SKU créés ; les autres → skipped) ──
    const positionByPhotoId = new Map<string, number>();
    for (const [, list] of photosBySku) {
      list.forEach((p, idx) => positionByPhotoId.set(p.id, idx + 1));
    }
    const photosToUpload = photos.filter((p) => createdSkus.has(p.assignedTo));

    setUploadState((prev) => {
      const next = { ...prev };
      for (const p of photos) {
        if (!createdSkus.has(p.assignedTo)) next[p.id] = { status: "skipped" };
      }
      return next;
    });

    setPhase({ kind: "photos", done: 0, total: photosToUpload.length });
    let photoDone = 0;
    // Boucle séquentielle : Shopify rate-limit à ~2 req/s, le séquentiel est aussi
    // rapide en pratique et plus simple à raisonner.
    for (const photo of photosToUpload) {
      setUploadState((prev) => ({ ...prev, [photo.id]: { status: "uploading" } }));
      try {
        const contentBase64 = await fileToBase64(photo.file);
        const res = await fetch("/api/shopify-photos", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sku: photo.assignedTo,
            filename: photo.file.name,
            contentBase64,
            position: positionByPhotoId.get(photo.id) ?? 1,
          }),
        });
        const data: { ok?: boolean; imageId?: number; error?: string } = await res.json();
        if (!res.ok || !data.ok) {
          setUploadState((prev) => ({
            ...prev,
            [photo.id]: { status: "error", message: data.error ?? `HTTP ${res.status}` },
          }));
        } else {
          setUploadState((prev) => ({ ...prev, [photo.id]: { status: "done", imageId: data.imageId ?? 0 } }));
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Erreur réseau";
        setUploadState((prev) => ({ ...prev, [photo.id]: { status: "error", message: msg } }));
      }
      photoDone++;
      setPhase({ kind: "photos", done: photoDone, total: photosToUpload.length });
    }

    // ── Phase 3 : Enrichissement (uniquement SKU créés ; pool de workers) ──
    const toEnrich = articles.filter((a) => createdSkus.has(a.codeArt));
    const enrichMap: Record<string, EnrichStatus> = {};
    for (const a of articles) {
      if (!createdSkus.has(a.codeArt)) enrichMap[a.codeArt] = { status: "skipped" };
    }
    setEnrichBySku({ ...enrichMap });

    let aggregatedUsage: AggregatedUsage = null;
    if (toEnrich.length > 0) {
      const batches: ShopifyEnrichRow[][] = [];
      for (let i = 0; i < toEnrich.length; i += BATCH_SIZE) {
        batches.push(toEnrich.slice(i, i + BATCH_SIZE).map((a) => a.raw));
      }
      setPhase({ kind: "enrich", done: 0, total: toEnrich.length });
      let enrichDone = 0;
      let nextBatch = 0;
      const worker = async () => {
        while (true) {
          const idx = nextBatch++;
          if (idx >= batches.length) return;
          const batch = batches[idx];
          try {
            const resp = await enrichShopifyProducts(batch);
            if (resp.usage) aggregatedUsage = mergeUsage(aggregatedUsage, resp.usage);
            for (const r of resp.results) {
              enrichMap[r.code_article] =
                r.status === "ok" ? { status: "ok" } : { status: "error", error: r.error };
            }
          } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : "Erreur batch";
            for (const row of batch) {
              const sku = row["Code article"] ?? "?";
              enrichMap[sku] = { status: "error", error: msg };
            }
          }
          enrichDone += batch.length;
          setEnrichBySku({ ...enrichMap });
          setPhase({ kind: "enrich", done: enrichDone, total: toEnrich.length });
        }
      };
      await Promise.all(Array.from({ length: PARALLEL_BATCHES }, worker));
    }

    setPhase({ kind: "done", durationMs: Date.now() - started, usage: aggregatedUsage });
  };

  const resetAll = () => {
    photos.forEach((p) => URL.revokeObjectURL(p.previewUrl));
    setPhotos([]);
    setArticles([]);
    setFilename(null);
    setParseError(null);
    resetResults();
  };

  // ─── Dérivés d'affichage ────────────────────────────────────────────
  const totalPhotos = photos.length;
  const photoSummaryFor = (codeArt: string) => {
    const list = photosBySku.get(codeArt) ?? [];
    let done = 0, error = 0, skipped = 0;
    for (const p of list) {
      const s = uploadState[p.id];
      if (s?.status === "done") done++;
      else if (s?.status === "error") error++;
      else if (s?.status === "skipped") skipped++;
    }
    return { total: list.length, done, error, skipped };
  };

  const finalSummary = useMemo(() => {
    const catalogVals = Object.values(catalogBySku);
    const photoVals = Object.values(uploadState);
    const enrichVals = Object.values(enrichBySku);
    return {
      created: catalogVals.filter((c) => c.ok && c.operation === "created").length,
      updated: catalogVals.filter((c) => c.ok && c.operation === "updated").length,
      catalogErrors: catalogVals.filter((c) => !c.ok).length,
      photosDone: photoVals.filter((s) => s.status === "done").length,
      photosError: photoVals.filter((s) => s.status === "error").length,
      photosSkipped: photoVals.filter((s) => s.status === "skipped").length,
      enrichOk: enrichVals.filter((e) => e.status === "ok").length,
      enrichError: enrichVals.filter((e) => e.status === "error").length,
      enrichSkipped: enrichVals.filter((e) => e.status === "skipped").length,
    };
  }, [catalogBySku, uploadState, enrichBySku]);

  const phaseProgress = phase.kind === "photos" || phase.kind === "enrich"
    ? (phase.total > 0 ? Math.round((phase.done / phase.total) * 100) : 100)
    : null;

  const phaseLabel = (): string => {
    switch (phase.kind) {
      case "catalog": return "Étape 1/3 — Création / mise à jour du catalogue…";
      case "photos": return `Étape 2/3 — Upload des photos (${phase.done}/${phase.total})…`;
      case "enrich": return `Étape 3/3 — Enrichissement Claude (${phase.done}/${phase.total})…`;
      default: return "";
    }
  };

  const estimateMin = Math.ceil((articles.length * 5) / 60);

  return (
    <div className="min-h-screen bg-[#151826] text-white p-4 md:p-8">
      <div className="mb-8 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-bold mb-2 flex items-center gap-3">
            <FaBoxOpen className="text-blue-400" />
            Import complet Shopify
          </h1>
          <p className="text-gray-400 max-w-3xl">
            Déposez un CSV d&apos;enrichissement, glissez les photos en face de chaque article, puis lancez
            l&apos;import : <strong className="text-gray-200">création produit → photos → descriptions IA</strong> en une
            seule fois. Les articles déjà existants (SKU connu) sont mis à jour sans réimporter photos ni description.
          </p>
        </div>
        <Link
          href="/shopify-enrichir/parametres"
          className="shrink-0 px-4 py-2 bg-[#23263A] hover:bg-[#2c3046] border border-gray-700 hover:border-blue-500 text-gray-200 rounded-lg transition-colors flex items-center gap-2 text-sm"
        >
          <FaCog />
          Paramètres Claude
        </Link>
      </div>

      {/* Étape 1 : CSV */}
      <div className="bg-[#23263A] rounded-2xl shadow-lg p-6 mb-6">
        <div className="flex items-center gap-4 mb-4">
          <FaFileCsv className="text-3xl text-blue-400" />
          <div>
            <h2 className="text-xl font-semibold">1. Déposer le CSV</h2>
            <p className="text-sm text-gray-400">
              Export d&apos;enrichissement (colonnes Code article, Designation, Famille, Protections, Doublure,
              Matière, État, Indications). Le SKU sert au matching Shopify, le reste alimente l&apos;IA.
            </p>
          </div>
        </div>
        <label
          onDrop={handleCsvDrop}
          onDragOver={handleCsvDragOver}
          onDragLeave={() => setCsvDragOver(false)}
          className={`flex items-center justify-center gap-3 px-6 py-8 border-2 border-dashed rounded-xl transition-colors ${
            importing ? "opacity-50 cursor-not-allowed border-gray-700" :
            csvDragOver ? "border-blue-400 bg-[#1c1f2e] cursor-pointer" : "border-gray-600 hover:border-blue-500 hover:bg-[#1c1f2e] cursor-pointer"
          }`}
          tabIndex={0}
        >
          <FaUpload className="text-2xl text-gray-400" />
          <span className="text-gray-300">
            {filename ? (
              <strong className="text-white">{filename}</strong>
            ) : csvDragOver ? (
              "Relâcher pour importer le CSV"
            ) : (
              "Glisser un CSV ici ou cliquer pour choisir un fichier"
            )}
          </span>
          <input type="file" accept=".csv,text/csv" onChange={onCsvChange} className="hidden" disabled={importing} />
        </label>
        {articles.length > 0 && (
          <p className="text-sm text-gray-400 mt-4">
            <strong className="text-white">{articles.length}</strong> article(s) — dont{" "}
            <strong className="text-green-400">{Array.from(photosBySku.keys()).filter((k) => articles.some((a) => a.codeArt === k)).length}</strong>{" "}
            avec au moins une photo · <strong className="text-blue-300">{totalPhotos}</strong> photo(s) au total.
          </p>
        )}
      </div>

      {parseError && (
        <div className="bg-red-900/40 border border-red-700 rounded-2xl p-4 mb-6 flex items-start gap-3">
          <FaTimesCircle className="text-red-400 text-xl mt-0.5" />
          <p className="text-red-300">{parseError}</p>
        </div>
      )}

      {importError && (
        <div className="bg-red-900/40 border border-red-700 rounded-2xl p-4 mb-6 flex items-start gap-3">
          <FaTimesCircle className="text-red-400 text-xl mt-0.5" />
          <div>
            <p className="text-red-200 font-semibold">L&apos;import a été interrompu</p>
            <p className="text-red-300 text-sm">{importError}</p>
          </div>
        </div>
      )}

      {/* Étape 2 : liste + photos + lancement */}
      {articles.length > 0 && (
        <div className="bg-[#23263A] rounded-2xl shadow-lg p-6 mb-6">
          <div className="flex items-center justify-between mb-4 gap-4 flex-wrap">
            <div>
              <h2 className="text-xl font-semibold">2. Photos &amp; import</h2>
              <p className="text-sm text-gray-400">
                Glissez les photos sur la ligne de l&apos;article (n°1 = couverture). Max 4 Mo/photo (JPG/PNG/WebP).
                {" "}Estimation ~{estimateMin} min pour l&apos;enrichissement IA.
              </p>
            </div>
            {phase.kind !== "done" && (
              <button
                onClick={handleImport}
                disabled={!canImport}
                aria-label="Lancer l'import complet"
                className="px-6 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white rounded-lg font-semibold transition-colors flex items-center gap-2 flex-shrink-0"
              >
                {importing ? (
                  <><FaSpinner className="animate-spin" /> Import en cours…</>
                ) : (
                  <><FaArrowRight /> Lancer l&apos;import ({articles.length} art. / {totalPhotos} photos)</>
                )}
              </button>
            )}
          </div>

          {/* Barre de progression de phase */}
          {importing && (
            <div className="mb-4">
              <div className="flex items-center gap-2 text-sm text-gray-300 mb-2">
                <FaSpinner className="animate-spin text-blue-400" />
                {phaseLabel()}
              </div>
              <div className="w-full bg-[#1c1f2e] rounded-full h-2 overflow-hidden">
                <div
                  className={`h-full transition-all duration-300 ${phaseProgress === null ? "bg-blue-500 animate-pulse w-1/3" : "bg-blue-500"}`}
                  style={phaseProgress === null ? undefined : { width: `${phaseProgress}%` }}
                />
              </div>
            </div>
          )}

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-gray-400 border-b border-gray-700">
                <tr>
                  <th className="text-left py-2 pr-4 w-36">Code article</th>
                  <th className="text-left py-2 pr-4">Désignation</th>
                  <th className="text-left py-2">Photos</th>
                  {showStatus && <th className="text-left py-2 px-3 w-28">Catalogue</th>}
                  {showStatus && <th className="text-left py-2 px-3 w-24">Photos ↑</th>}
                  {showStatus && <th className="text-left py-2 px-3 w-24">Enrichi</th>}
                  {!showStatus && <th className="w-10"></th>}
                </tr>
              </thead>
              <tbody>
                {articles.map((a) => {
                  const skuPhotos = photosBySku.get(a.codeArt) ?? [];
                  const cat = catalogBySku[a.codeArt];
                  const enr = enrichBySku[a.codeArt];
                  const ps = photoSummaryFor(a.codeArt);
                  return (
                    <tr key={a.codeArt} className="border-b border-gray-700/60 align-top">
                      <td className="py-3 pr-4 font-mono text-white">{a.codeArt}</td>
                      <td className="py-3 pr-4 text-gray-300">
                        {a.designation || <span className="italic text-gray-500">(vide)</span>}
                      </td>
                      <td className="py-3">
                        <SkuDropCell
                          skuCode={a.codeArt}
                          photos={skuPhotos}
                          onDrop={(e) => handleDropOnSku(e, a.codeArt)}
                          onDragOver={handleDragOver}
                          onFilesPicked={(files) => addFilesToSku(files, a.codeArt)}
                          onPhotoDragStart={handleDragStart}
                          onPhotoRemove={removePhoto}
                          onPhotoDropReorder={handleDropOnPhoto}
                          getPhotoStatus={getPhotoStatus}
                          disabled={phase.kind !== "idle"}
                        />
                      </td>

                      {showStatus && (
                        <td className="py-3 px-3">
                          <CatalogBadge status={cat} />
                        </td>
                      )}
                      {showStatus && (
                        <td className="py-3 px-3">
                          <PhotosBadge summary={ps} created={cat?.ok === true && cat?.operation === "created"} />
                        </td>
                      )}
                      {showStatus && (
                        <td className="py-3 px-3">
                          <EnrichBadge status={enr} />
                        </td>
                      )}

                      {!showStatus && (
                        <td className="py-3 pl-2">
                          <button
                            type="button"
                            onClick={() => removeArticle(a.codeArt)}
                            aria-label={`Retirer ${a.codeArt} de la liste`}
                            className="w-7 h-7 flex items-center justify-center rounded-full text-gray-500 hover:text-red-400 hover:bg-red-900/30 transition-colors"
                            title="Retirer cet article de la liste"
                          >
                            <FaTimes />
                          </button>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Récap final */}
      {phase.kind === "done" && (
        <div className="bg-[#23263A] rounded-2xl shadow-lg p-6 mb-6">
          <div className="flex items-center gap-3 mb-4">
            {finalSummary.catalogErrors === 0 && finalSummary.photosError === 0 && finalSummary.enrichError === 0 ? (
              <FaCheckCircle className="text-green-400 text-3xl" />
            ) : (
              <FaTimesCircle className="text-yellow-400 text-3xl" />
            )}
            <h2 className="text-2xl font-bold">Import terminé</h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            {/* Catalogue */}
            <div className="bg-[#1c1f2e] rounded-xl p-4">
              <div className="text-sm font-semibold text-gray-300 mb-2 flex items-center gap-2"><FaBoxOpen className="text-blue-400" /> Catalogue</div>
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
                <span className="text-green-400">{finalSummary.created} créé(s)</span>
                <span className="text-blue-300">{finalSummary.updated} mis à jour</span>
                <span className={finalSummary.catalogErrors > 0 ? "text-red-400" : "text-gray-500"}>{finalSummary.catalogErrors} erreur(s)</span>
              </div>
            </div>
            {/* Photos */}
            <div className="bg-[#1c1f2e] rounded-xl p-4">
              <div className="text-sm font-semibold text-gray-300 mb-2 flex items-center gap-2"><FaUpload className="text-blue-400" /> Photos</div>
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
                <span className="text-green-400">{finalSummary.photosDone} ajoutée(s)</span>
                <span className={finalSummary.photosError > 0 ? "text-red-400" : "text-gray-500"}>{finalSummary.photosError} erreur(s)</span>
                {finalSummary.photosSkipped > 0 && <span className="text-gray-400">{finalSummary.photosSkipped} sautée(s)</span>}
              </div>
            </div>
            {/* Enrichissement */}
            <div className="bg-[#1c1f2e] rounded-xl p-4">
              <div className="text-sm font-semibold text-gray-300 mb-2 flex items-center gap-2"><FaMagic className="text-purple-400" /> Enrichissement</div>
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
                <span className="text-green-400">{finalSummary.enrichOk} enrichi(s)</span>
                <span className={finalSummary.enrichError > 0 ? "text-red-400" : "text-gray-500"}>{finalSummary.enrichError} erreur(s)</span>
                {finalSummary.enrichSkipped > 0 && <span className="text-gray-400">{finalSummary.enrichSkipped} sauté(s)</span>}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-gray-500 mb-4">
            <span>Durée : {(phase.durationMs / 1000).toFixed(1)}s</span>
            {phase.usage && (
              <>
                <span>
                  Coût IA : <span className="text-gray-300">
                    {phase.usage.cost_eur < 0.01
                      ? `${(phase.usage.cost_eur * 100).toFixed(2)} ¢ €`
                      : `${phase.usage.cost_eur.toFixed(3)} €`}
                  </span>
                  <span className="text-gray-600 ml-1">(≈ ${phase.usage.cost_usd.toFixed(3)})</span>
                </span>
                <span>Modèle : <span className="text-gray-300 font-mono">{phase.usage.model}</span></span>
              </>
            )}
          </div>

          {(finalSummary.updated > 0 || finalSummary.photosSkipped > 0 || finalSummary.enrichSkipped > 0) && (
            <div className="bg-[#1c1f2e] border border-gray-700 rounded-xl p-4 mb-4 text-sm text-gray-300">
              <p>
                Les articles déjà existants ont été <strong>mis à jour</strong> sans réimporter leurs photos ni leur
                description (pour éviter doublons et coût IA inutile). Pour (re)traiter un cas précis, utilisez les
                pages dédiées{" "}
                <Link href="/shopify-photos" className="text-blue-400 underline">Import Photos</Link> ou{" "}
                <Link href="/shopify-enrichir" className="text-blue-400 underline">Enrichir descriptions</Link>.
              </p>
            </div>
          )}

          {/* Détail des erreurs */}
          <ErrorDetails
            articles={articles}
            catalogBySku={catalogBySku}
            uploadState={uploadState}
            photos={photos}
            enrichBySku={enrichBySku}
          />

          <button
            onClick={resetAll}
            className="mt-6 px-6 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors"
          >
            Faire un nouvel import
          </button>
        </div>
      )}
    </div>
  );
};

// ─── Badges de statut par article ──────────────────────────────────────

const CatalogBadge: React.FC<{ status?: CatalogStatus }> = ({ status }) => {
  if (!status) return <span className="text-gray-600">—</span>;
  if (!status.ok) {
    return (
      <span className="inline-flex items-center gap-1 text-red-400" title={status.message}>
        <FaTimesCircle /> Erreur
      </span>
    );
  }
  if (status.operation === "created") {
    return <span className="inline-flex items-center gap-1 text-green-400"><FaCheckCircle /> Créé</span>;
  }
  if (status.operation === "updated") {
    return <span className="inline-flex items-center gap-1 text-blue-300"><FaArrowRight /> MàJ</span>;
  }
  return <span className="inline-flex items-center gap-1 text-gray-400" title={status.message}>OK</span>;
};

const PhotosBadge: React.FC<{ summary: { total: number; done: number; error: number; skipped: number }; created: boolean }> = ({ summary, created }) => {
  if (summary.total === 0) return <span className="text-gray-600">—</span>;
  if (!created) return <span className="text-gray-400" title="Article existant : photos non réimportées">sautées</span>;
  return (
    <span className="text-sm">
      <span className="text-green-400">{summary.done}</span>
      <span className="text-gray-500">/{summary.total}</span>
      {summary.error > 0 && <span className="text-red-400 ml-1">({summary.error} err)</span>}
    </span>
  );
};

const EnrichBadge: React.FC<{ status?: EnrichStatus }> = ({ status }) => {
  if (!status) return <span className="text-gray-600">—</span>;
  if (status.status === "ok") return <span className="inline-flex items-center gap-1 text-green-400"><FaCheckCircle /> Oui</span>;
  if (status.status === "skipped") return <span className="text-gray-400" title="Article existant : description non régénérée">sauté</span>;
  return <span className="inline-flex items-center gap-1 text-red-400" title={status.error}><FaTimesCircle /> Erreur</span>;
};

// ─── Détail des erreurs (récap final) ──────────────────────────────────

const ErrorDetails: React.FC<{
  articles: Article[];
  catalogBySku: Record<string, CatalogStatus>;
  uploadState: Record<string, PhotoUpload>;
  photos: PhotoItem[];
  enrichBySku: Record<string, EnrichStatus>;
}> = ({ articles, catalogBySku, uploadState, photos, enrichBySku }) => {
  const catalogErrors = articles.filter((a) => catalogBySku[a.codeArt] && !catalogBySku[a.codeArt].ok);
  const photoErrors = photos.filter((p) => uploadState[p.id]?.status === "error");
  const enrichErrors = articles.filter((a) => enrichBySku[a.codeArt]?.status === "error");

  if (catalogErrors.length === 0 && photoErrors.length === 0 && enrichErrors.length === 0) return null;

  return (
    <div className="bg-[#1c1f2e] rounded-xl p-4 max-h-72 overflow-y-auto space-y-3">
      {catalogErrors.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-red-300 mb-1">Catalogue — erreurs :</h3>
          <ul className="text-sm space-y-1">
            {catalogErrors.map((a) => (
              <li key={a.codeArt} className="font-mono text-red-200">
                {a.codeArt} <span className="text-gray-400 italic ml-2">{catalogBySku[a.codeArt].message}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {photoErrors.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-red-300 mb-1">Photos — erreurs :</h3>
          <ul className="text-sm space-y-1">
            {photoErrors.map((p) => {
              const s = uploadState[p.id];
              const msg = s?.status === "error" ? s.message : "";
              return (
                <li key={p.id} className="font-mono text-red-200">
                  [{p.assignedTo}] {p.file.name} <span className="text-gray-400 italic ml-2">{msg}</span>
                </li>
              );
            })}
          </ul>
        </div>
      )}
      {enrichErrors.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-red-300 mb-1">Enrichissement — erreurs :</h3>
          <ul className="text-sm space-y-1">
            {enrichErrors.map((a) => (
              <li key={a.codeArt} className="font-mono text-red-200">
                {a.codeArt} <span className="text-gray-400 italic ml-2">{enrichBySku[a.codeArt].error}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};

// ─── Sous-composant : cellule drop+pick par SKU (repris de /shopify-photos) ──

type SkuDropCellProps = {
  skuCode: string;
  photos: PhotoItem[];
  onDrop: (e: React.DragEvent) => void;
  onDragOver: (e: React.DragEvent) => void;
  onFilesPicked: (files: FileList) => void;
  onPhotoDragStart: (e: React.DragEvent, photoId: string) => void;
  onPhotoRemove: (photoId: string) => void;
  onPhotoDropReorder: (draggedPhotoId: string, targetPhotoId: string) => void;
  getPhotoStatus: (photoId: string) => PhotoUpload | undefined;
  disabled: boolean;
};

const SkuDropCell: React.FC<SkuDropCellProps> = ({
  skuCode, photos, onDrop, onDragOver, onFilesPicked,
  onPhotoDragStart, onPhotoRemove, onPhotoDropReorder, getPhotoStatus, disabled,
}) => {
  const inputRef = useRef<HTMLInputElement | null>(null);

  const handlePick = () => {
    if (!disabled) inputRef.current?.click();
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) onFilesPicked(e.target.files);
    e.target.value = "";
  };

  return (
    <div
      onDrop={disabled ? undefined : onDrop}
      onDragOver={disabled ? undefined : onDragOver}
      className={`min-h-[88px] rounded-lg p-2 border-2 border-dashed transition-colors ${
        photos.length === 0
          ? `border-gray-700 ${disabled ? "" : "hover:border-blue-600 cursor-pointer"}`
          : "border-blue-700/50 bg-blue-950/20"
      }`}
      onClick={photos.length === 0 ? handlePick : undefined}
      aria-label={`Zone photos pour ${skuCode}`}
    >
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPTED_MIME.join(",")}
        multiple
        onChange={handleInputChange}
        className="hidden"
        disabled={disabled}
      />
      {photos.length === 0 ? (
        <div className="flex items-center justify-center gap-2 h-full py-4 text-xs italic text-gray-500">
          <FaUpload />
          <span>{disabled ? "Aucune photo" : "Déposer ou cliquer pour choisir"}</span>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2 items-center">
          {photos.map((p, idx) => (
            <PhotoThumb
              key={p.id}
              photo={p}
              position={idx + 1}
              onRemove={() => onPhotoRemove(p.id)}
              onDragStart={(e) => onPhotoDragStart(e, p.id)}
              onDropOnThis={(draggedId) => onPhotoDropReorder(draggedId, p.id)}
              status={getPhotoStatus(p.id)}
            />
          ))}
          {!disabled && (
            <button
              type="button"
              onClick={handlePick}
              aria-label={`Ajouter une photo à ${skuCode}`}
              className="w-16 h-16 flex flex-col items-center justify-center border-2 border-dashed border-gray-600 rounded-lg hover:border-blue-500 hover:bg-[#1c1f2e] transition-colors text-gray-400 text-xs"
            >
              <FaPlus />
              <span>Ajouter</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
};

// ─── Sous-composant : vignette photo (repris de /shopify-photos, + "skipped") ──

type PhotoThumbProps = {
  photo: PhotoItem;
  position?: number;
  onRemove: () => void;
  onDragStart: (e: React.DragEvent) => void;
  onDropOnThis?: (draggedPhotoId: string) => void;
  status?: PhotoUpload;
};

const PhotoThumb: React.FC<PhotoThumbProps> = ({ photo, position, onRemove, onDragStart, onDropOnThis, status }) => {
  const showOverlay = status && status.status !== "pending";
  const editable = !status || status.status === "pending";
  const [isDragOver, setIsDragOver] = useState(false);

  const handleDragOver = (e: React.DragEvent) => {
    if (!editable || !onDropOnThis) return;
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = "move";
    setIsDragOver(true);
  };

  const handleDrop = (e: React.DragEvent) => {
    if (!onDropOnThis) return;
    const draggedId = e.dataTransfer.getData("photo-id");
    if (!draggedId) return;
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
    onDropOnThis(draggedId);
  };

  return (
    <div
      draggable={editable}
      onDragStart={onDragStart}
      onDragOver={handleDragOver}
      onDragLeave={() => setIsDragOver(false)}
      onDrop={handleDrop}
      className={`relative w-16 h-16 rounded-lg overflow-hidden border bg-[#1c1f2e] ${editable ? "cursor-grab active:cursor-grabbing" : ""} group transition-shadow ${
        isDragOver ? "border-blue-400 ring-2 ring-blue-400" : "border-gray-700"
      }`}
      title={photo.file.name}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={photo.previewUrl}
        alt={photo.file.name}
        className="w-full h-full object-cover pointer-events-none"
        draggable={false}
      />

      {position !== undefined && (
        <span
          className="absolute top-0.5 left-0.5 min-w-[18px] h-[18px] px-1 flex items-center justify-center rounded-full bg-blue-600 text-white text-[10px] font-bold shadow pointer-events-none"
          title={position === 1 ? "Image de couverture" : `Position ${position}`}
        >
          {position}
        </span>
      )}

      {showOverlay && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/60 pointer-events-none">
          {status?.status === "uploading" && <FaSpinner className="text-blue-400 text-xl animate-spin" />}
          {status?.status === "done" && <FaCheckCircle className="text-green-400 text-xl" />}
          {status?.status === "error" && <FaTimesCircle className="text-red-400 text-xl" />}
          {status?.status === "skipped" && <FaMinusCircle className="text-gray-400 text-xl" />}
        </div>
      )}

      {editable && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onRemove(); }}
          aria-label={`Retirer ${photo.file.name}`}
          className="absolute top-0.5 right-0.5 w-5 h-5 flex items-center justify-center rounded-full bg-black/70 text-white opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-600"
        >
          <FaTimes className="text-[10px]" />
        </button>
      )}
    </div>
  );
};

export default ShopifyImportCompletPage;
