// Reine Auswahl-Logik für den Standard-Standort beim Stempeln.
// Mehrere Zeilen mit demselben location_id (z. B. Standort + zwei Bereiche)
// gelten als ein eindeutiger Standort.
export function pickSingleLocation(rows: { location_id: string }[]): string | null {
  const distinct = [...new Set(rows.map((r) => r.location_id))];
  return distinct.length === 1 ? distinct[0] : null;
}
