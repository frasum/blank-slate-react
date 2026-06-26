// 13-Wochen-Diagnose (Schritt 1, READ-ONLY): reine Helfer ohne Seiteneffekte.
// Wird von urlaub-krank-diagnose.ts genutzt. Keine Lohnart, kein Brutto-Eingriff.

/** Wochentag 0=So … 6=Sa aus ISO-Datum (UTC-stabil). */
export function isoWeekday(isoDate: string): number {
  return new Date(`${isoDate}T00:00:00Z`).getUTCDay();
}

/**
 * Reguläre Arbeits-Wochentage aus dem 13-Wochen-Muster.
 * threshold = Mindestanzahl gearbeiteter Vorkommen je Wochentag
 * (Default 7 = Mehrheit von 13 Vorkommen je Wochentag in 91 Tagen).
 */
export function deriveWorkingWeekdays(workedDates: string[], threshold = 7): Set<number> {
  const count = new Map<number, number>();
  for (const d of workedDates) {
    const wd = isoWeekday(d);
    count.set(wd, (count.get(wd) ?? 0) + 1);
  }
  const out = new Set<number>();
  for (const [wd, n] of count) if (n >= threshold) out.add(wd);
  return out;
}

/** Zählt Abwesenheitstage, deren Wochentag ein regulärer Arbeitstag ist. */
export function countWorkdaysInAbsence(
  absenceDates: string[],
  workingWeekdays: Set<number>,
): number {
  return absenceDates.filter((d) => workingWeekdays.has(isoWeekday(d))).length;
}