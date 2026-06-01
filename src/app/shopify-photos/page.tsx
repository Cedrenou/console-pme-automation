"use client";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { FaUpload, FaFileCsv, FaCheckCircle, FaTimesCircle, FaSpinner, FaTimes, FaPlus, FaChevronLeft, FaChevronRight } from "react-icons/fa";

/**
 * Parser CSV tolérant — supporte à la fois l'export caisse Rezomatic
 * (séparateur `;`, colonne "Code article") et un export WooCommerce
 * (séparateur `,`, colonne "UGS"/"SKU"). Le séparateur est détecté
 * automatiquement à partir de la ligne d'en-tête.
 */
const detectDelimiter = (headerLine: string): string => {
  const candidates = [";", ",", "\t"];
  let best = ";";
  let bestCount = -1;
  for (const d of candidates) {
    // compte les occurrences hors guillemets (approx : suffisant pour un header)
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

type SkuRow = { codeArt: string; designation: string };

type PhotoItem = {
  id: string;
  file: File;
  previewUrl: string;
  assignedTo: string;  // codeArt — par construction toujours assigné à un SKU
};

type UploadResult =
  | { status: "pending" }
  | { status: "uploading" }
  | { status: "done"; imageId: number }
  | { status: "error"; message: string };

// Limite binaire par photo. Amplify SSR (Lambda) plafonne le payload requête
// à 6Mo ; après base64 (+33%) on doit rester sous 4.5Mo binaire. On retient
// 4Mo pour garder de la marge sur le JSON wrapper.
const MAX_FILE_BYTES = 4 * 1024 * 1024;

const ACCEPTED_MIME = ["image/jpeg", "image/jpg", "image/png", "image/webp"];

const uid = (): string => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;

// Encodage base64 sans préfixe data:URI (le middleware attend du base64 brut).
const fileToBase64 = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result ?? "");
      const comma = result.indexOf(",");
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.onerror = () => reject(reader.error ?? new Error("Lecture fichier impossible"));
    reader.readAsDataURL(file);
  });
};

