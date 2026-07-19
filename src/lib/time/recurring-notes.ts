// Payroll Recurring Notes — reine Logik.
//
// Zwei Notiz-Arten:
//   * kind='rate'  — läuft über periodsTotal Abrechnungsperioden, dann inaktiv.
//   * kind='dauer' — bleibt aktiv bei jeder Periode ab firstPeriodStart, bis
//                    canceled_at gesetzt ist.
//
// Aktive-Berechnung ist datumsbasiert und braucht KEINE Kenntnis unregelmäßiger
// Periodenlängen: `periodsElapsed` zählt die Perioden, deren startDate zwischen
// firstPeriodStart und currentPeriodStart (inklusive) liegt — die Reihenfolge
// der Periodenliste ist egal.

export type RecurringNoteKind = "rate" | "dauer";

export type RecurringNote = {
  id: string;
  staffId: string;
  locationId: string | null;
  kind: RecurringNoteKind;
  text: string;
  firstPeriodStart: string; // YYYY-MM-DD
  periodsTotal: number | null; // nur bei kind='rate'
  canceledAt: string | null;
};

export type PeriodRef = { startDate: string; endDate: string };

/** Anzahl Perioden zwischen firstPeriodStart und currentPeriodStart (1-basiert, inklusive). */
export function periodsElapsed(
  periods: PeriodRef[],
  firstPeriodStart: string,
  currentPeriodStart: string,
): number {
  if (currentPeriodStart < firstPeriodStart) return 0;
  let n = 0;
  for (const p of periods) {
    if (p.startDate >= firstPeriodStart && p.startDate <= currentPeriodStart) n += 1;
  }
  // Fallback, falls die aktuelle Periode noch nicht in `periods` steht
  // (z. B. manueller Zeitraum ohne Periodendefinition):
  if (n === 0) return 1;
  return n;
}

/** Ist die Notiz in der übergebenen Periode aktiv? */
export function isRecurringActive(n: RecurringNote, elapsed: number): boolean {
  if (n.canceledAt) return false;
  if (elapsed <= 0) return false;
  if (n.kind === "dauer") return true;
  if (n.periodsTotal == null) return false;
  return elapsed <= n.periodsTotal;
}

/** Anzeige-Text mit Rate-Zähler bzw. reinem Text bei Dauer-Notizen. */
export function formatRecurringText(n: RecurringNote, elapsed: number): string {
  if (n.kind === "dauer") return n.text;
  return `${n.text} · ${elapsed}/${n.periodsTotal ?? "?"}`;
}

/** Filtert + formatiert alle aktiven Notizen für die übergebene Periode. */
export function activeNotesForPeriod(
  notes: RecurringNote[],
  periods: PeriodRef[],
  currentPeriodStart: string,
  filterLocationId?: string | null,
): Array<{ note: RecurringNote; elapsed: number; display: string }> {
  const out: Array<{ note: RecurringNote; elapsed: number; display: string }> = [];
  for (const n of notes) {
    // Standort-Filter: locationId=null gilt für alle Standorte des Mitarbeiters.
    if (filterLocationId != null && n.locationId != null && n.locationId !== filterLocationId) {
      continue;
    }
    const elapsed = periodsElapsed(periods, n.firstPeriodStart, currentPeriodStart);
    if (!isRecurringActive(n, elapsed)) continue;
    out.push({ note: n, elapsed, display: formatRecurringText(n, elapsed) });
  }
  return out;
}
