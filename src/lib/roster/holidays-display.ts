// FT1 — Anzeige-Helfer für gesetzliche Feiertage im Dienstplan.
//
// Region-Parameter ist die dokumentierte SaaS-Erweiterungsstelle (§86 P3 /
// Roadmap „Feiertags-Regionen"): weitere Bundesländer = Daten-Nachtrag +
// holiday_region je Standort — KEIN Refactoring. Heute liefern alle
// Standorte implizit 'BY'.
//
// Reines Modul: liest ausschließlich aus der bestehenden
// `bavarianHolidayMap` in `shift-hours.ts` (SFN-Quelle, nicht anfassen).

import { bavarianHolidayMap } from "@/lib/time/shift-hours";

export type HolidayRegion = "BY";

/**
 * Liefert den Feiertagsnamen (z. B. „Mariä Himmelfahrt") für ein ISO-Datum
 * `YYYY-MM-DD` oder `null`, wenn der Tag kein Feiertag der Region ist.
 */
export function getHolidayName(dateIso: string, region: HolidayRegion = "BY"): string | null {
  if (region !== "BY") return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateIso)) return null;
  const year = Number(dateIso.slice(0, 4));
  const mmdd = dateIso.slice(5);
  return bavarianHolidayMap(year).get(mmdd) ?? null;
}
