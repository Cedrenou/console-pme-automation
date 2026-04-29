// Helpers de gestion des mois — partagés par les pages cockpit / ventes / achats / compta.

export const MONTH_NAMES_FR = [
  "janvier", "février", "mars", "avril", "mai", "juin",
  "juillet", "août", "septembre", "octobre", "novembre", "décembre"
];

export const generateMonthOptions = (): { value: string; label: string }[] => {
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

export const monthToDates = (value: string): { from: string; to: string } => {
  const [y, m] = value.split("-").map(Number);
  return {
    from: new Date(Date.UTC(y, m - 1, 1)).toISOString(),
    to: new Date(Date.UTC(y, m, 1)).toISOString(),
  };
};

export const currentMonthValue = (): string => {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
};

export const MONTH_OPTIONS = generateMonthOptions();
