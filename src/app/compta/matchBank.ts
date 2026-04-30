// Matching entre les lignes bancaires SG (parseSGCsv) et les events Vinted en DDB.
// Stratégie : amount exact (±0.01€) + date proximité (±3j). Pas de REF Mangopay disponible
// dans les mails Vinted donc on n'a pas de clé infaillible — on accepte que certaines lignes
// soient "ambiguës" et seront cherry-pickées à la main par Coralie.

import type { VintedEvent } from "@/lib/api";
import type { BankLine, BankLineKind } from "./parseSGCsv";

const AMOUNT_TOLERANCE = 0.01; // 1 centime de marge sur les arrondis
// Fenêtre directionnelle : la banque traite TOUJOURS après ou en même temps que l'event
// Vinted (achat → débit, refund mail → crédit, transfert mail → virement reçu). Donc
// bank.date >= event.date. Le -1 tolère le décalage TZ "heure Paris labellisée UTC" qui
// peut faire apparaître un eventDate quelques heures "après" la date bancaire UTC.
const DATE_MIN_DIFF_DAYS = -1;   // event peut être au plus 1j "dans le futur" du bank (tolérance TZ)
const DATE_MAX_DIFF_DAYS = 3;    // bank peut être au plus 3j après l'event (délai traitement)

export type MatchedEventCandidate = {
  event: VintedEvent;
  /** Type métier dérivé de l'eventType pour aider la secrétaire à comprendre. */
  category: "achat" | "boost" | "vitrine" | "transfert" | "refund";
  /** Montant DDB utilisé pour matcher (potentiellement la part CB d'un paiement mixte,
   *  pas forcément le montant_total). */
  amount: number;
};

export type BankMatchResult = {
  bankLine: BankLine;
  candidates: MatchedEventCandidate[];
  /** "sure" = 1 candidat unique, "ambigu" = plusieurs, "none" = aucun. */
  status: "sure" | "ambigu" | "none";
};

// Diff signé bankDate - eventDate en jours. Positif = bank après event (cas normal).
// Négatif = bank avant event (anormal pour un débit, on rejette).
const signedDayDiff = (bankDate: string, eventDate: string): number => {
  const db = new Date(bankDate).getTime();
  const de = new Date(eventDate).getTime();
  return (db - de) / 86400_000;
};

const eventCategory = (e: VintedEvent): MatchedEventCandidate["category"] | null => {
  switch (e.eventType) {
    case "achat": return "achat";
    case "boost": return "boost";
    case "vitrine": return "vitrine";
    case "transfert": return "transfert";
    case "refund": return "refund";
    default: return null;
  }
};

// Calcule le montant comparable à la ligne bancaire pour cet event.
// Subtilité importante pour les achats : en paiement mixte (wallet + CB),
// `montant_total` = total de la commande mais la banque ne voit que la part CB.
// On extrait alors le montant entre parenthèses après le numéro de carte.
// Retourne `undefined` si l'event n'est pas matchable contre cette ligne bancaire
// (ex. boost réglé 100% wallet → aucune trace bancaire).
function matchableAmount(event: VintedEvent, bankKind: BankLineKind): number | undefined {
  const p = event.payload as {
    montant_total?: number;
    montant?: number;
    mode_paiement?: string;
    moyen_paiement?: string;
  };

  if (bankKind === "vinted_transfert") {
    return typeof p.montant === "number" ? p.montant : undefined;
  }

  if (bankKind === "vinted_refund_cb") {
    return typeof p.montant === "number" ? p.montant : undefined;
  }

  if (bankKind === "vinted_achat_cb") {
    if (event.eventType === "achat") {
      // Paiement mixte : "Porte-monnaie Vinted (6,78€), Visa **********5365 (50,28€)"
      // → la part CB est dans les parens après les ****1234. C'est ce qui apparaît en
      //   débit bancaire, pas le montant_total.
      const mp = p.mode_paiement;
      const cbParen = mp?.match(/\*+\s*\d{4}\s*\(([\d,.]+)\s*€\)/);
      if (cbParen) {
        const n = parseFloat(cbParen[1].replace(",", "."));
        if (Number.isFinite(n)) return n;
      }
      // Si pas de parens CB → soit paiement 100% wallet (pas de trace banque, on retourne
      // undefined pour ne pas matcher), soit format inconnu (on tente montant_total).
      if (mp && /porte\s*-?\s*monnaie/i.test(mp) && !/\*+\s*\d{4}/.test(mp)) {
        return undefined; // wallet pur → aucune trace bancaire à matcher
      }
      return typeof p.montant_total === "number" ? p.montant_total : undefined;
    }

    // Pour boost/vitrine : on ne match que si payé en CB (ou si moyen inconnu).
    // Wallet pur → pas de débit bancaire associé, skip.
    if (event.eventType === "boost" || event.eventType === "vitrine") {
      const mp = p.moyen_paiement || "";
      if (/porte\s*-?\s*monnaie/i.test(mp) && !/carte/i.test(mp)) return undefined;
      return typeof p.montant_total === "number" ? p.montant_total : undefined;
    }
  }

  return undefined;
}

