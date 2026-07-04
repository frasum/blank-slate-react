// Abrechnungsperiode: 26. eines Monats bis 25. des Folgemonats.
// Reine, UTC-sichere Helfer für den Display-Zähler-Split.

const MONTHS_DE = [
  "Januar",
  "Februar",
  "März",
  "April",
  "Mai",
  "Juni",
  "Juli",
  "August",
  "September",
  "Oktober",
  "November",
  "Dezember",
] as const;

function parseIso(iso: string): { y: number; m: number; d: number } {
  const y = Number(iso.slice(0, 4));
  const m = Number(iso.slice(5, 7));
  const d = Number(iso.slice(8, 10));
  return { y, m, d };
}

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

function isoOf(y: number, m: number, d: number): string {
  return `${y}-${pad2(m)}-${pad2(d)}`;
}

/**
 * Letzter Tag der Abrechnungsperiode, in der `todayIso` liegt.
 * Regel: Tag ≥ 26 ⇒ Ende = 25. des Folgemonats; sonst 25. des laufenden Monats.
 * Jahreswechsel wird korrekt behandelt (26.12. ⇒ 25.01. Folgejahr).
 */
export function currentPeriodEnd(todayIso: string): string {
  const { y, m, d } = parseIso(todayIso);
  if (d >= 26) {
    const ny = m === 12 ? y + 1 : y;
    const nm = m === 12 ? 1 : m + 1;
    return isoOf(ny, nm, 25);
  }
  return isoOf(y, m, 25);
}

/**
 * Label der Periode, die auf `endIso` (dem 25.) endet.
 * Periode "Juli" = 26.06.–25.07. ⇒ Label ist der Monat von endIso.
 */
export function periodLabel(endIso: string): string {
  const { m } = parseIso(endIso);
  return MONTHS_DE[m - 1];
}

/**
 * Vollständiger Bereich als "DD.MM.–DD.MM." (für title-Tooltip).
 */
export function periodRangeLabel(endIso: string): string {
  const { y, m } = parseIso(endIso);
  const py = m === 1 ? y - 1 : y;
  const pm = m === 1 ? 12 : m - 1;
  const startDay = 26;
  return `${pad2(startDay)}.${pad2(pm)}.–25.${pad2(m)}.`;
}

/**
 * Ende der Folgeperiode (nach `currentEndIso`).
 */
export function nextPeriodEnd(currentEndIso: string): string {
  const { y, m } = parseIso(currentEndIso);
  const ny = m === 12 ? y + 1 : y;
  const nm = m === 12 ? 1 : m + 1;
  return isoOf(ny, nm, 25);
}