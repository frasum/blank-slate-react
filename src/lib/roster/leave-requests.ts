// N6 (Frank, 13.07.2026) — Fachregel Urlaubszählung:
// Der Urlaubsanspruch ist auf die 5-Tage-Woche normiert. Ein Urlaubstag
// wird für jeden Montag–Freitag im Zeitraum verbraucht — Sonntage nie,
// Samstage nie, und Feiertage zählen als NORMALE Arbeitstage (eine
// Urlaubswoche kostet immer 5 Tage, auch mit Feiertag darin).
//
// Reine Helfer für Urlaubsanträge (ohne IO). Wird sowohl von Server-
// Functions (`leave.functions.ts`) als auch von der UI verwendet. Keine
// Supabase-/React-Importe — getestet via Vitest.

export type LeaveStatus = "offen" | "genehmigt" | "abgelehnt";

const ISO_RE = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 24 * 60 * 60 * 1000;

export function isValidLeaveRange(start: string, end: string): boolean {
  if (!ISO_RE.test(start) || !ISO_RE.test(end)) return false;
  return end >= start;
}

/**
 * Zählt Montag–Freitag-Tage im Zeitraum [start, end] (inklusiv, UTC-datumsbasiert).
 * Samstage und Sonntage werden nicht gezählt, Feiertage zählen als normale
 * Arbeitstage (5-Tage-Modell — siehe Kopfkommentar).
 */
export function countLeaveDays(start: string, end: string): number {
  if (!isValidLeaveRange(start, end)) return 0;
  const s = Date.UTC(
    Number(start.slice(0, 4)),
    Number(start.slice(5, 7)) - 1,
    Number(start.slice(8, 10)),
  );
  const e = Date.UTC(
    Number(end.slice(0, 4)),
    Number(end.slice(5, 7)) - 1,
    Number(end.slice(8, 10)),
  );
  let n = 0;
  for (let t = s; t <= e; t += DAY_MS) {
    const dow = new Date(t).getUTCDay(); // 0=So, 6=Sa
    if (dow >= 1 && dow <= 5) n++;
  }
  return n;
}

export function canCancelLeave(status: LeaveStatus): boolean {
  return status === "offen";
}

export function canDecideLeave(status: LeaveStatus): boolean {
  return status === "offen";
}
