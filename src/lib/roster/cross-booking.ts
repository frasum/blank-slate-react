// SP1 — Klassifizierung von Cross-Bookings.
// Kontext: Im Roster-Grid werden fremde Buchungen (anderer Standort oder
// Bereich desselben Mitarbeiters am selben Tag) als Punkt markiert.
// Bisher galt: jede Fremdbuchung = Konflikt (rot). Mit Tagesbetrieb
// (SP1) sind zwei Buchungen pro Tag in unterschiedlichen Fenstern
// (Mittag/Abend) ausdrücklich erlaubt — solche Cross-Buchungen sind
// dann kein Konflikt, sondern eine legitime Doppelschicht (blau).
//
// Reines Modul: keine DB-, Netz- oder Zeit-Abhängigkeiten.

export type ServicePeriod = "mittag" | "abend";

export type CrossBookingKind = "conflict" | "info";

export type CrossBookingRow = {
  staffId: string;
  shiftDate: string;
  locationId: string;
  locationName: string;
  area: "kitchen" | "service" | "gl";
  servicePeriod: ServicePeriod;
  skillName?: string | null;
};

export type ClassifiedCrossBooking = CrossBookingRow & {
  kind: CrossBookingKind;
};

export type CrossBookingViewport = {
  /** Standort-ID des aktuell betrachteten Grids. */
  locationId: string;
  /** Bereich des aktuell betrachteten Grids. */
  area: "kitchen" | "service";
  /** Aktiv angezeigtes Planungsfenster. */
  servicePeriod: ServicePeriod;
};

/**
 * Klassifiziert alle Cross-Bookings gegenüber einem Grid-Viewport.
 *
 * `conflict`: gleicher Tag, gleiches Fenster, an ANDEREM Standort oder
 * in anderem Bereich desselben Standorts. Blockt neue Einteilungen.
 *
 * `info`: gleicher Tag, aber ANDERES Fenster (Mittag vs. Abend). Nur
 * Hinweis, dass hier eine Doppelschicht liegt.
 *
 * Buchungen im selben Grid-Slot (gleicher Standort, Bereich, Fenster)
 * werden hier NICHT als Cross-Booking geführt — die sind das Grid selbst.
 */
export function classifyCrossBookings(
  rows: readonly CrossBookingRow[],
  viewport: CrossBookingViewport,
): ClassifiedCrossBooking[] {
  const out: ClassifiedCrossBooking[] = [];
  for (const r of rows) {
    // Nicht das aktive Grid selbst wieder als „fremd" markieren.
    if (
      r.locationId === viewport.locationId &&
      r.area === viewport.area &&
      r.servicePeriod === viewport.servicePeriod
    ) {
      continue;
    }
    const kind: CrossBookingKind = r.servicePeriod === viewport.servicePeriod ? "conflict" : "info";
    out.push({ ...r, kind });
  }
  return out;
}

/** Menschlich lesbares Fenster-Label. */
export function servicePeriodLabel(p: ServicePeriod): string {
  return p === "mittag" ? "Mittag" : "Abend";
}

/** Gruppiert klassifizierte Cross-Bookings nach `staffId|shiftDate`. */
export function indexClassifiedByStaffDate(
  rows: readonly ClassifiedCrossBooking[],
): Map<string, ClassifiedCrossBooking[]> {
  const m = new Map<string, ClassifiedCrossBooking[]>();
  for (const r of rows) {
    const k = `${r.staffId}|${r.shiftDate}`;
    const arr = m.get(k) ?? [];
    arr.push(r);
    m.set(k, arr);
  }
  return m;
}

/**
 * Der „schlimmste" Kind unter mehreren Klassifikationen. Konflikt schlägt
 * Info; leere Menge liefert `null`.
 */
export function worstKind(rows: readonly { kind: CrossBookingKind }[]): CrossBookingKind | null {
  if (rows.length === 0) return null;
  for (const r of rows) if (r.kind === "conflict") return "conflict";
  return "info";
}
