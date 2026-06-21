// LexoRank-leicht: numerische Sortierwerte, Mittelwert zweier Nachbarn beim
// Drag-Drop. Reines Modul ohne Seiteneffekte — testbar.
//
// Regeln:
// - Zwischen zwei Nachbarn: arithmetisches Mittel.
// - Am Spaltenanfang (kein Vorgänger): `next - 1`.
// - Am Spaltenende (kein Nachfolger): `prev + 1`.
// - Leere Spalte: 0.

export function midpoint(prev: number | null, next: number | null): number {
  if (prev === null && next === null) return 0;
  if (prev === null && next !== null) return next - 1;
  if (prev !== null && next === null) return prev + 1;
  // beide gesetzt
  return (prev! + next!) / 2;
}

/**
 * Berechnet die neue `sort_order` einer Karte, die in einer Spalte an
 * `targetIndex` eingefügt werden soll. `existing` ist die nach sort_order
 * sortierte Liste der Karten in der Zielspalte OHNE die gedraggte Karte.
 */
export function sortOrderForInsert(
  existing: readonly { sort_order: number }[],
  targetIndex: number,
): number {
  const clamped = Math.max(0, Math.min(targetIndex, existing.length));
  const prev = clamped > 0 ? existing[clamped - 1].sort_order : null;
  const next = clamped < existing.length ? existing[clamped].sort_order : null;
  return midpoint(prev, next);
}
