// Urlaub/Krank-Diagnose (Schritt 1b, READ-ONLY): reine Helfer ohne Seiteneffekte.
// Wird von urlaub-krank-diagnose.ts genutzt. Keine Lohnart, kein Brutto-Eingriff.

/** Anteil Arbeitstage am Fenster: (gearbeitet + abwesend) / Fenstertage, geklemmt [0,1]. */
export function workRate(scheduledDays: number, windowDays: number): number {
  if (windowDays <= 0) return 0;
  return Math.min(1, Math.max(0, scheduledDays / windowDays));
}

/** Geschätzte Arbeitstage einer Abwesenheit (Näherung, rotierender Plan). */
export function estimateWorkdays(calendarDays: number, rate: number): number {
  return Math.round(calendarDays * rate);
}
