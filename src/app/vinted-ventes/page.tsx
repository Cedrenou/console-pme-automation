"use client";
import React, { useEffect, useRef, useState } from "react";
import {
  fetchVintedEvents, fetchVintedBordereau,
  type VintedEvent
} from "@/lib/api";
import {
  FaCalendarAlt, FaUser, FaFileDownload, FaSearch, FaPrint, FaMapMarkerAlt, FaEnvelope, FaRegCopy, FaCheck
} from "react-icons/fa";

type PeriodId = "30d" | "90d" | "month" | "year" | "all";

const PERIODS: { id: PeriodId; label: string }[] = [
  { id: "30d", label: "30 jours" },
  { id: "90d", label: "90 jours" },
  { id: "month", label: "Ce mois" },
  { id: "year", label: "Cette année" },
  { id: "all", label: "Tout" }
];

const PAGE_SIZE = 50;

// Bornes en UTC pour être cohérent avec le bucketize serveur (cf. cockpit pour le rationale).
const periodToDates = (id: PeriodId): { from?: string; to?: string } => {
  const now = new Date();
  const to = now.toISOString();
  if (id === "all") return {};
  if (id === "30d") return { from: new Date(now.getTime() - 30 * 86400_000).toISOString(), to };
  if (id === "90d") return { from: new Date(now.getTime() - 90 * 86400_000).toISOString(), to };
  if (id === "month") return { from: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString(), to };
  if (id === "year") return { from: new Date(Date.UTC(now.getUTCFullYear(), 0, 1)).toISOString(), to };
  return {};
};

const MONTH_NAMES_FR = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];

const generateMonthOptions = (): { value: string; label: string }[] => {
  const result: { value: string; label: string }[] = [];
  const now = new Date();
  const startYear = 2025;
  for (let y = now.getFullYear(); y >= startYear; y--) {
    const fromMonth = y === now.getFullYear() ? now.getMonth() : 11;
    const toMonth = y === startYear ? 0 : 0;
    for (let m = fromMonth; m >= toMonth; m--) {
      const value = `${y}-${String(m + 1).padStart(2, "0")}`;
      const label = `${MONTH_NAMES_FR[m]} ${y}`;
      result.push({ value, label });
    }
  }
  return result;
};

const monthToDates = (value: string): { from: string; to: string } => {
  const [y, m] = value.split("-").map(Number);
  return {
    from: new Date(Date.UTC(y, m - 1, 1)).toISOString(),
    to: new Date(Date.UTC(y, m, 1)).toISOString(),
  };
};

const MONTH_OPTIONS = generateMonthOptions();

const formatEur = (n: number): string =>
  n.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €";