// Filtre les events selon le kind de la ligne bancaire (achat CB ne match pas un transfert).
function eligibleEvents(line: BankLine, allEvents: VintedEvent[]): VintedEvent[] {
  switch (line.kind) {
    case "vinted_transfert":
      return allEvents.filter(e => e.eventType === "transfert");
    case "vinted_achat_cb":
      // CB Débit → achat, boost ou vitrine (les 3 catégories peuvent être réglées en CB)
      return allEvents.filter(e =>
        e.eventType === "achat" || e.eventType === "boost" || e.eventType === "vitrine"
      );
    case "vinted_refund_cb":
      // Annulation côté acheteur uniquement
      return allEvents.filter(e =>
        e.eventType === "refund" &&
        (e.payload as { is_sunset_acheteur?: boolean })?.is_sunset_acheteur === true
      );
    default:
      return [];
  }
}

export function matchBankLines(
  bankLines: BankLine[],
  allEvents: VintedEvent[],
  /** IDs déjà liés à une autre ligne bancaire (par cherry-pick côté UI). On les ajoute
   *  au set "consumed" en amont pour que ces events n'apparaissent plus comme candidats
   *  des autres lignes ambigus — évite de lier 2 fois la même dépense réelle. */
  alreadyLinkedIds: Set<string> = new Set()
): BankMatchResult[] {
  const results: BankMatchResult[] = [];

  // Greedy matching : on consomme chaque event au fur et à mesure pour éviter qu'il
  // soit candidat de plusieurs lignes bancaires identiques (ex. 2 achats à 56,45€ →
  // 2 lignes bancaires distinctes, chacune doit pointer vers UN event différent).
  const consumed = new Set<string>(alreadyLinkedIds);

  for (const line of bankLines) {
    if (line.kind === "ignored") continue;

    const targetAmount = Math.abs(line.amount);
    const eligible = eligibleEvents(line, allEvents);
    const candidates: MatchedEventCandidate[] = [];
    for (const e of eligible) {
      if (consumed.has(e.gmailMessageId)) continue;
      const amt = matchableAmount(e, line.kind);
      if (amt === undefined) continue;
      if (Math.abs(amt - targetAmount) > AMOUNT_TOLERANCE) continue;
      const diff = signedDayDiff(line.date, e.eventDate);
      if (diff < DATE_MIN_DIFF_DAYS || diff > DATE_MAX_DIFF_DAYS) continue;
      const cat = eventCategory(e);
      if (!cat) continue;
      candidates.push({ event: e, category: cat, amount: amt });
    }

    let status: BankMatchResult["status"];
    if (candidates.length === 0) status = "none";
    else if (candidates.length === 1) {
      status = "sure";
      consumed.add(candidates[0].event.gmailMessageId);
    } else {
      status = "ambigu";
    }

    results.push({ bankLine: line, candidates, status });
  }

  return results;
}

// Synthèse pour les compteurs de l'UI
export function summarize(results: BankMatchResult[]) {
  let sure = 0, ambigu = 0, none = 0;
  for (const r of results) {
    if (r.status === "sure") sure++;
    else if (r.status === "ambigu") ambigu++;
    else none++;
  }
  return { sure, ambigu, none, total: results.length };
}
