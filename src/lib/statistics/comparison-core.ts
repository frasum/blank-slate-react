// STAT-U3 — Reine Vergleichs-Helfer für den Standortvergleich.
//
// Keine DB-Zugriffe, keine Seiteneffekte. Werden vom Statistik-Tab
// `Standortvergleich` genutzt und einzeln in Vitest getestet.

/**
 * Relative Abweichung von `a` gegenüber `b` in Prozent (mit Vorzeichen).
 * `b === 0` → null (kein definierter Prozentwert).
 */
export function pctDiff(a: number, b: number): number | null {
  if (b === 0) return null;
  return ((a - b) / b) * 100;
}

/**
 * Anteil von `a` an `a + b` als 0..1. Bei `a + b === 0` → 0.5
 * (neutrale Aufteilung, damit der Balken nicht kollabiert).
 */
export function shareOf(a: number, b: number): number {
  const sum = a + b;
  if (sum === 0) return 0.5;
  const share = a / sum;
  if (share < 0) return 0;
  if (share > 1) return 1;
  return share;
}

/**
 * Wählt die zwei umsatzstärksten Zeilen. Bei Gleichstand nach `name`
 * (aufsteigend, stabil). Weniger als zwei Einträge → Liste unverändert.
 */
export function pickTopTwoByTotal<T extends { totalCents: number; name: string }>(
  rows: readonly T[],
): T[] {
  if (rows.length <= 2) return [...rows];
  const sorted = [...rows].sort(
    (x, y) => y.totalCents - x.totalCents || x.name.localeCompare(y.name),
  );
  return sorted.slice(0, 2);
}
