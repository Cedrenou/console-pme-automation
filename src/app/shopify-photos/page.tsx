"use client";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FaUpload, FaFileCsv, FaCheckCircle, FaTimesCircle, FaSpinner, FaImages, FaTimes } from "react-icons/fa";

/**
 * Parser CSV — identique à shopify-catalogue (même format export caisse
 * Rezomatic, séparateur `;`, colonne "Code article"). Dupliqué volontairement
 * pour rester aligné si l'un des deux écrans évolue indépendamment.
 */
const parseCsv = (raw: string): Record<string, string>[] => {
  const lines = raw.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length === 0) return [];

  const parseLine = (line: string): string[] => {
    const cols: string[] = [];
    let buf = "";
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (c === '"') {
        if (inQuotes && line[i + 1] === '"') { buf += '"'; i++; }
        else inQuotes = !inQuotes;
      } else if (c === ";" && !inQuotes) {
        cols.push(buf);
        buf = "";
      } else {
        buf += c;
      }
    }
    cols.push(buf);
    return cols;
  };

  const headers = parseLine(lines[0]);
  return lines.slice(1).map((line) => {
    const cols = parseLine(line);
    const obj: Record<string, string> = {};
    headers.forEach((h, i) => { obj[h] = cols[i] ?? ""; });
    return obj;
  });
};

type SkuRow = { codeArt: string; designation: string };

