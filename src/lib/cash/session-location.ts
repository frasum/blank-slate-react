// Reine Auswahl-Logik: an welchem Standort darf für den Aufrufer eine
// Kassen-Session eröffnet werden?
//
//  - Manager/Admin (isPrivileged) → wie bisher: genau ein zugeordneter
//    Standort ergibt einen Treffer; alles andere ist mehrdeutig.
//  - Staff → nur wo er BEIDES ist: Standort-Zuordnung UND Service-Schicht
//    am Geschäftstag. Leere Schnittmenge = "nicht eingeteilt".

export type ResolveSessionLocation =
  | { ok: true; locationId: string }
  | { ok: false; reason: "not_scheduled" | "ambiguous" };

export function resolveSessionLocation(input: {
  isPrivileged: boolean;
  assignedLocationIds: string[];
  serviceShiftLocationIds: string[];
}): ResolveSessionLocation {
  const assigned = [...new Set(input.assignedLocationIds)];

  if (input.isPrivileged) {
    return assigned.length === 1
      ? { ok: true, locationId: assigned[0] }
      : { ok: false, reason: "ambiguous" };
  }

  const shifts = new Set(input.serviceShiftLocationIds);
  const eligible = assigned.filter((id) => shifts.has(id));
  if (eligible.length === 0) return { ok: false, reason: "not_scheduled" };
  if (eligible.length > 1) return { ok: false, reason: "ambiguous" };
  return { ok: true, locationId: eligible[0] };
}