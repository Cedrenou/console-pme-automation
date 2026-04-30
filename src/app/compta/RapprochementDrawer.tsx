"use client";
import React, { useEffect, useMemo, useState } from "react";
import {
  fetchVintedEvents, setVintedEventValidated,
  type VintedEvent
} from "@/lib/api";
import {
  FaTimes, FaUpload, FaCheckCircle, FaExclamationTriangle, FaQuestionCircle,
  FaCheck, FaSpinner, FaChevronDown, FaChevronRight
} from "react-icons/fa";
import { parseSGCsv, type BankLine } from "./parseSGCsv";
import { matchBankLines, summarize, type BankMatchResult, type MatchedEventCandidate } from "./matchBank";
import { monthToDates, formatEur, formatDateOnly } from "./utils";

type Props = {
  month: string;
  onClose: () => void;
  /** Appelé après chaque vague de validations réussies pour que la page parent rafraîchisse
   *  ses onglets (sinon les checkboxes apparaissent toujours non cochées tant qu'on ne
   *  recharge pas la page). */
  onValidationsApplied?: () => void;
};

const PAGE_SIZE = 200;
const EVENT_TYPES = ["achat", "boost", "vitrine", "refund", "transfert"] as const;
// Fenêtre de matching dans matchBank.ts = ±3j. On élargit le fetch d'autant pour couvrir
// les bordures du mois (un débit du 1er avril peut matcher un mail Vinted du 30 mars).
// 5j de marge pour absorber aussi le décalage TZ "heure Paris labellisée UTC" des eventDate.
const FETCH_BUFFER_DAYS = 5;

