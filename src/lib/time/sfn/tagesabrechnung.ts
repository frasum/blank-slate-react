/**
 * Adapter "tagesabrechnung" — Charakterisierung der produktiv bewährten
 * `calculateShiftHours`-Logik aus tagesabrechnung/src/lib/shiftCalculations.ts
 * (identisch im Remix-Stand). PRIMÄRREFERENZ für B2-SFN.
 *
 * Bitgenaue Reproduktion ist Abnahmekriterium. Quirks werden NICHT korrigiert.
 *
 * Semantik (siehe golden-master/calculateShiftHours.json):
 *   - evening   : Overlap mit 20:00–24:00 des Schicht-Tages
 *   - night     : Stunden von 00:00 bis Schichtende — nur bei Mitternachts-Wrap
 *   - nightDeep : Stunden von 00:00 bis 04:00 — nur bei Mitternachts-Wrap
 *   - sundayHolidayHours = totalHours wenn Flag gesetzt
 * Ein Wrap liegt vor, wenn endMin <= startMin (z. B. 17:00→01:30, 06:00→06:00).
 * Folge-Quirks: "01:00–05:00" (kein Wrap) und "00:00–08:00" liefern 0 Nachtstd.
 *
 * Alle Stunden-Felder werden auf 2 Nachkommastellen gerundet
 * (siehe Fall "19:50–20:05" → eveningHours = 0.08).
 */

import { overlapMin, parseTimeToMin, round2 } from "./sfn-core";

export type CalculateShiftHoursInput = {
  start: string | null;
  end: string | null;
  sundayOrHoliday: boolean;
};

export type CalculateShiftHoursOutput = {
  totalHours: number;
  sundayHolidayHours: number;
  eveningHours: number;
  nightHours: number;
  nightDeepHours: number;
};

const EMPTY: CalculateShiftHoursOutput = {
  totalHours: 0,
  sundayHolidayHours: 0,
  eveningHours: 0,
  nightHours: 0,
  nightDeepHours: 0,
};

export function calculateShiftHours(input: CalculateShiftHoursInput): CalculateShiftHoursOutput {
  const startMin = parseTimeToMin(input.start);
  const endMin = parseTimeToMin(input.end);
  if (startMin === null || endMin === null) return { ...EMPTY };

  const wrap = endMin <= startMin;
  const endAbs = wrap ? endMin + 1440 : endMin;
  const totalMin = endAbs - startMin;
  if (totalMin <= 0) return { ...EMPTY };

  // Evening: 20:00–24:00 des Day-1-Bereichs (Wrap-unabhängig)
  const eveningMin = overlapMin(startMin, endAbs, 20 * 60, 24 * 60);

  // Night/NightDeep: ausschließlich bei Wrap, gerechnet 00:00..endMin (Day-2)
  const nightMin = wrap ? endMin : 0;
  const nightDeepMin = wrap ? Math.min(endMin, 4 * 60) : 0;

  const totalHours = round2(totalMin / 60);
  return {
    totalHours,
    sundayHolidayHours: input.sundayOrHoliday ? totalHours : 0,
    eveningHours: round2(eveningMin / 60),
    nightHours: round2(nightMin / 60),
    nightDeepHours: round2(nightDeepMin / 60),
  };
}
