/**
 * SFN-Geld-Modul (M4 Stufe 2a).
 *
 * Reines Modul: nimmt SFN-Stunden-Töpfe (aus calculateShiftHours) + Stundensatz (Cent)
 * und erzeugt steuerfreie Zuschläge in zwei Modi. 1:1 portiert aus
 * tagesabrechnung ZtBruttoNetto.tsx (aggregateSimple/aggregateExtended) + sfnRates.ts.
 */
import { SFN_RATES } from "./sfn-rates";
import type { SfnBuckets, SfnGeldErgebnis, SfnMode, SfnShiftRow } from "./types";

const round2 = (x: number): number => Math.round(x * 100) / 100;

export function aggregateSimple(rows: SfnShiftRow[]): SfnBuckets {
  const agg = {
    total: 0,
    night: 0,
    nightDeep: 0,
    sunday: 0,
    evening: 0,
    sundayEvening: 0,
    sundayNightDeep: 0,
  };
  for (const s of rows) {
    agg.total += s.totalHours || 0;
    agg.night += s.nightHours || 0;
    agg.nightDeep += s.nightDeepHours || 0;
    agg.evening += s.eveningHours || 0;
    if ((s.sundayHolidayHours || 0) > 0) {
      agg.sundayEvening += s.eveningHours || 0;
      agg.sundayNightDeep += s.nightDeepHours || 0;
    }
    agg.sunday += s.sundayHolidayHours || 0;
  }
  const rawN25 = agg.evening - agg.sundayEvening + Math.max(0, agg.night - agg.nightDeep);
  const rawN40 = agg.nightDeep - agg.sundayNightDeep;
  return {
    night25Hours: round2(Math.max(0, rawN25)),
    night40Hours: round2(Math.max(0, rawN40)),
    sundayHours: round2(agg.sunday),
    holidayHours: 0,
    holiday150Hours: 0,
  };
}

export function aggregateExtended(
  rows: SfnShiftRow[],
  holidayRates: Map<string, number>,
): SfnBuckets {
  const agg = {
    total: 0,
    night: 0,
    nightDeep: 0,
    evening: 0,
    sunday: 0,
    holiday: 0,
    holiday150: 0,
  };
  for (const s of rows) {
    agg.total += s.totalHours || 0;
    agg.night += s.nightHours || 0;
    agg.nightDeep += s.nightDeepHours || 0;
    agg.evening += s.eveningHours || 0;
    const soFei = s.sundayHolidayHours || 0;
    if (soFei > 0) {
      if (s.isHoliday && holidayRates) {
        const rate = holidayRates.get(s.shiftDate) ?? 1.25;
        if (rate >= 1.5) agg.holiday150 += soFei;
        else agg.holiday += soFei;
      } else {
        agg.sunday += soFei;
      }
    }
  }
  const n25 = agg.evening + Math.max(0, agg.night - agg.nightDeep);
  const n40 = agg.nightDeep;
  return {
    night25Hours: round2(Math.max(0, n25)),
    night40Hours: round2(Math.max(0, n40)),
    sundayHours: round2(agg.sunday),
    holidayHours: round2(agg.holiday),
    holiday150Hours: round2(agg.holiday150),
  };
}

/**
 * Berechnet aus SFN-Stunden-Töpfen den steuerfreien Zuschlag in Cent.
 * Eine Summe — am Ende einmal cent-gerundet (Original-Verhalten:
 * `r2(Σ hours × rate × pct)`).
 */
export function berechneSfnGeld(
  rows: SfnShiftRow[],
  mode: SfnMode,
  hourlyRateCents: number,
  holidayRates: Map<string, number>,
): SfnGeldErgebnis {
  const b: SfnBuckets =
    mode === "extended" ? aggregateExtended(rows, holidayRates) : aggregateSimple(rows);
  const zuschlagCents = Math.round(
    b.night25Hours * hourlyRateCents * SFN_RATES.night25 +
      b.night40Hours * hourlyRateCents * SFN_RATES.night40 +
      b.sundayHours * hourlyRateCents * SFN_RATES.sunday +
      b.holidayHours * hourlyRateCents * SFN_RATES.holiday +
      b.holiday150Hours * hourlyRateCents * SFN_RATES.holiday150,
  );
  return { ...b, zuschlagCents };
}
