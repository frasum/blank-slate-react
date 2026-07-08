// WA2 — Kollegenzeile für „Meine Schichten".
// Reine Formatier-/Gruppierungslogik. Kein Netz, kein DB-Zugriff.
// Eingabe: pro Tag/Standort die Liste der Kollegen des Callers
// (Caller ist bereits serverseitig entfernt).

export type ShiftMate = {
  staffId: string;
  displayName: string;
  area: "kitchen" | "service";
  skillName: string | null;
  status: "planned" | "confirmed";
};

export const MATES_LINE_PREFIX = "Mit dir im Dienst:";
export const MATES_MAX_PER_AREA = 12;

const AREA_SHORT: Record<ShiftMate["area"], string> = {
  kitchen: "Küche",
  service: "Service",
};

function formatArea(area: ShiftMate["area"], names: string[]): string | null {
  if (names.length === 0) return null;
  const shown = names.slice(0, MATES_MAX_PER_AREA);
  const rest = names.length - shown.length;
  const tail = rest > 0 ? ` +${rest}` : "";
  return `${AREA_SHORT[area]}: ${shown.join(" ")}${tail}`;
}

/**
 * Baut die Anzeige-Zeile (ohne Präfix) für die Kollegen eines Tages an
 * einem Standort. Reihenfolge: Küche zuerst, dann Service. Namen bleiben
 * in Eingabereihenfolge (Server liefert alphabetisch).
 * Rückgabe `""` = keine Kollegen → UI blendet die Zeile aus.
 */
export function formatShiftMatesLine(mates: ShiftMate[]): string {
  const byArea: Record<ShiftMate["area"], string[]> = { kitchen: [], service: [] };
  for (const m of mates) {
    if (m.area === "kitchen" || m.area === "service") {
      byArea[m.area].push(m.displayName);
    }
  }
  const parts: string[] = [];
  const k = formatArea("kitchen", byArea.kitchen);
  if (k) parts.push(k);
  const s = formatArea("service", byArea.service);
  if (s) parts.push(s);
  return parts.join(" · ");
}

/** Map-Schlüssel für die Server-Antwort: `${shift_date}|${location_id}`. */
export function shiftMatesKey(shiftDate: string, locationId: string): string {
  return `${shiftDate}|${locationId}`;
}