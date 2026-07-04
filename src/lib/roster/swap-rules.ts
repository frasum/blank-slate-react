// TA1 — Reine Regel-Helfer für den Schichttausch.
// KEINE Server-/DB-Aufrufe. Alles über Argumente. Deterministisch, testbar.
//
// Die Regeln werden sowohl beim Anlegen (canOfferShift) als auch beim
// Anzeigen der Anfragen an Kollegen (eligiblePeerFilter) und beim
// Annehmen mit Gegentausch (canAcceptCounterShift) eingesetzt. Die
// Server-Function-Schicht ist verpflichtet, diese Helfer VOR jeder
// Schreib-/Anzeigeaktion aufzurufen.

export type SwapArea = "kitchen" | "service" | "gl";

export type SwapShift = {
  id: string;
  staffId: string;
  locationId: string;
  area: SwapArea;
  shiftDate: string; // ISO YYYY-MM-DD
};

export type SwapPeer = {
  staffId: string;
  isActive: boolean;
  /** (location_id, department) aus staff_locations */
  scopes: ReadonlyArray<{ locationId: string; area: SwapArea }>;
  /** Datumssatz aller Schichten des Peers an (location, area) der Anfrage-Schicht. */
  shiftDatesAtScope: ReadonlySet<string>;
};

/** Datum liegt strikt nach todayIso (>= morgen). */
function isFutureDate(shiftDate: string, todayIso: string): boolean {
  return shiftDate > todayIso;
}

/**
 * Darf der Besitzer der Schicht sie zum Tausch anbieten?
 * - Datum in der Zukunft (>= morgen).
 * - Es existiert noch keine aktive Anfrage (open|peer_accepted) auf dieser Schicht.
 */
export function canOfferShift(input: {
  shiftDate: string;
  todayIso: string;
  hasActiveRequest: boolean;
}): boolean {
  if (input.hasActiveRequest) return false;
  return isFutureDate(input.shiftDate, input.todayIso);
}

/**
 * Ist ein Kollege für die Anfrage berechtigt?
 *  - Nicht der Anfragende selbst.
 *  - Aktiv.
 *  - Hat eine (location, area)-Scope-Zeile, die zur Schicht passt.
 *  - Hat an genau diesem Datum keine eigene Schicht in (location, area).
 */
export function eligiblePeerFilter(input: { peer: SwapPeer; shift: SwapShift }): boolean {
  const { peer, shift } = input;
  if (!peer.isActive) return false;
  if (peer.staffId === shift.staffId) return false;
  const hasScope = peer.scopes.some(
    (s) => s.locationId === shift.locationId && s.area === shift.area,
  );
  if (!hasScope) return false;
  if (peer.shiftDatesAtScope.has(shift.shiftDate)) return false;
  return true;
}

/**
 * Darf eine vom Peer angebotene Gegentausch-Schicht angenommen werden?
 *  - Gehört tatsächlich dem Peer.
 *  - Gleicher Standort und Bereich wie die Anfrage-Schicht.
 *  - Liegt in der Zukunft.
 *  - Selbst noch keine aktive Anfrage (Doppel-Bindung verhindern).
 */
export function canAcceptCounterShift(input: {
  counterShift: SwapShift & { hasActiveRequest: boolean };
  requestShift: SwapShift;
  peerStaffId: string;
  todayIso: string;
}): boolean {
  const { counterShift, requestShift, peerStaffId, todayIso } = input;
  if (counterShift.staffId !== peerStaffId) return false;
  if (counterShift.locationId !== requestShift.locationId) return false;
  if (counterShift.area !== requestShift.area) return false;
  if (!isFutureDate(counterShift.shiftDate, todayIso)) return false;
  if (counterShift.hasActiveRequest) return false;
  return true;
}
