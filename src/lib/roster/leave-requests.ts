// Welle C — Reine Helfer für Urlaubsanträge (ohne IO).
// Wird sowohl von Server-Functions (`leave.functions.ts`) als auch von
// der UI verwendet. Keine Supabase-/React-Importe — getestet via Vitest.

export type LeaveStatus = "offen" | "genehmigt" | "abgelehnt";

const ISO_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isValidLeaveRange(start: string, end: string): boolean {
  if (!ISO_RE.test(start) || !ISO_RE.test(end)) return false;
  return end >= start;
}

export function countLeaveDays(start: string, end: string, holidayDates?: Set<string>): number {
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
  const raw = Math.round((e - s) / (24 * 60 * 60 * 1000)) + 1;
  if (!holidayDates || holidayDates.size === 0) return raw;
  let deducted = 0;
  for (let t = s; t <= e; t += 24 * 60 * 60 * 1000) {
    const iso = new Date(t).toISOString().slice(0, 10);
    if (holidayDates.has(iso)) deducted++;
  }
  return Math.max(0, raw - deducted);
}

/**
 * Wie viele Feiertage aus `holidayDates` fallen in [start, end]?
 * Für UI-Anzeige „(N Feiertage nicht gezählt)".
 */
export function countHolidaysInRange(
  start: string,
  end: string,
  holidayDates: Set<string>,
): number {
  if (!isValidLeaveRange(start, end) || holidayDates.size === 0) return 0;
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
  for (let t = s; t <= e; t += 24 * 60 * 60 * 1000) {
    const iso = new Date(t).toISOString().slice(0, 10);
    if (holidayDates.has(iso)) n++;
  }
  return n;
}

export function canCancelLeave(status: LeaveStatus): boolean {
  return status === "offen";
}

export function canDecideLeave(status: LeaveStatus): boolean {
  return status === "offen";
}