export const RapprochementDrawer: React.FC<Props> = ({ month, onClose, onValidationsApplied }) => {
  const [bankLines, setBankLines] = useState<BankLine[] | null>(null);
  const [events, setEvents] = useState<VintedEvent[]>([]);
  const [loadingEvents, setLoadingEvents] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const [filename, setFilename] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [validating, setValidating] = useState(false);
  // Choix manuels sur les ambigus : map(idx ligne bancaire → gmailMessageId choisi)
  const [picks, setPicks] = useState<Map<number, string>>(new Map());
  // Tracé des events validés en base par cette session — pour griser les rows immédiatement
  const [appliedIds, setAppliedIds] = useState<Set<string>>(new Set());
  // Pour chaque ligne ambigu résolue manuellement, on note le gmailMessageId choisi.
  // Le rendu affiche alors "Lié à X · Vérifié" au lieu de la liste de cards. C'est utile
  // parce que le matching se recalcule avec appliedIds en consumedSet, donc la liste des
  // candidats peut perdre le pick — on a besoin de mémoriser le choix séparément.
  const [resolvedPicks, setResolvedPicks] = useState<Map<number, string>>(new Map());
  const [feedback, setFeedback] = useState<{ kind: "ok" | "ko"; msg: string } | null>(null);
  // État d'ouverture par panneau (accordéon). Le panneau "sûrs" se replie
  // automatiquement après le bulk validate pour libérer la vue sur les ambigus.
  const [openPanels, setOpenPanels] = useState({ sure: true, ambigu: true, none: true });
  const togglePanel = (key: keyof typeof openPanels) =>
    setOpenPanels(prev => ({ ...prev, [key]: !prev[key] }));

  // Charge tous les events du mois dès l'ouverture (en parallèle pour aller vite)
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoadingEvents(true);
      try {
        const { from, to } = monthToDates(month);
        // Fenêtre élargie : on récupère les events du mois ± FETCH_BUFFER_DAYS jours pour
        // que la fenêtre de matching de ±3j fonctionne correctement aux bordures (un mail
        // Vinted du 30 mars peut matcher un débit bancaire du 1er avril).
        const fetchFrom = new Date(new Date(from).getTime() - FETCH_BUFFER_DAYS * 86400_000).toISOString();
        const fetchTo = new Date(new Date(to).getTime() + FETCH_BUFFER_DAYS * 86400_000).toISOString();
        const all: VintedEvent[] = [];
        for (const type of EVENT_TYPES) {
          let cursor: string | null = null;
          do {
            const res = await fetchVintedEvents({ type, from: fetchFrom, to: fetchTo, limit: PAGE_SIZE, cursor: cursor ?? undefined });
            if (cancelled) return;
            all.push(...res.items);
            cursor = res.nextCursor;
          } while (cursor);
        }
        if (!cancelled) setEvents(all);
      } finally {
        if (!cancelled) setLoadingEvents(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [month]);

  const handleFile = async (file: File) => {
    setParseError(null);
    setFilename(file.name);
    try {
      const text = await file.text();
      const parsed = parseSGCsv(text);
      setBankLines(parsed);
      setPicks(new Map());
      setResolvedPicks(new Map());
      setFeedback(null);
    } catch (err) {
      setParseError(err instanceof Error ? err.message : String(err));
      setBankLines(null);
    }
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(file);
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  };

  const matches = useMemo(() => {
    if (!bankLines) return [];
    // appliedIds = events déjà liés à une ligne (par cherry-pick ou bulk validate). On
    // les exclut pour que les autres ambigus voient leurs candidats filtrés en live —
    // empêche de lier 2 fois le même event quand plusieurs achats ont le même montant.
    return matchBankLines(bankLines, events, appliedIds);
  }, [bankLines, events, appliedIds]);

  const matchesWithIndex = useMemo(() => matches.map((m, i) => ({ ...m, idx: i })), [matches]);

  const sureMatches = useMemo(() => matchesWithIndex.filter(m => m.status === "sure"), [matchesWithIndex]);
  const ambiguMatches = useMemo(() => matchesWithIndex.filter(m => m.status === "ambigu"), [matchesWithIndex]);
  const noMatches = useMemo(() => matchesWithIndex.filter(m => m.status === "none"), [matchesWithIndex]);

  const stats = useMemo(() => summarize(matches), [matches]);

  // Compte les events sûrs pas encore validés en base ni dans cette session
  const sureNotYetValidated = useMemo(
    () => sureMatches.filter(m => !m.candidates[0].event.validated_at && !appliedIds.has(m.candidates[0].event.gmailMessageId)),
    [sureMatches, appliedIds]
  );

  const validateBatch = async (eventsToValidate: VintedEvent[]) => {
    if (eventsToValidate.length === 0 || validating) return;
    setValidating(true);
    setFeedback(null);
    let okCount = 0;
    const failed: string[] = [];
    try {
      const pool = 5;
      for (let i = 0; i < eventsToValidate.length; i += pool) {
        const batch = eventsToValidate.slice(i, i + pool);
        const results = await Promise.allSettled(batch.map(e =>
          setVintedEventValidated(e.gmailMessageId, true)
        ));
        results.forEach((r, idx) => {
          if (r.status === "fulfilled") okCount++;
          else { failed.push(batch[idx].gmailMessageId); console.error(`Validation échouée pour ${batch[idx].gmailMessageId}`, r.reason); }
        });
      }
      const successIds = new Set(eventsToValidate.map(e => e.gmailMessageId).filter(id => !failed.includes(id)));
      if (successIds.size > 0) {
        setAppliedIds(prev => {
          const next = new Set(prev);
          successIds.forEach(id => next.add(id));
          return next;
        });
        onValidationsApplied?.();
      }
      if (failed.length === 0) {
        setFeedback({ kind: "ok", msg: `${okCount} event${okCount > 1 ? "s" : ""} validé${okCount > 1 ? "s" : ""} en base. Les onglets compta seront rafraîchis à la fermeture.` });
      } else {
        setFeedback({ kind: "ko", msg: `${okCount} validé${okCount > 1 ? "s" : ""}, ${failed.length} échec${failed.length > 1 ? "s" : ""}. Voir la console pour le détail.` });
      }
    } finally {
      setValidating(false);
    }
  };

  const handleValidateAllSure = async () => {
    await validateBatch(sureNotYetValidated.map(m => m.candidates[0].event));
    // Une fois la grosse vague de validations passée, on replie le panneau "sûrs" pour
    // que la secrétaire voit tout de suite les ambigus / non trouvés sans scroller.
    setOpenPanels(prev => ({ ...prev, sure: false }));
  };

  const handleValidateAmbigu = async (idx: number) => {
    const pick = picks.get(idx);
    if (!pick) return;
    const evt = events.find(e => e.gmailMessageId === pick);
    if (!evt) return;
    await validateBatch([evt]);
    // On mémorise le choix résolu pour cette ligne afin que l'UI affiche un état "Lié à X"
    // même après que le matching ait re-tourné (qui retire X des candidats).
    setResolvedPicks(prev => new Map(prev).set(idx, pick));
    setPicks(prev => {
      const next = new Map(prev);
      next.delete(idx);
      return next;
    });
  };

  // Fermeture sur Escape
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [onClose]);

  return (
    <>
      <div onClick={onClose} className="fixed inset-0 bg-black/60 z-40" aria-hidden="true" />
      <aside
        role="dialog"
        aria-label="Rapprochement bancaire"
        className="fixed top-0 right-0 bottom-0 w-full md:w-[900px] bg-[#1c1f2e] border-l border-[#2c3048] z-50 overflow-y-auto shadow-2xl"
      >
        <div className="sticky top-0 bg-[#1c1f2e] border-b border-[#2c3048] p-5 flex items-start justify-between gap-3 z-10">
          <div>
            <h2 className="text-xl font-bold mb-1">Rapprochement bancaire</h2>
            <p className="text-sm text-gray-400">
              Importe le CSV SG du mois. Les lignes Vinted sont matchées par montant ± date (3j).
              Les matchs uniques peuvent être validés en masse, les ambigus restent à choisir manuellement.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fermer"
            className="cursor-pointer p-2 rounded-md text-gray-400 hover:text-white hover:bg-[#2c3048] transition-colors flex-shrink-0"
          >
            <FaTimes />
          </button>
        </div>

        <div className="p-5 space-y-5">
          {feedback && (
            <div className={`rounded-lg p-3 text-sm ${
              feedback.kind === "ok"
                ? "bg-emerald-600/20 border border-emerald-500/40 text-emerald-200"
                : "bg-red-600/20 border border-red-500/40 text-red-200"
            }`}>
              {feedback.msg}
            </div>
          )}

          {/* Drop zone */}
          {!bankLines && (
            <div
              onDrop={handleDrop}
              onDragOver={e => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              className={`border-2 border-dashed rounded-xl p-10 text-center transition-colors ${
                dragOver ? "border-blue-400 bg-blue-500/10" : "border-[#2c3048] bg-[#23263A]"
              }`}
            >
              <FaUpload className="text-4xl text-gray-500 mx-auto mb-3" />
              <p className="text-gray-300 mb-3">Glisse-dépose le CSV Société Générale ici</p>
              <p className="text-xs text-gray-500 mb-4">ou</p>
              <label className="inline-block cursor-pointer px-5 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-semibold text-sm transition-colors">
                Choisir un fichier
                <input
                  type="file"
                  accept=".csv,text/csv"
                  onChange={handleFileInput}
                  className="hidden"
                />
              </label>
              {parseError && (
                <div className="mt-4 text-red-400 text-sm">{parseError}</div>
              )}
            </div>
          )}

          {/* Résultats */}
          {bankLines && (
            <>
              <div className="bg-[#23263A] rounded-xl p-4 flex flex-wrap items-center gap-4">
                <div className="flex items-center gap-2 text-sm">
                  <span className="text-gray-400">Fichier :</span>
                  <span className="font-semibold">{filename}</span>
                  <button
                    type="button"
                    onClick={() => { setBankLines(null); setFilename(null); setPicks(new Map()); setResolvedPicks(new Map()); setFeedback(null); }}
                    className="cursor-pointer text-xs text-blue-400 hover:underline ml-2"
                  >
                    Changer
                  </button>
                </div>
                {loadingEvents && (
                  <span className="text-xs text-gray-400 flex items-center gap-1">
                    <FaSpinner className="animate-spin" /> Chargement events DDB…
                  </span>
                )}
                <div className="ml-auto flex items-center gap-3 text-sm">
                  <Stat icon={<FaCheckCircle className="text-emerald-400" />} label="Sûrs" value={stats.sure} />
                  <Stat icon={<FaQuestionCircle className="text-amber-400" />} label="Ambigus" value={stats.ambigu} />
                  <Stat icon={<FaExclamationTriangle className="text-red-400" />} label="Non trouvés" value={stats.none} />
                </div>
              </div>

              {/* Panneau : matchs sûrs */}
              <Panel
                title="Matchs sûrs"
                icon={<FaCheckCircle className="text-emerald-400" />}
                count={sureMatches.length}
                accent="border-emerald-500/40"
                open={openPanels.sure}
                onToggle={() => togglePanel("sure")}
                action={
                  sureNotYetValidated.length > 0 ? (
                    <button
                      type="button"
                      onClick={handleValidateAllSure}
                      disabled={validating}
                      className="cursor-pointer inline-flex items-center gap-2 px-4 py-2 rounded-lg font-semibold text-sm bg-emerald-600 hover:bg-emerald-700 text-white disabled:opacity-50"
                    >
                      <FaCheck className="text-sm" />
                      Cocher Vérifié sur les {sureNotYetValidated.length} restant{sureNotYetValidated.length > 1 ? "s" : ""}
                    </button>
                  ) : null
                }
              >
                {sureMatches.map(m => (
                  <BankRow key={m.idx} match={m} appliedIds={appliedIds} />
                ))}
              </Panel>

              {/* Panneau : ambigus avec cherry-pick */}
              {ambiguMatches.length > 0 && (
                <Panel
                  title="Ambigus — choisir le bon event"
                  icon={<FaQuestionCircle className="text-amber-400" />}
                  count={ambiguMatches.length}
                  accent="border-amber-500/40"
                  open={openPanels.ambigu}
                  onToggle={() => togglePanel("ambigu")}
                >
                  {ambiguMatches.map(m => (
                    <BankRow
                      key={m.idx}
                      match={m}
                      appliedIds={appliedIds}
                      pick={picks.get(m.idx)}
                      resolvedEventId={resolvedPicks.get(m.idx)}
                      resolvedEvent={
                        resolvedPicks.get(m.idx)
                          ? events.find(e => e.gmailMessageId === resolvedPicks.get(m.idx))
                          : undefined
                      }
                      onPickChange={(messageId) => {
                        setPicks(prev => {
                          const next = new Map(prev);
                          if (messageId) next.set(m.idx, messageId);
                          else next.delete(m.idx);
                          return next;
                        });
                      }}
                      onValidatePick={() => handleValidateAmbigu(m.idx)}
                    />
                  ))}
                </Panel>
              )}

              {/* Panneau : non trouvés */}
              {noMatches.length > 0 && (
                <Panel
                  title="Non trouvés en base"
                  icon={<FaExclamationTriangle className="text-red-400" />}
                  count={noMatches.length}
                  accent="border-red-500/40"
                  open={openPanels.none}
                  onToggle={() => togglePanel("none")}
                  hint="Soit un mail Vinted manqué (relancer l'ingestion), soit une dépense légitime non Vinted, soit un débit suspect à investiguer."
                >
                  {noMatches.map(m => (
                    <BankRow key={m.idx} match={m} appliedIds={appliedIds} />
                  ))}
                </Panel>
              )}
            </>
          )}
        </div>
      </aside>
    </>
  );
};

const Stat: React.FC<{ icon: React.ReactNode; label: string; value: number }> = ({ icon, label, value }) => (
  <div className="flex items-center gap-1.5 px-3 py-1 rounded-md bg-[#1c1f2e]">
    {icon}
    <span className="text-xs text-gray-400 uppercase tracking-wider">{label}</span>
    <span className="font-bold tabular-nums">{value}</span>
  </div>
);

const Panel: React.FC<{
  title: string;
  icon: React.ReactNode;
  count: number;
  accent: string;
  open: boolean;
  onToggle: () => void;
  action?: React.ReactNode;
  hint?: string;
  children: React.ReactNode;
}> = ({ title, icon, count, accent, open, onToggle, action, hint, children }) => {
  if (count === 0) return null;
  return (
    <div className={`bg-[#23263A] rounded-xl border ${accent} overflow-hidden`}>
      <div className="border-b border-[#2c3048] flex items-center justify-between gap-3 flex-wrap">
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          className="cursor-pointer flex items-center gap-2 px-4 py-3 flex-1 text-left hover:bg-[#1c1f2e]/40 transition-colors"
        >
          {open ? <FaChevronDown className="text-xs text-gray-400" /> : <FaChevronRight className="text-xs text-gray-400" />}
          {icon}
          <h3 className="font-bold text-sm">{title}</h3>
          <span className="text-xs text-gray-500">({count})</span>
        </button>
        {action && <div className="px-4 py-2">{action}</div>}
      </div>
      {open && (
        <>
          {hint && <div className="px-4 py-2 text-xs text-gray-500 italic border-b border-[#2c3048]">{hint}</div>}
          <div className="divide-y divide-[#2c3048]">{children}</div>
        </>
      )}
    </div>
  );
};

const KIND_LABEL: Record<BankLine["kind"], string> = {
  vinted_transfert: "Virement Mangopay",
  vinted_achat_cb: "CB Vinted",
  vinted_refund_cb: "Remboursement CB",
  ignored: "Ignoré"
};

const KIND_COLOR: Record<BankLine["kind"], string> = {
  vinted_transfert: "text-emerald-300 bg-emerald-600/20",
  vinted_achat_cb: "text-blue-300 bg-blue-600/20",
  vinted_refund_cb: "text-red-300 bg-red-600/20",
  ignored: "text-gray-500 bg-gray-500/20"
};

const CATEGORY_LABEL: Record<MatchedEventCandidate["category"], string> = {
  achat: "Achat",
  boost: "Boost",
  vitrine: "Vitrine",
  transfert: "Transfert",
  refund: "Remboursement"
};

const CATEGORY_COLOR: Record<MatchedEventCandidate["category"], string> = {
  achat: "bg-blue-600/30 text-blue-200",
  boost: "bg-amber-600/30 text-amber-200",
  vitrine: "bg-purple-600/30 text-purple-200",
  transfert: "bg-emerald-600/30 text-emerald-200",
  refund: "bg-red-600/30 text-red-200"
};

const eventCategoryFromType = (t: VintedEvent["eventType"]): MatchedEventCandidate["category"] | null => {
  switch (t) {
    case "achat": return "achat";
    case "boost": return "boost";
    case "vitrine": return "vitrine";
    case "transfert": return "transfert";
    case "refund": return "refund";
    default: return null;
  }
};

const BankRow: React.FC<{
  match: BankMatchResult;
  appliedIds: Set<string>;
  pick?: string;
  resolvedEventId?: string;
  resolvedEvent?: VintedEvent;
  onPickChange?: (messageId: string) => void;
  onValidatePick?: () => void;
}> = ({ match, appliedIds, pick, resolvedEventId, resolvedEvent, onPickChange, onValidatePick }) => {
  const { bankLine, candidates, status } = match;
  const sureEvent = status === "sure" ? candidates[0].event : null;
  const sureValidated = sureEvent ? (Boolean(sureEvent.validated_at) || appliedIds.has(sureEvent.gmailMessageId)) : false;
  const resolvedCategory = resolvedEvent ? eventCategoryFromType(resolvedEvent.eventType) : null;

  return (
    <div className="px-4 py-3 hover:bg-[#1c1f2e]/40">
      <div className="grid grid-cols-1 md:grid-cols-[1fr_auto_1fr] gap-3 items-center">
        {/* Bank line */}
        <div className="min-w-0">
          <div className="text-xs text-gray-500 mb-1 flex items-center gap-2">
            <span>{bankLine.date}</span>
            <span className={`px-1.5 py-0.5 rounded text-[10px] uppercase tracking-wider font-semibold ${KIND_COLOR[bankLine.kind]}`}>
              {KIND_LABEL[bankLine.kind]}
            </span>
          </div>
          <div className="text-sm truncate" title={bankLine.label}>{bankLine.label}</div>
          <div className={`text-base font-bold tabular-nums ${bankLine.amount >= 0 ? "text-emerald-400" : "text-red-400"}`}>
            {bankLine.amount >= 0 ? "+" : ""}{formatEur(bankLine.amount)}
          </div>
        </div>

        {/* Arrow / status */}
        <div className="text-2xl text-gray-500 text-center px-2 hidden md:block">→</div>

        {/* Vinted side */}
        <div className="min-w-0">
          {status === "sure" && sureEvent && (
            <div className={`flex items-center gap-3 ${sureValidated ? "opacity-60" : ""}`}>
              <div className="flex-1 min-w-0">
                <div className="text-xs text-gray-500 mb-1 flex items-center gap-2">
                  <span>{formatDateOnly(sureEvent.eventDate)}</span>
                  <span className={`px-1.5 py-0.5 rounded text-[10px] uppercase tracking-wider font-semibold ${CATEGORY_COLOR[candidates[0].category]}`}>
                    {CATEGORY_LABEL[candidates[0].category]}
                  </span>
                  {sureValidated && (
                    <span className="text-emerald-400 inline-flex items-center gap-1">
                      <FaCheck className="text-[10px]" /> Vérifié
                    </span>
                  )}
                </div>
                <EventLabel event={sureEvent} />
                <div className="text-base font-bold tabular-nums text-gray-200">
                  {formatEur(candidates[0].amount)}
                </div>
              </div>
            </div>
          )}

          {status === "ambigu" && resolvedEventId && resolvedEvent && resolvedCategory && (
            <div className="opacity-70">
              <div className="text-xs text-gray-500 mb-1 flex items-center gap-2">
                <span>{formatDateOnly(resolvedEvent.eventDate)}</span>
                <span className={`px-1.5 py-0.5 rounded text-[10px] uppercase tracking-wider font-semibold ${CATEGORY_COLOR[resolvedCategory]}`}>
                  {CATEGORY_LABEL[resolvedCategory]}
                </span>
                <span className="text-emerald-400 inline-flex items-center gap-1">
                  <FaCheck className="text-[10px]" /> Lié et vérifié
                </span>
              </div>
              <EventLabel event={resolvedEvent} />
            </div>
          )}

          {status === "ambigu" && !resolvedEventId && (
            <div>
              <div className="text-xs text-gray-400 mb-2">{candidates.length} candidats — choisir :</div>
              <div className="space-y-1.5">
                {candidates.map(c => {
                  const isSelected = pick === c.event.gmailMessageId;
                  return (
                    <button
                      key={c.event.gmailMessageId}
                      type="button"
                      onClick={() => onPickChange?.(isSelected ? "" : c.event.gmailMessageId)}
                      aria-pressed={isSelected}
                      className={`cursor-pointer w-full text-left px-3 py-2 rounded-md border transition-colors flex items-center gap-3 ${
                        isSelected
                          ? "border-blue-400 bg-blue-500/10"
                          : "border-[#2c3048] bg-[#1c1f2e] hover:border-[#3c4060] hover:bg-[#1c1f2e]/80"
                      }`}
                    >
                      <span
                        className={`w-3.5 h-3.5 rounded-full border flex-shrink-0 flex items-center justify-center ${
                          isSelected ? "border-blue-400 bg-blue-500" : "border-gray-500"
                        }`}
                      >
                        {isSelected && <span className="w-1.5 h-1.5 rounded-full bg-white" />}
                      </span>
                      <span className={`px-1.5 py-0.5 rounded text-[10px] uppercase tracking-wider font-semibold flex-shrink-0 ${CATEGORY_COLOR[c.category]}`}>
                        {CATEGORY_LABEL[c.category]}
                      </span>
                      <span className="text-xs text-gray-400 tabular-nums flex-shrink-0">{formatDateOnly(c.event.eventDate)}</span>
                      <span className="text-sm font-bold tabular-nums text-gray-100 flex-shrink-0">{formatEur(c.amount)}</span>
                      <span className="text-xs text-gray-400 truncate flex-1" title={eventTitle(c.event)}>{eventTitle(c.event)}</span>
                    </button>
                  );
                })}
              </div>
              {pick && (
                <button
                  type="button"
                  onClick={onValidatePick}
                  className="cursor-pointer mt-2 inline-flex items-center gap-2 px-3 py-1.5 rounded text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white"
                >
                  <FaCheck className="text-[11px]" />
                  Lier et valider
                </button>
              )}
            </div>
          )}

          {status === "none" && (
            <div className="text-sm text-red-300/80 italic">Aucun event Vinted correspondant trouvé pour ce mois.</div>
          )}
        </div>
      </div>
    </div>
  );
};

const eventTitle = (e: VintedEvent): string => {
  const p = e.payload as { article?: string; commande?: string; article_titre?: string; beneficiaire?: string };
  return p.article || p.commande || p.article_titre || p.beneficiaire || e.gmailMessageId;
};

const EventLabel: React.FC<{ event: VintedEvent }> = ({ event }) => {
  const t = eventTitle(event);
  return <div className="text-sm truncate text-gray-300" title={t}>{t}</div>;
};
