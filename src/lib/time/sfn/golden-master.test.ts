/**
 * Golden-Master-Test (B2-SFN, Primärreferenz).
 *
 * Lädt golden-master/calculateShiftHours.json und prüft, dass der
 * tagesabrechnung-Adapter JEDEN Fall BITGENAU reproduziert
 * (toBe / toEqual, Toleranz 0). Quirks gelten als Charakterisierung —
 * nicht "verbessern".
 *
 * Strikte Gleichheit ist hier möglich, weil der Adapter (wie das
 * Original) am Ende auf 2 Nachkommastellen rundet — siehe Fall
 * "19:50–20:05" → eveningHours = 0.08.
 */

import { describe, expect, it } from "vitest";
import fixtures from "./golden-master/calculateShiftHours.json";
import { calculateShiftHours } from "./tagesabrechnung";

type Case = {
  name: string;
  start: string | null;
  end: string | null;
  sundayOrHoliday: boolean;
  expected: {
    totalHours: number;
    sundayHolidayHours: number;
    eveningHours: number;
    nightHours: number;
    nightDeepHours: number;
  };
};

const cases = (fixtures as { cases: Case[] }).cases;

describe("Golden Master: calculateShiftHours (tagesabrechnung)", () => {
  it("Fixture-Datei enthält die erwartete Anzahl Fälle", () => {
    // 20 Fälle laut Lieferumfang. Briefing nannte "3 QUIRK-Fälle";
    // die tatsächliche Fixture enthält 2 (01:00-05:00 ohne Wrap,
    // 00:00-08:00 ohne Wrap). Beide werden bitgenau reproduziert.
    expect(cases.length).toBe(20);
    expect(cases.filter((c) => c.name.startsWith("QUIRK:")).length).toBe(2);
  });

  for (const c of cases) {
    it(`reproduziert bitgenau: ${c.name}`, () => {
      const got = calculateShiftHours({
        start: c.start,
        end: c.end,
        sundayOrHoliday: c.sundayOrHoliday,
      });
      expect(got).toEqual(c.expected);
    });
  }
});
