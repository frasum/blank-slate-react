// UZ1 — Zählung Urlaubs- UND Krank-Tage nach 5-Tage-Modell (nur Mo–Fr).
// Reine Funktion, ohne IO. Wird von listAbsencesByStaff genutzt und ist
// die EINE Zählquelle für Zeitübersicht und Buchhaltungs-Export.
// Feiertage zählen bewusst als normale Arbeitstage und werden NICHT
// herausgerechnet. `date` ist ein reiner Datums-String (YYYY-MM-DD) —
// keine Zeitzonen-Konvertierung.

import { isoWeekday } from "@/lib/roster/business-calendar";

/** Mo–Fr? Gilt gleichermaßen für Urlaub und Krank (5-Tage-Modell). */
export function isAbsenceWorkday(dateIso: string): boolean {
  return isoWeekday(dateIso) <= 5;
}

export function countAbsenceWorkdays(dates: readonly string[]): number {
  let n = 0;
  for (const d of dates) if (isAbsenceWorkday(d)) n += 1;
  return n;
}

// Rückwärts-Aliase (falls externer Aufrufer noch die alten Namen nutzt).
export const isUrlaubWorkday = isAbsenceWorkday;
export const countUrlaubWorkdays = countAbsenceWorkdays;
