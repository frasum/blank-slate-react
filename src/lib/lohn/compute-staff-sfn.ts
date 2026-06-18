/**
 * Reine Pro-Mitarbeiter-SFN-Aggregation.
 *
 * Baut die holidayRates-Map aus den SFN-Zeilen (so wie lohn-period.functions.ts
 * es tut) und rechnet beide Modi (simple, extended) mit `berechneSfnGeld`.
 * Kein Server-Kontext, kein I/O — wiederverwendbar in Tests und Server-Functions.
 */
import { berechneSfnGeld } from "./sfn-geld/sfn-geld";
import type { SfnGeldErgebnis, SfnShiftRow } from "./sfn-geld/types";
import { bavarianHolidaySurchargeRate } from "./holiday-rate";

export interface StaffSfnResult {
  simple: SfnGeldErgebnis;
  extended: SfnGeldErgebnis;
  zuschlagCents: number;
}

export function computeStaffSfn(rows: SfnShiftRow[], hourlyRateCents: number): StaffSfnResult {
  const holidayRates = new Map<string, number>();
  for (const r of rows) {
    if (r.isHoliday) holidayRates.set(r.shiftDate, bavarianHolidaySurchargeRate(r.shiftDate));
  }
  const simple = berechneSfnGeld(rows, "simple", hourlyRateCents, holidayRates);
  const extended = berechneSfnGeld(rows, "extended", hourlyRateCents, holidayRates);
  return { simple, extended, zuschlagCents: extended.zuschlagCents };
}
