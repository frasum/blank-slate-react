// P-3b — Reine, I/O-freie Ableitungen aus den Roster-Scopes des Aufrufers.
// scopes stammen aus getMyRosterScopes (siehe roster.functions.ts).

export type RosterScope = { locationId: string; area: "kitchen" | "service" };

// Standorte, in denen der Aufrufer mindestens EINEN Bereich planen darf.
export function allowedLocations<T extends { id: string }>(
  locations: T[],
  scopes: RosterScope[],
): T[] {
  const ids = new Set(scopes.map((s) => s.locationId));
  return locations.filter((l) => ids.has(l.id));
}

// Darf der Aufrufer im konkreten (Standort, Bereich) schreiben?
export function canEditScope(
  scopes: RosterScope[],
  locationId: string | null,
  area: "kitchen" | "service",
): boolean {
  if (!locationId) return false;
  return scopes.some((s) => s.locationId === locationId && s.area === area);
}