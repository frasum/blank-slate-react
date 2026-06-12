// ArbZG-Pausenregeln (reine Funktionen, keine I/O).
//
// Quelle: ArbZG §4 — Ruhepausen sind im Voraus festzulegen:
//   * Arbeitszeit  >6h und ≤9h  → mind. 30 Minuten Pause
//   * Arbeitszeit  >9h          → mind. 45 Minuten Pause
//
// Festlegung B2b: Pause kommt als manuelle Eingabe (Pflichtfeld beim
// Ausstempeln, Default = ArbZG-Empfehlung). Wenn der Mitarbeiter eine
// kürzere Pause angibt, schreibt die Server-Function einen Marker
// `arbzg_short` ins audit_log.meta.

export const HOUR = 60;

export function arbzgMinimumBreak(grossMinutes: number): number {
  if (grossMinutes > 9 * HOUR) return 45;
  if (grossMinutes > 6 * HOUR) return 30;
  return 0;
}

export function isArbzgShort(grossMinutes: number, breakMinutes: number): boolean {
  return breakMinutes < arbzgMinimumBreak(grossMinutes);
}

export function grossMinutesBetween(startedAt: Date, endedAt: Date): number {
  return Math.max(0, Math.round((endedAt.getTime() - startedAt.getTime()) / 60000));
}