type PhotoItem = {
  id: string;          // identifiant interne (uuid v4 sans crypto pour rester léger)
  file: File;
  previewUrl: string;  // objectURL — révoqué au unmount
  assignedTo: string | null; // codeArt du SKU, ou null = réserve
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

// uuid léger — pas besoin de crypto.randomUUID pour de simples clés React.
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

  // Cleanup des objectURLs au unmount pour éviter une fuite mémoire si
  // l'utilisateur navigue ailleurs en cours d'import.
  useEffect(() => {
    return () => {
      photos.forEach((p) => URL.revokeObjectURL(p.previewUrl));
    };
    // On veut juste cleanup au unmount, pas à chaque update de photos.
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
        const headerKey = Object.keys(rows[0]).find((k) => k.trim().toLowerCase() === "code article");
        if (!headerKey) {
          setParseError("Colonne 'Code article' introuvable dans le CSV");
          setSkus([]);
          return;
        }
        const extracted: SkuRow[] = [];
        const seen = new Set<string>();
        for (const r of rows) {
          const sku = r[headerKey]?.trim();
          if (!sku) continue;
          if (!/^[A-Za-z0-9_-]+$/.test(sku)) continue;
          if (seen.has(sku)) continue;
          seen.add(sku);
          extracted.push({ codeArt: sku, designation: (r["Designation"] ?? "").trim() });
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

  const addPhotoFiles = useCallback((files: FileList | File[]) => {
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
        assignedTo: null,
      });
    }
    if (rejected.length > 0) {
      setParseError(`Fichiers rejetés : ${rejected.join(", ")}`);
    }
    if (accepted.length > 0) {
      setPhotos((prev) => [...prev, ...accepted]);
    }
  }, []);

  const onPhotoInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) addPhotoFiles(e.target.files);
    // reset pour permettre re-sélection du même fichier
    e.target.value = "";
  };

  // ─── Drag & drop ─────────────────────────────────────────────────
  //
  // 2 sources possibles à un drop :
  // 1. Fichiers OS (DataTransfer.files non vide) → on ajoute à la réserve
  //    si drop sur la zone réserve, OU à un SKU si drop sur une ligne SKU.
  // 2. Photo déjà dans l'UI : on transporte son id via dataTransfer (text/plain)
  //    pour permettre la réaffectation entre SKU et réserve.

  const handleDropOnSku = (e: React.DragEvent, skuCode: string) => {
    e.preventDefault();
    e.stopPropagation();
    const draggedPhotoId = e.dataTransfer.getData("photo-id");
    if (draggedPhotoId) {
      setPhotos((prev) => prev.map((p) => p.id === draggedPhotoId ? { ...p, assignedTo: skuCode } : p));
      return;
    }
    if (e.dataTransfer.files.length > 0) {
      const newItems: PhotoItem[] = [];
      for (const file of Array.from(e.dataTransfer.files)) {
        if (!ACCEPTED_MIME.includes(file.type)) continue;
        if (file.size > MAX_FILE_BYTES) continue;
        newItems.push({ id: uid(), file, previewUrl: URL.createObjectURL(file), assignedTo: skuCode });
      }
      if (newItems.length > 0) setPhotos((prev) => [...prev, ...newItems]);
    }
  };

  const handleDropOnReserve = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const draggedPhotoId = e.dataTransfer.getData("photo-id");
    if (draggedPhotoId) {
      setPhotos((prev) => prev.map((p) => p.id === draggedPhotoId ? { ...p, assignedTo: null } : p));
      return;
    }
    if (e.dataTransfer.files.length > 0) {
      addPhotoFiles(e.dataTransfer.files);
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

  // ─── Indices dérivés ─────────────────────────────────────────────

  const photosBySku = useMemo(() => {
    const map = new Map<string, PhotoItem[]>();
    for (const p of photos) {
      if (p.assignedTo) {
        const arr = map.get(p.assignedTo) ?? [];
        arr.push(p);
        map.set(p.assignedTo, arr);
      }
    }
    return map;
  }, [photos]);

  const unassignedPhotos = useMemo(() => photos.filter((p) => p.assignedTo === null), [photos]);

  const assignedCount = photos.length - unassignedPhotos.length;
  const skusWithPhotos = useMemo(() => skus.filter((s) => photosBySku.has(s.codeArt)).length, [skus, photosBySku]);
  const canImport = !importing && assignedCount > 0;

  // ─── Lancement de l'import ───────────────────────────────────────

  const handleImport = async () => {
    if (!canImport) return;
    setImporting(true);
    setDone(false);

    const toUpload = photos.filter((p) => p.assignedTo !== null);

    // État initial : toutes les photos affectées en pending
    const initial: Record<string, UploadResult> = {};
    for (const p of toUpload) initial[p.id] = { status: "pending" };
    setUploadState(initial);

    // Boucle séquentielle. On pourrait paralléliser à 3-4 mais Shopify rate-limit
    // sur la même boutique (2 req/s), donc le séquentiel est aussi rapide en
    // pratique et plus simple à raisonner.
    for (const photo of toUpload) {
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

  // Progression
  const uploadedCount = Object.values(uploadState).filter((s) => s.status === "done").length;
  const errorCount = Object.values(uploadState).filter((s) => s.status === "error").length;
  const totalToUpload = Object.keys(uploadState).length;

  const getPhotoStatus = (photoId: string): UploadResult | undefined => uploadState[photoId];

  return (
    <div className="min-h-screen bg-[#151826] text-white p-4 md:p-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">Import Photos Shopify</h1>
        <p className="text-gray-400">
          Déposez un CSV de SKUs, puis associez les photos à chaque article avant de lancer l&apos;import.
          Les photos sont <strong>ajoutées</strong> aux produits Shopify existants (jamais en remplacement).
        </p>
      </div>

      {/* Étape 1 : CSV */}
      <div className="bg-[#23263A] rounded-2xl shadow-lg p-6 mb-6">
        <div className="flex items-center gap-4 mb-4">
          <FaFileCsv className="text-3xl text-blue-400" />
          <div>
            <h2 className="text-xl font-semibold">1. CSV des SKUs</h2>
            <p className="text-sm text-gray-400">Format identique à l&apos;import catalogue (colonne &laquo; Code article &raquo;).</p>
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
        {skus.length > 0 && (
          <p className="text-sm text-gray-400 mt-3">
            <strong className="text-white">{skus.length}</strong> SKU(s) détecté(s) — dont{" "}
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

      {/* Étape 2 : Réserve photos */}
      {skus.length > 0 && (
        <div className="bg-[#23263A] rounded-2xl shadow-lg p-6 mb-6">
          <div className="flex items-center gap-4 mb-4">
            <FaImages className="text-3xl text-purple-400" />
            <div>
              <h2 className="text-xl font-semibold">2. Réserve photos</h2>
              <p className="text-sm text-gray-400">
                Déposez ici toutes les photos en vrac (jusqu&apos;à 4 Mo par photo, JPG/PNG/WebP), puis glissez chaque photo vers le SKU correspondant ci-dessous.
              </p>
            </div>
          </div>

          <div
            onDrop={handleDropOnReserve}
            onDragOver={handleDragOver}
            className="min-h-[120px] border-2 border-dashed border-purple-700/50 rounded-xl p-4 bg-[#1c1f2e]"
            aria-label="Zone de dépôt photos réserve"
          >
            {unassignedPhotos.length === 0 ? (
              <label className="flex items-center justify-center gap-3 h-full py-6 cursor-pointer text-gray-400 hover:text-gray-200 transition-colors">
                <FaUpload />
                <span>Glisser les photos ici, ou cliquer pour les sélectionner</span>
                <input
                  type="file"
                  accept={ACCEPTED_MIME.join(",")}
                  multiple
                  onChange={onPhotoInput}
                  className="hidden"
                />
              </label>
            ) : (
              <div className="flex flex-wrap gap-3">
                {unassignedPhotos.map((p) => (
                  <PhotoThumb
                    key={p.id}
                    photo={p}
                    onRemove={() => removePhoto(p.id)}
                    onDragStart={(e) => handleDragStart(e, p.id)}
                    status={getPhotoStatus(p.id)}
                  />
                ))}
                <label className="w-24 h-24 flex flex-col items-center justify-center gap-1 border-2 border-dashed border-gray-600 rounded-lg cursor-pointer hover:border-purple-500 hover:bg-[#23263A] transition-colors text-gray-400 text-xs">
                  <FaUpload />
                  <span>Ajouter</span>
                  <input
                    type="file"
                    accept={ACCEPTED_MIME.join(",")}
                    multiple
                    onChange={onPhotoInput}
                    className="hidden"
                  />
                </label>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Étape 3 : tableau SKUs avec drop zone par ligne */}
      {skus.length > 0 && (
        <div className="bg-[#23263A] rounded-2xl shadow-lg p-6 mb-6">
          <div className="flex items-center justify-between mb-4 gap-4">
            <div>
              <h2 className="text-xl font-semibold">3. Affecter les photos aux SKUs</h2>
              <p className="text-sm text-gray-400">
                Glissez chaque photo depuis la réserve vers le SKU correspondant.
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
                <>Lancer l&apos;import ({assignedCount})</>
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
                </tr>
              </thead>
              <tbody>
                {skus.map((s) => {
                  const skuPhotos = photosBySku.get(s.codeArt) ?? [];
                  return (
                    <tr key={s.codeArt} className="border-b border-gray-800 align-top">
                      <td className="py-3 pr-4 font-mono text-white">{s.codeArt}</td>
                      <td className="py-3 pr-4 text-gray-300">{s.designation || <span className="italic text-gray-500">(vide)</span>}</td>
                      <td className="py-3">
                        <div
                          onDrop={(e) => handleDropOnSku(e, s.codeArt)}
                          onDragOver={handleDragOver}
                          className={`min-h-[88px] rounded-lg p-2 border-2 border-dashed transition-colors ${
                            skuPhotos.length === 0
                              ? "border-gray-700 hover:border-blue-600"
                              : "border-blue-700/50 bg-blue-950/20"
                          }`}
                          aria-label={`Zone photos pour ${s.codeArt}`}
                        >
                          {skuPhotos.length === 0 ? (
                            <span className="text-xs italic text-gray-500 px-2">Déposer des photos ici</span>
                          ) : (
                            <div className="flex flex-wrap gap-2">
                              {skuPhotos.map((p) => (
                                <PhotoThumb
                                  key={p.id}
                                  photo={p}
                                  small
                                  onRemove={() => removePhoto(p.id)}
                                  onDragStart={(e) => handleDragStart(e, p.id)}
                                  status={getPhotoStatus(p.id)}
                                />
                              ))}
                            </div>
                          )}
                        </div>
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

// ─── Sous-composant : vignette photo ──────────────────────────────────

type PhotoThumbProps = {
  photo: PhotoItem;
  small?: boolean;
  onRemove: () => void;
  onDragStart: (e: React.DragEvent) => void;
  status?: UploadResult;
};

const PhotoThumb: React.FC<PhotoThumbProps> = ({ photo, small, onRemove, onDragStart, status }) => {
  const size = small ? "w-16 h-16" : "w-24 h-24";
  const showOverlay = status && status.status !== "pending";

  // Un useRef pour exposer la ref ne sert pas ici, mais on garde la possibilité.
  const imgRef = useRef<HTMLImageElement | null>(null);

  return (
    <div
      draggable={!status || status.status === "pending"}
      onDragStart={onDragStart}
      className={`relative ${size} rounded-lg overflow-hidden border border-gray-700 bg-[#1c1f2e] cursor-grab active:cursor-grabbing group`}
      title={photo.file.name}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        ref={imgRef}
        src={photo.previewUrl}
        alt={photo.file.name}
        className="w-full h-full object-cover"
        draggable={false}
      />

      {/* Statut overlay */}
      {showOverlay && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/60">
          {status?.status === "uploading" && <FaSpinner className="text-blue-400 text-xl animate-spin" />}
          {status?.status === "done" && <FaCheckCircle className="text-green-400 text-xl" />}
          {status?.status === "error" && <FaTimesCircle className="text-red-400 text-xl" />}
        </div>
      )}

      {/* Bouton suppression */}
      {(!status || status.status === "pending") && (
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

export default ShopifyPhotosPage;
