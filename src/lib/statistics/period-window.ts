// M-Statistik — Datums-Helfer für Statistik-Fenster.
//
// Reine Funktionen, UTC-sicher. Werden von getRevenueStats und getTipStats
// gemeinsam genutzt — eine Definition, kein Drift zwischen Umsatz- und
// Trinkgeld-Auswertung.

const MONTH_RE = /^\d{4}-\d{2}$/;

export function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function daysBetween(startIso: string, endIso: string): number {
  const a = Date.UTC(
    Number(startIso.slice(0, 4)),
    Number(startIso.slice(5, 7)) - 1,
    Number(startIso.slice(8, 10)),
  );
  const b = Date.UTC(
    Number(endIso.slice(0, 4)),
    Number(endIso.slice(5, 7)) - 1,
    Number(endIso.slice(8, 10)),
  );
  return Math.round((b - a) / 86_400_000);
}

/**
 * Gleich langes Fenster unmittelbar vor [start, end].
 */
export function previousRangeForDates(
  startIso: string,
  endIso: string,
): { startDate: string; endDate: string } {
  const len = daysBetween(startIso, endIso); // 0 = ein Tag
  const prevEnd = addDays(startIso, -1);
  const prevStart = addDays(prevEnd, -len);
  return { startDate: prevStart, endDate: prevEnd };
}

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

function parseYearMonth(yearMonth: string): { year: number; month: number } {
  if (!MONTH_RE.test(yearMonth)) {
    throw new Error(`Ungültiges Monatsformat: ${yearMonth} (erwartet YYYY-MM).`);
  }
  const year = Number(yearMonth.slice(0, 4));
  const month = Number(yearMonth.slice(5, 7));
  if (month < 1 || month > 12) {
    throw new Error(`Ungültiger Monat: ${yearMonth}.`);
  }
  return { year, month };
}

/**
 * Kalendermonat: "YYYY-MM" -> { "YYYY-MM-01", "YYYY-MM-<lastDay>" }.
 */
export function monthRange(yearMonth: string): { startDate: string; endDate: string } {
  const { year, month } = parseYearMonth(yearMonth);
  // Tag 0 des Folgemonats = letzter Tag dieses Monats.
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return {
    startDate: `${yearMonth}-01`,
    endDate: `${yearMonth}-${pad2(lastDay)}`,
  };
}

/**
 * "YYYY-MM" des Vormonats. Jahreswechsel: Januar → Dezember Vorjahr.
 *
 * Optionales `throughDay` (1..31) klemmt das Enddatum auf
 * `min(throughDay, letzter Tag des Vormonats)` — für faire Vergleiche bei
 * unvollständigem laufenden Monat. Ohne `throughDay` voller Vormonat
 * (rückwärtskompatibel).
 */
export function previousMonthRange(
  yearMonth: string,
  throughDay?: number,
): { startDate: string; endDate: string } {
  const { year, month } = parseYearMonth(yearMonth);
  const prevYear = month === 1 ? year - 1 : year;
  const prevMonth = month === 1 ? 12 : month - 1;
  const full = monthRange(`${prevYear}-${pad2(prevMonth)}`);
  if (throughDay === undefined) return full;
  if (!Number.isInteger(throughDay) || throughDay < 1 || throughDay > 31) {
    throw new Error(`Ungültiger throughDay: ${throughDay} (erwartet 1..31).`);
  }
  const prevLastDay = Number(full.endDate.slice(8, 10));
  const clamped = Math.min(throughDay, prevLastDay);
  return { startDate: full.startDate, endDate: `${full.startDate.slice(0, 7)}-${pad2(clamped)}` };
}

/**
 * Aktueller Kalendermonat in UTC als "YYYY-MM".
 */
export function currentMonth(now: Date = new Date()): string {
  return `${now.getUTCFullYear()}-${pad2(now.getUTCMonth() + 1)}`;
}
