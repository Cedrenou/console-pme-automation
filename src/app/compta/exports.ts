import * as XLSX from "xlsx";

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
