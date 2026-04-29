// Utilitaires partagés par les onglets de la page Compta. Les helpers mois sont
// hébergés dans /src/lib/months.ts et ré-exportés ici pour la compat des imports.

export {
  MONTH_NAMES_FR, generateMonthOptions, monthToDates, currentMonthValue, MONTH_OPTIONS
} from "@/lib/months";

export const formatEur = (n: number | undefined | null): string =>
  n === undefined || n === null
    ? ""
    : n.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const formatDateOnly = (iso: string): string => {
  const d = new Date(iso);
  return d.toISOString().slice(0, 10);
};

export const parseFrAmount = (s: string): number | undefined => {
  const n = parseFloat(s.replace(/[\s ]/g, "").replace(",", "."));
  return Number.isFinite(n) ? n : undefined;
};

// Achats : "Visa, **********5365 (35,11 €)" → "CB •5365" / mixte → "CB •5365 (X) + PM (Y)"
export const formatModePaiementAchat = (raw: string | undefined): string => {
  if (!raw) return "—";
  const cbLast4 = raw.match(/\*+\s*(\d{4})/)?.[1];
  const cbAmountStr = raw.match(/\*+\s*\d{4}\s*\(([\d,.]+)\s*€\)/)?.[1];
  const hasWallet = /porte\s*-?\s*monnaie/i.test(raw);
  const walletAmountStr = raw.match(/porte\s*-?\s*monnaie[^(]*\(([\d,.]+)\s*€\)/i)?.[1];
  const cbAmount = cbAmountStr ? parseFrAmount(cbAmountStr) : undefined;
  const walletAmount = walletAmountStr ? parseFrAmount(walletAmountStr) : undefined;
  const fmt = (n: number) => n.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + "€";
  if (cbLast4 && hasWallet) {
    const cb = cbAmount !== undefined ? `CB •${cbLast4} (${fmt(cbAmount)})` : `CB •${cbLast4}`;
    const pm = walletAmount !== undefined ? `PM (${fmt(walletAmount)})` : "PM";
    return `${cb} + ${pm}`;
  }
  if (cbLast4) return `CB •${cbLast4}`;
  if (hasWallet) return "Porte-monnaie";
  return raw.length > 24 ? raw.slice(0, 24) + "…" : raw;
};

// Boost : champ moyen_paiement plus simple ("Carte bancaire" / "le porte-monnaie Vinted").
// Format mixte à confirmer côté parser une fois le bug regex fixé.
export const formatMoyenPaiementBoost = (raw: string | undefined): string => {
  if (!raw) return "—";
  if (/porte\s*-?\s*monnaie/i.test(raw) && /carte/i.test(raw)) return "CB + Porte-monnaie";
  if (/porte\s*-?\s*monnaie/i.test(raw)) return "Porte-monnaie";
  if (/carte/i.test(raw)) return "Carte bancaire";
  return raw.length > 24 ? raw.slice(0, 24) + "…" : raw;
};