const formatDate = (iso: string): string => {
  const d = new Date(iso);
  return d.toLocaleDateString("fr-FR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
};

const VintedVentesPage = () => {
  const [period, setPeriod] = useState<PeriodId>("month");
  const [monthFilter, setMonthFilter] = useState<string>("");
  const [search, setSearch] = useState<string>("");
  const [items, setItems] = useState<VintedEvent[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestId = useRef(0);

  const effectiveDates = monthFilter ? monthToDates(monthFilter) : periodToDates(period);

  // Sur les "petites" fenêtres (1 mois précis, ce mois, 30j) on charge tout d'un coup —
  // la volumétrie reste raisonnable et l'utilisateur veut un total juste sans cliquer.
  // Sur 90j/année/tout on garde la pagination manuelle pour éviter une rafale d'appels.
  const autoLoadAll = !!monthFilter || period === "month" || period === "30d";

  const handleSelectPeriod = (id: PeriodId) => {
    setPeriod(id);
    setMonthFilter("");
  };

  // Reset + chargement initial à chaque changement de période
  useEffect(() => {
    const myId = ++requestId.current;
    const load = async () => {
      setLoading(true);
      setError(null);
      setItems([]);
      setCursor(null);
      try {
        const { from, to } = effectiveDates;
        if (autoLoadAll) {
          const accumulator: VintedEvent[] = [];
          let nextCursor: string | null = null;
          do {
            const res = await fetchVintedEvents({ type: "vente", from, to, limit: PAGE_SIZE, cursor: nextCursor ?? undefined });
            if (requestId.current !== myId) return;
            accumulator.push(...res.items);
            nextCursor = res.nextCursor;
            setItems([...accumulator]);
          } while (nextCursor);
          setCursor(null);
        } else {
          const res = await fetchVintedEvents({ type: "vente", from, to, limit: PAGE_SIZE });
          if (requestId.current !== myId) return;
          setItems(res.items);
          setCursor(res.nextCursor);
        }
      } catch (err) {
        if (requestId.current !== myId) return;
        console.error(err);
        setError("Erreur lors du chargement des ventes.");
      } finally {
        if (requestId.current === myId) setLoading(false);
      }
    };
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [period, monthFilter]);

  const handleLoadMore = async () => {
    if (!cursor || loadingMore) return;
    setLoadingMore(true);
    setError(null);
    try {
      const { from, to } = effectiveDates;
      const res = await fetchVintedEvents({ type: "vente", from, to, limit: PAGE_SIZE, cursor });
      setItems(prev => [...prev, ...res.items]);
      setCursor(res.nextCursor);
    } catch (err) {
      console.error(err);
      setError("Erreur lors du chargement de la suite.");
    } finally {
      setLoadingMore(false);
    }
  };

  const filteredItems = search.trim().length === 0
    ? items
    : items.filter(it => {
        const p = it.payload as { article_titre?: string; acheteur_username?: string };
        const haystack = `${p.article_titre ?? ""} ${p.acheteur_username ?? ""}`.toLowerCase();
        return haystack.includes(search.toLowerCase());
      });

  const totalRevenue = filteredItems.reduce((acc, it) => {
    const p = it.payload as { prix_vente?: number };
    return acc + (typeof p.prix_vente === "number" ? p.prix_vente : 0);
  }, 0);
  const pricedCount = filteredItems.filter(it => typeof (it.payload as { prix_vente?: number }).prix_vente === "number").length;

  return (
    <div className="min-h-screen bg-[#151826] text-white p-8">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold mb-2">Ventes Vinted</h1>
          <p className="text-gray-400">Consulte tes ventes et télécharge les bordereaux d&apos;envoi.</p>
        </div>
        <div className="flex flex-wrap gap-2 items-center">
          {PERIODS.map(p => {
            const isActive = period === p.id && !monthFilter;
            return (
              <button
                key={p.id}
                onClick={() => handleSelectPeriod(p.id)}
                aria-pressed={isActive}
                className={`cursor-pointer px-4 py-2 rounded-lg font-semibold transition-colors flex items-center gap-2 ${
                  isActive ? "bg-blue-600 text-white" : "bg-[#23263A] text-gray-300 hover:bg-[#2c3048]"
                }`}
              >
                <FaCalendarAlt className="text-sm" />
                {p.label}
              </button>
            );
          })}
          <div className="h-6 w-px bg-[#2c3048] mx-1" aria-hidden />
          <select
            value={monthFilter}
            onChange={e => setMonthFilter(e.target.value)}
            aria-label="Filtrer par mois"
            className={`cursor-pointer px-4 py-2 rounded-lg font-semibold transition-colors text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${
              monthFilter ? "bg-blue-600 text-white" : "bg-[#23263A] text-gray-300 hover:bg-[#2c3048]"
            }`}
          >
            <option value="">📅 Choisir un mois…</option>
            {MONTH_OPTIONS.map(m => (
              <option key={m.value} value={m.value}>{m.label}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="bg-[#23263A] rounded-2xl shadow-lg p-6">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div className="flex items-center gap-3 flex-wrap">
            <h2 className="text-xl font-bold">Liste des ventes</h2>
            <span className="text-sm text-gray-400">
              {loading
                ? autoLoadAll
                  ? `Chargement… (${items.length})`
                  : "Chargement…"
                : `${filteredItems.length}${cursor ? "+" : ""} affichées`}
            </span>
            {!loading && filteredItems.length > 0 && (
              <span
                className="text-sm bg-emerald-600/15 text-emerald-300 px-3 py-1 rounded-full font-semibold"
                title={pricedCount < filteredItems.length ? `${filteredItems.length - pricedCount} vente(s) sans prix` : "Somme des prix de vente"}
              >
                CA : {formatEur(totalRevenue)}
              </span>
            )}
          </div>
          <div className="relative">
            <FaSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-sm" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Filtrer par titre ou acheteur..."
              className="pl-9 pr-3 py-2 rounded-lg bg-[#1c1f2e] border border-[#2c3048] text-sm text-white placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent w-64"
            />
          </div>
        </div>

        {error && (
          <div className="bg-red-500/20 border border-red-500/50 rounded-lg p-3 mb-4 text-red-400 text-sm">
            {error}
          </div>
        )}

        {loading && items.length === 0 ? (
          <div className="text-gray-400 italic py-8 text-center">Chargement des ventes…</div>
        ) : filteredItems.length === 0 ? (
          <div className="text-gray-500 italic py-8 text-center">
            {search ? "Aucune vente ne matche ce filtre." : "Aucune vente sur la période sélectionnée."}
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
              {filteredItems.map(sale => (
                <SaleRow key={sale.gmailMessageId} sale={sale} />
              ))}
            </div>
            {cursor && !autoLoadAll && (
              <div className="flex justify-center mt-6">
                <button
                  type="button"
                  onClick={handleLoadMore}
                  disabled={loadingMore}
                  className="px-6 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loadingMore ? "Chargement…" : "Charger plus"}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

const CopyableField: React.FC<{
  label: string;
  value: string;
  icon: React.ReactNode;
}> = ({ label, value, icon }) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch (err) {
      console.error("Clipboard write failed", err);
    }
  };

  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="text-gray-500 flex-shrink-0 w-3">{icon}</span>
      <span className="flex-1 truncate text-gray-300" title={value}>{value}</span>
      <button
        type="button"
        onClick={handleCopy}
        className={`cursor-pointer p-1.5 rounded transition-colors flex-shrink-0 ${
          copied
            ? "bg-green-500/20 text-green-400"
            : "text-gray-500 hover:text-blue-300 hover:bg-blue-600/15"
        }`}
        aria-label={`Copier ${label}`}
        title={copied ? "Copié !" : `Copier ${label}`}
      >
        {copied ? <FaCheck className="text-[11px]" /> : <FaRegCopy className="text-[11px]" />}
      </button>
    </div>
  );
};

const SaleRow: React.FC<{ sale: VintedEvent }> = ({ sale }) => {
  const p = sale.payload as {
    acheteur_username?: string;
    acheteur_email?: string;
    article_titre?: string;
    prix_vente?: number;
    article_image_url?: string;
    conversation_url?: string;
    nom?: string;
    rue?: string;
    ville?: string;
    code_postal?: string;
    pays?: string;
    pays_texte?: string;
  };

  const fullAddress = [p.rue, [p.code_postal, p.ville].filter(Boolean).join(" "), p.pays_texte || p.pays]
    .filter(Boolean)
    .join(", ");
  const hasContact = p.nom || fullAddress || p.acheteur_email;

  const [bordereauLoading, setBordereauLoading] = useState<"none" | "print" | "download">("none");
  const [bordereauError, setBordereauError] = useState<string | null>(null);

  // Convertit la réponse API en blob PDF + URL utilisable.
  const fetchBordereauBlob = async (): Promise<{ blob: Blob; filename: string; url: string }> => {
    const { filename, pdfBase64 } = await fetchVintedBordereau(sale.gmailMessageId);
    const byteChars = atob(pdfBase64);
    const byteNums = new Uint8Array(byteChars.length);
    for (let i = 0; i < byteChars.length; i++) byteNums[i] = byteChars.charCodeAt(i);
    const blob = new Blob([byteNums], { type: "application/pdf" });
    return { blob, filename, url: URL.createObjectURL(blob) };
  };

  // Ouvre le print dialog du browser sur le PDF, sans passer par le download.
  // Astuce : iframe cachée avec le blob PDF en src, on déclenche print() au load.
  const handlePrintBordereau = async () => {
    setBordereauLoading("print");
    setBordereauError(null);
    try {
      const { url } = await fetchBordereauBlob();
      const iframe = document.createElement("iframe");
      iframe.style.position = "fixed";
      iframe.style.left = "-9999px";
      iframe.style.width = "0";
      iframe.style.height = "0";
      iframe.src = url;
      document.body.appendChild(iframe);
      iframe.onload = () => {
        try {
          iframe.contentWindow?.focus();
          iframe.contentWindow?.print();
        } catch (err) {
          console.error("Print failed", err);
        }
        // On nettoie après un délai pour laisser le dialog s'ouvrir
        setTimeout(() => {
          document.body.removeChild(iframe);
          URL.revokeObjectURL(url);
        }, 60_000);
      };
    } catch (err) {
      console.error(err);
      setBordereauError(err instanceof Error ? err.message : "Erreur");
    } finally {
      setBordereauLoading("none");
    }
  };

  const handleDownloadBordereau = async () => {
    setBordereauLoading("download");
    setBordereauError(null);
    try {
      const { filename, url } = await fetchBordereauBlob();
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error(err);
      setBordereauError(err instanceof Error ? err.message : "Erreur");
    } finally {
      setBordereauLoading("none");
    }
  };

  return (
    <div className="bg-[#1c1f2e] rounded-lg p-4 flex gap-3 items-start">
      {p.article_image_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={p.article_image_url}
          alt={p.article_titre ?? "article"}
          className="w-16 h-20 object-cover rounded flex-shrink-0"
          loading="lazy"
        />
      ) : (
        <div className="w-16 h-20 bg-[#23263A] rounded flex items-center justify-center text-gray-600 text-xs flex-shrink-0">
          —
        </div>
      )}
      <div className="flex-1 min-w-0">
        <div className="font-semibold text-sm leading-tight line-clamp-2">
          {p.article_titre ?? "Article sans titre"}
        </div>
        <div className="text-xs text-gray-400 mt-1 flex items-center gap-1">
          <FaUser className="text-[10px]" />
          {p.conversation_url ? (
            <a
              href={p.conversation_url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-400 hover:underline"
            >
              {p.acheteur_username ?? "?"}
            </a>
          ) : (
            <span>{p.acheteur_username ?? "?"}</span>
          )}
        </div>
        <div className="text-xs text-gray-500 mt-1">{formatDate(sale.eventDate)}</div>

        {hasContact && (
          <div className="mt-3 pt-3 border-t border-[#2c3048] space-y-1.5">
            {p.nom && (
              <CopyableField
                label="le nom"
                value={p.nom}
                icon={<FaUser className="text-[10px]" />}
              />
            )}
            {fullAddress && (
              <CopyableField
                label="l'adresse"
                value={fullAddress}
                icon={<FaMapMarkerAlt className="text-[10px]" />}
              />
            )}
            {p.acheteur_email && (
              <CopyableField
                label="l'email"
                value={p.acheteur_email}
                icon={<FaEnvelope className="text-[10px]" />}
              />
            )}
          </div>
        )}

        <div className="mt-3 flex items-center gap-2">
          <button
            type="button"
            onClick={handlePrintBordereau}
            disabled={bordereauLoading !== "none"}
            className="cursor-pointer inline-flex items-center gap-2 text-sm font-medium px-3.5 py-2 rounded-md bg-blue-600 text-white hover:bg-blue-700 active:bg-blue-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
            aria-label="Imprimer le bordereau d'envoi"
          >
            <FaPrint className="text-sm" />
            {bordereauLoading === "print" ? "Préparation…" : "Imprimer"}
          </button>
          <button
            type="button"
            onClick={handleDownloadBordereau}
            disabled={bordereauLoading !== "none"}
            className="cursor-pointer inline-flex items-center justify-center w-9 h-9 rounded-md text-gray-400 hover:text-blue-300 hover:bg-blue-600/15 transition-colors disabled:opacity-50 disabled:cursor-not-allowed border border-[#2c3048]"
            aria-label="Télécharger le bordereau d'envoi"
            title="Télécharger le PDF"
          >
            <FaFileDownload className="text-sm" />
          </button>
        </div>
        {bordereauError && (
          <div className="text-xs text-red-400 mt-1">{bordereauError}</div>
        )}
      </div>
      <div className="text-right flex-shrink-0">
        <div className="text-lg font-bold text-green-400">
          {p.prix_vente !== undefined ? formatEur(p.prix_vente) : "—"}
        </div>
      </div>
    </div>
  );
};

export default VintedVentesPage;
