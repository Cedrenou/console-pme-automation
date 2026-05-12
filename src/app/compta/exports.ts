import * as XLSX from "xlsx";
import type { ParsedBankCsv } from "./parseSGCsv";
import type { BankMatchResult } from "./matchBank";

// Filtre items sur une chaîne de recherche libre. L'extracteur fournit le "haystack"
// — concatène toutes les valeurs où matcher (texte ET montants formattés string et FR
// virgule). On lowercase tout. Une recherche vide → renvoie items inchangés.
export function filterBySearch<T>(items: T[], query: string, getHaystack: (it: T) => string): T[] {
  const q = query.trim().toLowerCase();
  if (!q) return items;
  return items.filter(it => getHaystack(it).toLowerCase().includes(q));
}

// Concatène valeurs dans un haystack en supportant la recherche par montant.
// Pour 139.55 on émet "139.55" + "139,55" + "139" pour que la secrétaire trouve
// indépendamment de la décimale qu'elle tape.
export function buildHaystack(parts: (string | number | undefined | null)[]): string {
  const out: string[] = [];
  for (const p of parts) {
    if (p === undefined || p === null) continue;
    if (typeof p === "number") {
      out.push(String(p));
      out.push(String(p).replace(".", ","));
      out.push(String(Math.floor(p)));
    } else {
      out.push(String(p));
    }
  }
  return out.join(" ");
}

// Génère un .xlsx et déclenche le téléchargement côté navigateur. Une seule feuille,
// le nom du fichier intègre l'onglet et le mois pour traçabilité.
export function downloadXlsx(filename: string, headers: string[], rows: (string | number | null | undefined)[][]): void {
  const data = [headers, ...rows];
  const sheet = XLSX.utils.aoa_to_sheet(data);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, "Export");
  XLSX.writeFile(workbook, filename);
}

// Export du relevé bancaire SG enrichi d'une colonne "N°Transaction" qui reprend le
// compta_label de l'event Vinted matché (Vente N, Achat N, Boost N, Annulation N, …).
// On reproduit la mise en page d'origine du CSV (lignes d'entête + lignes de continuation
// avec Date vide) pour que la secrétaire puisse comparer 1-pour-1 avec son fichier source.
export function downloadBankRapprochementXlsx(
  filename: string,
  parsed: ParsedBankCsv,
  matches: BankMatchResult[],
  /** Pour les lignes ambiguës résolues manuellement : map(idx du match → gmailMessageId
   *  choisi). On ne se fie pas à `consumed`, on prend le compta_label de l'event élu. */
  resolvedPicks: Map<number, string>,
  /** Tous les events chargés en mémoire, pour résoudre les gmailMessageId des resolvedPicks. */
  eventsById: Map<string, { compta_label?: string }>,
): void {
  const COLUMNS = ["Date", "Nature de l'opération", "Débit", "Crédit", "Libellé interbancaire", "N°Transaction"];

  // Index : numéro de ligne CSV-équivalent → libellé N°Transaction. On itère sur les matches
  // dans le même ordre que parsed.bankLines (matchBankLines préserve l'ordre des bankLines
  // non-ignored ; les ignored sont absentes). On rebuild donc une map bankLineIdx → label.
  const labelByBankLineRef = new Map<unknown, string>();
  let matchCursor = 0;
  for (const line of parsed.bankLines) {
    if (line.kind === "ignored") continue;
    const match = matches[matchCursor++];
    if (!match) continue;
    let label = "";
    if (match.status === "sure") {
      label = match.candidates[0]?.event.compta_label?.trim() || "";
    } else if (match.status === "ambigu") {
      const pickedId = resolvedPicks.get(matchCursor - 1);
      if (pickedId) {
        label = eventsById.get(pickedId)?.compta_label?.trim() || "";
      }
    }
    if (label) labelByBankLineRef.set(line, label);
  }

  const data: (string | number)[][] = [];

  // Réinjecte les lignes d'entête du CSV (titre compte, IBAN, soldes) telles quelles
  for (const h of parsed.headerRows) {
    data.push([...h]);
  }
  // Une ligne vide entre l'entête et le tableau, comme dans le CSV d'origine
  data.push([]);
  // Ligne de header des colonnes
  data.push([...COLUMNS]);

  // Lignes de transactions (principale + continuations)
  for (const line of parsed.bankLines) {
    const label = labelByBankLineRef.get(line) || "";
    line.rawRows.forEach((row, idx) => {
      data.push([
        row.date,
        row.label,
        row.debit,
        row.credit,
        row.libelleInter,
        idx === 0 ? label : "",
      ]);
    });
  }

  const sheet = XLSX.utils.aoa_to_sheet(data);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, "Relevé bancaire");
  XLSX.writeFile(workbook, filename);
}