const ShopifyPhotosPage = () => {
  const [skus, setSkus] = useState<SkuRow[]>([]);
  const [filename, setFilename] = useState<string | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [photos, setPhotos] = useState<PhotoItem[]>([]);
  const [uploadState, setUploadState] = useState<Record<string, UploadResult>>({});
  const [importing, setImporting] = useState(false);
  const [done, setDone] = useState(false);
  const [manualSku, setManualSku] = useState("");

  // Cleanup des objectURLs au unmount pour éviter une fuite mémoire.
  useEffect(() => {
    return () => {
      photos.forEach((p) => URL.revokeObjectURL(p.previewUrl));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleCsvFile = (file: File) => {
    setParseError(null);
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
        const extracted: SkuRow[] = [];
        const seen = new Set<string>();
        for (const r of rows) {
          const sku = r[skuKey]?.trim();
          if (!sku) continue;
          if (!/^[A-Za-z0-9_-]+$/.test(sku)) continue;
          if (seen.has(sku)) continue;
          seen.add(sku);
          extracted.push({ codeArt: sku, designation: (designationKey ? r[designationKey] : "")?.trim() ?? "" });
        }
        if (extracted.length === 0) {
          setParseError(`Colonne "${skuKey}" trouvée mais aucun SKU valide dedans (vérifiez le contenu).`);
          setSkus([]);
          return;
        }
        setSkus(extracted);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Erreur de parsing";
        setParseError(msg);
        setSkus([]);
      }
    };
    reader.readAsText(file, "UTF-8");
  };

  const onCsvChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleCsvFile(file);
  };

  const addManualSku = () => {
    const sku = manualSku.trim();
    if (!sku) return;
    if (!/^[A-Za-z0-9_-]+$/.test(sku)) {
      setParseError(`SKU invalide : "${sku}" (lettres, chiffres, tirets uniquement)`);
      return;
    }
    if (skus.some((s) => s.codeArt === sku)) {
      setParseError(`SKU "${sku}" déjà dans la liste`);
      setManualSku("");
      return;
    }
    setParseError(null);
    setSkus((prev) => [...prev, { codeArt: sku, designation: "(ajouté manuellement)" }]);
    setManualSku("");
  };

  const onManualSkuKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      addManualSku();
    }
  };

  const removeSku = (skuCode: string) => {
    // Retire le SKU et les photos qui lui sont rattachées
    setPhotos((prev) => {
      const removed = prev.filter((p) => p.assignedTo === skuCode);
      removed.forEach((p) => URL.revokeObjectURL(p.previewUrl));
      return prev.filter((p) => p.assignedTo !== skuCode);
    });
    setSkus((prev) => prev.filter((s) => s.codeArt !== skuCode));
  };

  // Ajoute des fichiers à un SKU précis. Filtre les fichiers rejetés (mime
  // non supporté ou trop volumineux) et remonte un message d'erreur global.
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
      accepted.push({
        id: uid(),
        file,
        previewUrl: URL.createObjectURL(file),
        assignedTo: skuCode,
      });
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

  // ─── Drag & drop ─────────────────────────────────────────────────
  //
  // 2 sources possibles à un drop sur une ligne SKU :
  // 1. Fichiers OS (DataTransfer.files non vide) → ajout au SKU
  // 2. Photo déjà dans l'UI (dataTransfer "photo-id") → réaffectation
  //    d'un SKU vers un autre

  const handleDropOnSku = (e: React.DragEvent, skuCode: string) => {
    e.preventDefault();
    e.stopPropagation();
    const draggedPhotoId = e.dataTransfer.getData("photo-id");
    if (draggedPhotoId) {
      setPhotos((prev) => prev.map((p) => p.id === draggedPhotoId ? { ...p, assignedTo: skuCode } : p));
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

  // Réordonne une photo au sein de SON SKU (l'ordre d'affichage = l'ordre
  // d'upload = la position côté Shopify). On échange les positions absolues
  // des deux photos voisines dans le tableau `photos` : comme `photosBySku`
  // préserve l'ordre du tableau, ça ne déplace que ces deux-là et n'affecte
  // pas les autres SKUs.
  const movePhotoWithinSku = (photoId: string, dir: "left" | "right") => {
    setPhotos((prev) => {
      const photo = prev.find((p) => p.id === photoId);
      if (!photo) return prev;
      const sameSkuIndices = prev
        .map((p, i) => ({ p, i }))
        .filter((x) => x.p.assignedTo === photo.assignedTo)
        .map((x) => x.i);
      const posInSku = sameSkuIndices.findIndex((i) => prev[i].id === photoId);
      const targetPos = dir === "left" ? posInSku - 1 : posInSku + 1;
      if (targetPos < 0 || targetPos >= sameSkuIndices.length) return prev;
      const a = sameSkuIndices[posInSku];
      const b = sameSkuIndices[targetPos];
      const next = [...prev];
      [next[a], next[b]] = [next[b], next[a]];
      return next;
    });
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

  const skusWithPhotos = useMemo(() => skus.filter((s) => photosBySku.has(s.codeArt)).length, [skus, photosBySku]);
  const canImport = !importing && photos.length > 0;

  const handleImport = async () => {
    if (!canImport) return;
    setImporting(true);
    setDone(false);

    const initial: Record<string, UploadResult> = {};
    for (const p of photos) initial[p.id] = { status: "pending" };
    setUploadState(initial);

    // Position 1-based de chaque photo au sein de son SKU. Envoyée à Shopify
    // pour garantir l'ordre affiché ici (photo #1 = image de couverture),
    // sans dépendre de l'ordre d'arrivée des requêtes.
    const positionByPhotoId = new Map<string, number>();
    for (const [, list] of photosBySku) {
      list.forEach((p, idx) => positionByPhotoId.set(p.id, idx + 1));
    }

    // Boucle séquentielle. Shopify rate-limit à 2 req/s sur la même boutique,
    // donc le séquentiel est aussi rapide en pratique et plus simple à raisonner.
    for (const photo of photos) {
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
          setUploadState((prev) => ({
            ...prev,
            [photo.id]: { status: "done", imageId: data.imageId ?? 0 },
          }));
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Erreur réseau";
        setUploadState((prev) => ({ ...prev, [photo.id]: { status: "error", message: msg } }));
      }
    }

    setImporting(false);
    setDone(true);
  };

  const resetAll = () => {
    photos.forEach((p) => URL.revokeObjectURL(p.previewUrl));
    setPhotos([]);
    setUploadState({});
    setDone(false);
    setSkus([]);
    setFilename(null);
    setParseError(null);
  };

  const uploadedCount = Object.values(uploadState).filter((s) => s.status === "done").length;
  const errorCount = Object.values(uploadState).filter((s) => s.status === "error").length;
  const totalToUpload = Object.keys(uploadState).length;

  const getPhotoStatus = (photoId: string): UploadResult | undefined => uploadState[photoId];

  return (
    <div className="min-h-screen bg-[#151826] text-white p-4 md:p-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">Import Photos Shopify</h1>
        <p className="text-gray-400">
          Déposez un CSV de SKUs, puis affectez les photos à chaque article avant de lancer l&apos;import.
          Les photos sont <strong>ajoutées</strong> aux produits Shopify existants (jamais en remplacement).
        </p>
      </div>

      {/* Étape 1 : liste de SKUs (CSV ou saisie manuelle) */}
      <div className="bg-[#23263A] rounded-2xl shadow-lg p-6 mb-6">
        <div className="flex items-center gap-4 mb-4">
          <FaFileCsv className="text-3xl text-blue-400" />
          <div>
            <h2 className="text-xl font-semibold">1. Liste des SKUs</h2>
            <p className="text-sm text-gray-400">Importer un CSV (colonne &laquo; Code article &raquo;) ou saisir un SKU manuellement.</p>
          </div>
        </div>

        <label
          className="flex items-center justify-center gap-3 px-6 py-6 border-2 border-dashed border-gray-600 rounded-xl cursor-pointer hover:border-blue-500 hover:bg-[#1c1f2e] transition-colors"
          tabIndex={0}
        >
          <FaUpload className="text-2xl text-gray-400" />
          <span className="text-gray-300">
            {filename ? <strong className="text-white">{filename}</strong> : "Cliquer pour choisir un fichier CSV"}
          </span>
          <input type="file" accept=".csv,text/csv" onChange={onCsvChange} className="hidden" />
        </label>

        <div className="flex items-center gap-3 my-4">
          <div className="flex-1 h-px bg-gray-700" />
          <span className="text-xs text-gray-500 uppercase tracking-wider">ou</span>
          <div className="flex-1 h-px bg-gray-700" />
        </div>

        <div className="flex gap-2">
          <input
            type="text"
            value={manualSku}
            onChange={(e) => setManualSku(e.target.value)}
            onKeyDown={onManualSkuKey}
            placeholder="Saisir un code article (ex: R0186A51)"
            className="flex-1 px-4 py-2 bg-[#1c1f2e] border border-gray-600 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 font-mono text-sm"
            aria-label="Ajouter un SKU manuellement"
          />
          <button
            type="button"
            onClick={addManualSku}
            disabled={!manualSku.trim()}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white rounded-lg font-semibold transition-colors flex items-center gap-2"
          >
            <FaPlus /> Ajouter
          </button>
        </div>

        {skus.length > 0 && (
          <p className="text-sm text-gray-400 mt-4">
            <strong className="text-white">{skus.length}</strong> SKU(s) dans la liste — dont{" "}
            <strong className="text-green-400">{skusWithPhotos}</strong> avec au moins une photo associée.
          </p>
        )}
      </div>

      {parseError && (
        <div className="bg-red-900/40 border border-red-700 rounded-2xl p-4 mb-6 flex items-start gap-3">
          <FaTimesCircle className="text-red-400 text-xl mt-0.5" />
          <p className="text-red-300">{parseError}</p>
        </div>
      )}

      {/* Étape 2 : tableau SKUs avec drop zone par ligne */}
      {skus.length > 0 && (
        <div className="bg-[#23263A] rounded-2xl shadow-lg p-6 mb-6">
          <div className="flex items-center justify-between mb-4 gap-4">
            <div>
              <h2 className="text-xl font-semibold">2. Affecter les photos aux SKUs</h2>
              <p className="text-sm text-gray-400">
                Glissez les photos directement sur la ligne du SKU, ou cliquez pour les sélectionner. Max 4 Mo par photo (JPG/PNG/WebP).
              </p>
            </div>
            <button
              onClick={handleImport}
              disabled={!canImport}
              aria-label="Lancer l'import"
              className="px-6 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white rounded-lg font-semibold transition-colors flex items-center gap-2 flex-shrink-0"
            >
              {importing ? (
                <><FaSpinner className="animate-spin" /> Import {uploadedCount + errorCount}/{totalToUpload}</>
              ) : (
                <>Lancer l&apos;import ({photos.length})</>
              )}
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-gray-400 border-b border-gray-700">
                <tr>
                  <th className="text-left py-2 pr-4 w-40">Code article</th>
                  <th className="text-left py-2 pr-4">Désignation</th>
                  <th className="text-left py-2">Photos</th>
                  <th className="w-10"></th>
                </tr>
              </thead>
              <tbody>
                {skus.map((s) => {
                  const skuPhotos = photosBySku.get(s.codeArt) ?? [];
                  return (
                    <tr key={s.codeArt} className="border-b border-gray-700/60 align-top">
                      <td className="py-3 pr-4 font-mono text-white">{s.codeArt}</td>
                      <td className="py-3 pr-4 text-gray-300">{s.designation || <span className="italic text-gray-500">(vide)</span>}</td>
                      <td className="py-3">
                        <SkuDropCell
                          skuCode={s.codeArt}
                          photos={skuPhotos}
                          onDrop={(e) => handleDropOnSku(e, s.codeArt)}
                          onDragOver={handleDragOver}
                          onFilesPicked={(files) => addFilesToSku(files, s.codeArt)}
                          onPhotoDragStart={handleDragStart}
                          onPhotoRemove={removePhoto}
                          onPhotoMove={movePhotoWithinSku}
                          getPhotoStatus={getPhotoStatus}
                          disabled={importing}
                        />
                      </td>
                      <td className="py-3 pl-2">
                        <button
                          type="button"
                          onClick={() => removeSku(s.codeArt)}
                          disabled={importing}
                          aria-label={`Retirer ${s.codeArt} de la liste`}
                          className="w-7 h-7 flex items-center justify-center rounded-full text-gray-500 hover:text-red-400 hover:bg-red-900/30 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                          title="Retirer ce SKU de la liste"
                        >
                          <FaTimes />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Récap final */}
      {done && (
        <div className="bg-[#23263A] rounded-2xl shadow-lg p-6 mb-6">
          <div className="flex items-center gap-3 mb-4">
            {errorCount === 0 ? (
              <FaCheckCircle className="text-green-400 text-3xl" />
            ) : (
              <FaTimesCircle className="text-yellow-400 text-3xl" />
            )}
            <h2 className="text-2xl font-bold">Import terminé</h2>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-6">
            <div className="bg-[#1c1f2e] rounded-xl p-4">
              <div className="text-gray-400 text-sm">Total</div>
              <div className="text-2xl font-bold">{totalToUpload}</div>
            </div>
            <div className="bg-green-900/30 border border-green-700 rounded-xl p-4">
              <div className="text-green-300 text-sm">Uploadées</div>
              <div className="text-2xl font-bold text-green-400">{uploadedCount}</div>
            </div>
            <div className={`rounded-xl p-4 border ${errorCount > 0 ? "bg-red-900/30 border-red-700" : "bg-[#1c1f2e] border-gray-700"}`}>
              <div className={`text-sm ${errorCount > 0 ? "text-red-300" : "text-gray-400"}`}>Erreurs</div>
              <div className={`text-2xl font-bold ${errorCount > 0 ? "text-red-400" : "text-white"}`}>{errorCount}</div>
            </div>
          </div>

          {errorCount > 0 && (
            <div className="bg-[#1c1f2e] rounded-xl p-4 max-h-64 overflow-y-auto mb-4">
              <h3 className="text-sm font-semibold text-red-300 mb-2">Photos en erreur :</h3>
              <ul className="text-sm space-y-1">
                {photos
                  .filter((p) => uploadState[p.id]?.status === "error")
                  .map((p) => {
                    const s = uploadState[p.id];
                    const msg = s?.status === "error" ? s.message : "";
                    return (
                      <li key={p.id} className="font-mono text-red-200">
                        [{p.assignedTo}] {p.file.name}
                        <span className="text-gray-400 italic ml-2">{msg}</span>
                      </li>
                    );
                  })}
              </ul>
            </div>
          )}

          <button
            onClick={resetAll}
            className="px-6 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors"
          >
            Faire un nouvel import
          </button>
        </div>
      )}
    </div>
  );
};

// ─── Sous-composant : cellule drop+pick par SKU ──────────────────────

type SkuDropCellProps = {
  skuCode: string;
  photos: PhotoItem[];
  onDrop: (e: React.DragEvent) => void;
  onDragOver: (e: React.DragEvent) => void;
  onFilesPicked: (files: FileList) => void;
  onPhotoDragStart: (e: React.DragEvent, photoId: string) => void;
  onPhotoRemove: (photoId: string) => void;
  onPhotoMove: (photoId: string, dir: "left" | "right") => void;
  getPhotoStatus: (photoId: string) => UploadResult | undefined;
  disabled: boolean;
};

const SkuDropCell: React.FC<SkuDropCellProps> = ({
  skuCode, photos, onDrop, onDragOver, onFilesPicked,
  onPhotoDragStart, onPhotoRemove, onPhotoMove, getPhotoStatus, disabled,
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
      onDrop={onDrop}
      onDragOver={onDragOver}
      className={`min-h-[88px] rounded-lg p-2 border-2 border-dashed transition-colors ${
        photos.length === 0
          ? "border-gray-700 hover:border-blue-600 cursor-pointer"
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
      />
      {photos.length === 0 ? (
        <div className="flex items-center justify-center gap-2 h-full py-4 text-xs italic text-gray-500">
          <FaUpload />
          <span>Déposer ou cliquer pour choisir</span>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2 items-center">
          {photos.map((p, idx) => (
            <PhotoThumb
              key={p.id}
              photo={p}
              small
              position={idx + 1}
              canMoveLeft={idx > 0}
              canMoveRight={idx < photos.length - 1}
              onMoveLeft={() => onPhotoMove(p.id, "left")}
              onMoveRight={() => onPhotoMove(p.id, "right")}
              onRemove={() => onPhotoRemove(p.id)}
              onDragStart={(e) => onPhotoDragStart(e, p.id)}
              status={getPhotoStatus(p.id)}
            />
          ))}
          <button
            type="button"
            onClick={handlePick}
            disabled={disabled}
            aria-label={`Ajouter une photo à ${skuCode}`}
            className="w-16 h-16 flex flex-col items-center justify-center border-2 border-dashed border-gray-600 rounded-lg hover:border-blue-500 hover:bg-[#1c1f2e] transition-colors text-gray-400 text-xs disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <FaPlus />
            <span>Ajouter</span>
          </button>
        </div>
      )}
    </div>
  );
};

// ─── Sous-composant : vignette photo ──────────────────────────────────

type PhotoThumbProps = {
  photo: PhotoItem;
  small?: boolean;
  position?: number;
  canMoveLeft?: boolean;
  canMoveRight?: boolean;
  onMoveLeft?: () => void;
  onMoveRight?: () => void;
  onRemove: () => void;
  onDragStart: (e: React.DragEvent) => void;
  status?: UploadResult;
};

const PhotoThumb: React.FC<PhotoThumbProps> = ({
  photo, small, position, canMoveLeft, canMoveRight, onMoveLeft, onMoveRight, onRemove, onDragStart, status,
}) => {
  const size = small ? "w-16 h-16" : "w-24 h-24";
  const showOverlay = status && status.status !== "pending";
  const editable = !status || status.status === "pending";

  return (
    <div
      draggable={editable}
      onDragStart={onDragStart}
      className={`relative ${size} rounded-lg overflow-hidden border border-gray-700 bg-[#1c1f2e] cursor-grab active:cursor-grabbing group`}
      title={photo.file.name}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={photo.previewUrl}
        alt={photo.file.name}
        className="w-full h-full object-cover"
        draggable={false}
      />

      {/* Badge de position : 1 = image de couverture côté Shopify */}
      {position !== undefined && (
        <span
          className="absolute top-0.5 left-0.5 min-w-[18px] h-[18px] px-1 flex items-center justify-center rounded-full bg-blue-600 text-white text-[10px] font-bold shadow"
          title={position === 1 ? "Image de couverture" : `Position ${position}`}
        >
          {position}
        </span>
      )}

      {showOverlay && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/60">
          {status?.status === "uploading" && <FaSpinner className="text-blue-400 text-xl animate-spin" />}
          {status?.status === "done" && <FaCheckCircle className="text-green-400 text-xl" />}
          {status?.status === "error" && <FaTimesCircle className="text-red-400 text-xl" />}
        </div>
      )}

      {editable && (
        <>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onRemove(); }}
            aria-label={`Retirer ${photo.file.name}`}
            className="absolute top-0.5 right-0.5 w-5 h-5 flex items-center justify-center rounded-full bg-black/70 text-white opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-600"
          >
            <FaTimes className="text-[10px]" />
          </button>

          {/* Flèches de réordonnancement (apparaissent au survol) */}
          <div className="absolute bottom-0 inset-x-0 flex justify-between px-0.5 pb-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onMoveLeft?.(); }}
              disabled={!canMoveLeft}
              aria-label="Déplacer vers la gauche"
              className="w-5 h-5 flex items-center justify-center rounded bg-black/70 text-white hover:bg-blue-600 disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <FaChevronLeft className="text-[10px]" />
            </button>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onMoveRight?.(); }}
              disabled={!canMoveRight}
              aria-label="Déplacer vers la droite"
              className="w-5 h-5 flex items-center justify-center rounded bg-black/70 text-white hover:bg-blue-600 disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <FaChevronRight className="text-[10px]" />
            </button>
          </div>
        </>
      )}
    </div>
  );
};

export default ShopifyPhotosPage;
