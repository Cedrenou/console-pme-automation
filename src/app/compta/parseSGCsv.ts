// Parser du CSV Société Générale exporté depuis l'espace pro.
//
// Format :
// - 4-5 lignes d'entête (titre du compte, IBAN, solde) → on les ignore
// - 1 ligne vide
// - Header : Date;Nature de l'opération;Débit;Crédit;Devise;Date de valeur;Libellé interbancaire
// - Puis 1 transaction = 1 ligne principale + N lignes de continuation où Date est vide
//   et seule la colonne 2 (Nature) contient des infos additionnelles (DE: Mangopay, MOTIF, REF, …)
//
// On regroupe les continuations dans `details[]` puis on classifie chaque transaction selon
// sa pertinence Vinted : transfert (Mangopay), achat CB, refund CB, ou ignored.

export type BankLineKind =
  | "vinted_transfert"   // VIR RECU Mangopay MOTIF: Vinted → entrée d'argent (vente)
  | "vinted_achat_cb"    // CARTE X5365 DD/MM MGP*Vinted (Débit) → achat / boost / vitrine sur CB
  | "vinted_refund_cb"   // CARTE X5365 REMBT DD/MM MGP*Vinted (Crédit) → annulation achat
  | "ignored";           // Stripe, PayPal, Facebook, prélèvements, etc.

export type BankLine = {
  /** Date de l'opération réelle (DD/MM/YYYY parsée en ISO date YYYY-MM-DD).
   *  Pour les CB, on prend la date dans le libellé (DD/MM) plutôt que la date
   *  d'enregistrement bancaire qui peut être 1-2 jours après. */
  date: string;
  /** Libellé principal (colonne 2). */
  label: string;
  /** Montant signé : positif pour crédit, négatif pour débit. */
  amount: number;
  /** Toutes les lignes de continuation concaténées en un seul string pour la recherche. */
  details: string;
  /** Libellé interbancaire (colonne 7) : "FACTURES CARTES PAYEES", "AUTRES VIREMENTS RECUS", … */
  category: string;
  /** Notre classification métier. */
  kind: BankLineKind;
};

const EXPECTED_HEADER = "Date;Nature de l'opération";

// Découpe une ligne CSV "a;b;\"c;d\";e" en respectant les guillemets.
function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      // "" dans une chaîne quotée = un guillemet littéral
      if (inQuotes && line[i + 1] === '"') { cur += '"'; i++; continue; }
      inQuotes = !inQuotes;
      continue;
    }
    if (c === ";" && !inQuotes) { out.push(cur); cur = ""; continue; }
    cur += c;
  }
  out.push(cur);
  return out;
}

const parseFrAmount = (s: string): number => {
  if (!s) return 0;
  const cleaned = s.replace(/[\s ]/g, "").replace(",", ".");
  const n = parseFloat(cleaned);
  return Number.isFinite(n) ? n : 0;
};

// "DD/MM/YYYY" → "YYYY-MM-DD"
const reformatDate = (ddmmyyyy: string): string => {
  const m = ddmmyyyy.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (!m) return ddmmyyyy;
  return `${m[3]}-${m[2]}-${m[1]}`;
};

// Pour un libellé "CARTE X5365 06/04 MGP*Vinted Purchase" et une opération bank du 07/04/2025,
// reconstruit la date d'opération réelle avec l'année du contexte bancaire.
const labelOperationDate = (label: string, bankDate: string): string | null => {
  const m = label.match(/CARTE X\d+\s+(?:REMBT\s+)?(\d{2})\/(\d{2})\b/);
  if (!m) return null;
  const yearMatch = bankDate.match(/^(\d{4})/);
  const year = yearMatch ? yearMatch[1] : new Date().getFullYear().toString();
  return `${year}-${m[2]}-${m[1]}`;
};

function classify(label: string, details: string, amount: number, category: string): BankLineKind {
  // Mangopay virement entrant avec MOTIF Vinted → transfert
  if (/MOTIF:\s*Vinted/i.test(details) && /DE:\s*Mangopay/i.test(details) && amount > 0) {
    return "vinted_transfert";
  }
  // CB Vinted REMBT (annulation achat) — Crédit
  if (/CARTE\s+X\d+\s+REMBT\s+\d{2}\/\d{2}\s+MGP\*Vinted/i.test(label) && amount > 0) {
    return "vinted_refund_cb";
  }
  // CB Vinted (achat ou boost ou vitrine) — Débit (vérifier APRÈS REMBT pour ne pas overlap)
  if (/CARTE\s+X\d+\s+\d{2}\/\d{2}\s+MGP\*Vinted/i.test(label) && amount < 0) {
    return "vinted_achat_cb";
  }
  // Précaution : "ANNULATIONS ET REGULARISATIONS" + crédit + MGP*Vinted = refund
  if (/MGP\*Vinted/i.test(label) && amount > 0 && /ANNULATIONS/i.test(category)) {
    return "vinted_refund_cb";
  }
  return "ignored";
}

export function parseSGCsv(csvText: string): BankLine[] {
  // Normalise les fins de ligne et enlève le BOM éventuel
  const text = csvText.replace(/^﻿/, "").replace(/\r\n?/g, "\n");
  const lines = text.split("\n");

  // Trouve la ligne d'entête
  const headerIdx = lines.findIndex(l => l.startsWith(EXPECTED_HEADER));
  if (headerIdx < 0) throw new Error("Format CSV non reconnu : ligne d'entête introuvable.");

  const result: BankLine[] = [];
  let current: BankLine | null = null;

  for (let i = headerIdx + 1; i < lines.length; i++) {
    const raw = lines[i];
    if (!raw.trim()) continue;
    const cols = splitCsvLine(raw);
    const dateStr = cols[0]?.trim() || "";
    const label = cols[1]?.trim() || "";

    if (dateStr) {
      // Nouvelle transaction : on push la précédente si elle existe
      if (current) result.push(finalize(current));
      const debit = parseFrAmount(cols[2] || "");
      const credit = parseFrAmount(cols[3] || "");
      const category = (cols[6] || "").trim();
      // Le SG exporte les débits déjà signés négatifs ("-60,96") dans la colonne Débit.
      // On force le signe avec -Math.abs pour être robuste si une autre banque les
      // stockait en positif. credit > 0 wins toujours.
      const amount = credit > 0 ? credit : -Math.abs(debit);
      current = {
        date: reformatDate(dateStr),
        label,
        amount,
        details: "",
        category,
        kind: "ignored"
      };
    } else if (current) {
      // Ligne de continuation : on agrège dans details
      const extra = label;
      if (extra) current.details += (current.details ? " " : "") + extra;
    }
  }
  if (current) result.push(finalize(current));

  return result;
}

function finalize(line: BankLine): BankLine {
  // Pour les CB on remplace la date bancaire par la date d'opération du libellé
  // (plus proche du moment réel de la dépense, donc meilleur match avec eventDate).
  const operationDate = labelOperationDate(line.label, line.date);
  if (operationDate) line.date = operationDate;
  line.kind = classify(line.label, line.details, line.amount, line.category);
  return line;
}
