// TA1 — Reine Regeln für den Schichttausch. Keine DB-Zugriffe, damit die
// Bedingungen als Unit-Tests fixiert werden können und derselbe Filter
// später in TA2 (Manager-Genehmigung) wiederverwendbar bleibt.

export type SwapArea = "kitchen" | "service" | "gl";

export type SwapShiftShape = {
  id: string;
  staffId: string;
  locationId: string;
  area: SwapArea;
  shiftDate: string; // YYYY-MM-DD
};

export type SwapPeerShape = {
  staffId: string;
  isActive: boolean;
  locations: { locationId: string; area: SwapArea }[];
  shiftsOnDate: { locationId: string; area: SwapArea }[]; // eigene Schichten am shift_date
};

// Datum in der Zukunft (>= morgen, lokal genügt String-Vergleich, ISO-Format).
export function isFutureShiftDate(shiftDate: string, todayIso: string): boolean {
  return shiftDate > todayIso;
}

export function canOfferShift(input: {
  shiftDate: string;
  todayIso: string;
  hasActiveRequest: boolean;
}): { ok: true } | { ok: false; reason: string } {
  if (input.hasActiveRequest) {
    return { ok: false, reason: "Für diese Schicht existiert bereits eine aktive Anfrage." };
  }
  if (!isFutureShiftDate(input.shiftDate, input.todayIso)) {
    return { ok: false, reason: "Nur zukünftige Schichten können getauscht werden." };
  }
  return { ok: true };
}

export function eligiblePeerFilter(input: {
  peer: SwapPeerShape;
  shift: SwapShiftShape;
}): boolean {
  const { peer, shift } = input;
  if (!peer.isActive) return false;
  if (peer.staffId === shift.staffId) return false;
  const hasScope = peer.locations.some(
    (l) => l.locationId === shift.locationId && l.area === shift.area,
  );
  if (!hasScope) return false;
  // Tages-Konflikt: der Kollege hat am gleichen Tag am gleichen Standort im
  // gleichen Bereich bereits eine eigene Schicht.
  const dayConflict = peer.shiftsOnDate.some(
    (s) => s.locationId === shift.locationId && s.area === shift.area,
  );
  if (dayConflict) return false;
  return true;
}

export function canAcceptCounterShift(input: {
  counterShift: SwapShiftShape;
  requestShift: SwapShiftShape;
  peerStaffId: string;
  todayIso: string;
  counterHasActiveRequest: boolean;
}): { ok: true } | { ok: false; reason: string } {
  const { counterShift, requestShift, peerStaffId, todayIso, counterHasActiveRequest } = input;
  if (counterShift.staffId !== peerStaffId) {
    return { ok: false, reason: "Gegentausch-Schicht gehört nicht zu dir." };
  }
  if (counterShift.locationId !== requestShift.locationId) {
    return { ok: false, reason: "Gegentausch muss am gleichen Standort liegen." };
  }
  if (counterShift.area !== requestShift.area) {
    return { ok: false, reason: "Gegentausch muss im gleichen Arbeitsbereich liegen." };
  }
  if (!isFutureShiftDate(counterShift.shiftDate, todayIso)) {
    return { ok: false, reason: "Gegentausch-Schicht muss in der Zukunft liegen." };
  }
  if (counterHasActiveRequest) {
    return { ok: false, reason: "Für die Gegentausch-Schicht existiert bereits eine Anfrage." };
  }
  return { ok: true };
}