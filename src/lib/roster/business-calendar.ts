// RT1 — Reine Kalender-Helfer für Ruhetage und Kalender-Ausnahmen.
// Keine IO. Wird von UI, Server-Guard und Server-Fns genutzt.

export type CalendarExceptionKind = "closed" | "open";

/** ISO-Wochentag: Mo=1 … So=7. */
export function isoWeekday(dateIso: string): number {
  const d = new Date(`${dateIso}T00:00:00Z`);
  const dow = d.getUTCDay(); // 0=So … 6=Sa
  return dow === 0 ? 7 : dow;
}

/**
 * Ist der Tag geschlossen?
 * - Ausnahme (`closed`/`open`) schlägt IMMER den Wochentag.
 * - Ohne Ausnahme: geschlossen, wenn Wochentag ∈ restWeekdays.
 */
export function isClosedDay(
  dateIso: string,
  restWeekdays: number[],
  exceptions: Map<string, CalendarExceptionKind>,
): boolean {
  const ex = exceptions.get(dateIso);
  if (ex === "closed") return true;
  if (ex === "open") return false;
  return restWeekdays.includes(isoWeekday(dateIso));
}