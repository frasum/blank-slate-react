// Urlaub/Krank-Diagnose (Schritt 1b, READ-ONLY): reine Helfer ohne Seiteneffekte.
// Wird von urlaub-krank-diagnose.ts genutzt. Keine Lohnart, kein Brutto-Eingriff.

/** Arbeitsquote in [0,1]: gearbeitete Tage / Fenstertage. */
export function workRate(workedDays: number, windowDays: number): number {
  if (windowDays <= 0) return 0;
  return Math.min(1, Math.max(0, workedDays / windowDays));
}

/** Geschätzte Arbeitstage einer Abwesenheit (Näherung, rotierender Plan). */
export function estimateWorkdays(calendarDays: number, rate: number): number {
  return Math.round(calendarDays * rate);
}