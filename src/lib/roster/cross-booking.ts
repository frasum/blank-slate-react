// SP1 — Klassifizierung von Cross-Bookings.
// Kontext: Im Roster-Grid werden fremde Buchungen (anderer Standort oder
// Bereich desselben Mitarbeiters am selben Tag) als Punkt markiert.
// Bisher galt: jede Fremdbuchung = Konflikt (rot). Mit Tagesbetrieb
// (SP1) sind zwei Buchungen pro Tag in unterschiedlichen Fenstern
// (Mittag/Abend) ausdrücklich erlaubt — solche Cross-Buchungen sind
// dann kein Konflikt, sondern eine legitime Doppelschicht (blau).
//
// Reines Modul: keine DB-, Netz- oder Zeit-Abhängigkeiten.

export type ServicePeriod = "frueh" | "mittag" | "abend";

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

// DP1 — Minimaler Datensatz für die Punkt-Ableitung: „Ist dieser MA am
// Tag X woanders/anderen Bereich eingeteilt?". Wird von Admin-Grid (D6,
// Tooltip-Details) UND öffentlichem Display (nur boolescher Punkt) genutzt.
export type ShiftForFlag = {
  staffId: string;
  shiftDate: string;
  locationId: string;
  area: "kitchen" | "service" | "gl";
};

export type CrossBookingFlagViewport = {
  locationId: string;
  area: "kitchen" | "service" | "gl";
};

/**
 * Liefert die Menge aller `${staffId}|${shiftDate}`-Schlüssel, für die
 * eine Schicht an einem anderen Standort ODER in einem anderen Bereich
 * desselben Standorts existiert. Reine Booleans — keine Detailinfos.
 *
 * Regeln (siehe Tests):
 *  (a) Schicht am gleichen Standort/Bereich → kein Flag
 *  (b) Schicht an anderem Standort → Flag
 *  (c) anderer Bereich, gleicher Standort → Flag
 *  (d) keine Schicht → kein Flag
 */
export function computeCrossBookingFlags(
  shifts: readonly ShiftForFlag[],
  viewport: CrossBookingFlagViewport,
): Set<string> {
  const out = new Set<string>();
  for (const s of shifts) {
    if (s.locationId === viewport.locationId && s.area === viewport.area) continue;
    out.add(`${s.staffId}|${s.shiftDate}`);
  }
  return out;
}

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
  if (p === "frueh") return "Früh";
  if (p === "mittag") return "Mittag";
  return "Abend";
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
