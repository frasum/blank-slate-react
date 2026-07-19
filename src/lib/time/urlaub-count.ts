// UZ1 — Zählung Urlaubstage nach 5-Tage-Modell (nur Mo–Fr).
// Reine Funktion, ohne IO. Wird von listAbsencesByStaff genutzt und ist
// die EINE Zählquelle für Zeitübersicht und Buchhaltungs-Export.
// Feiertage zählen bewusst als normale Arbeitstage und werden NICHT
// herausgerechnet. `date` ist ein reiner Datums-String (YYYY-MM-DD) —
// keine Zeitzonen-Konvertierung.

import { isoWeekday } from "@/lib/roster/business-calendar";

export function isUrlaubWorkday(dateIso: string): boolean {
  return isoWeekday(dateIso) <= 5;
}

export function countUrlaubWorkdays(dates: readonly string[]): number {
  let n = 0;
  for (const d of dates) if (isUrlaubWorkday(d)) n += 1;
  return n;
}