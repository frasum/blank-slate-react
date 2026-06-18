import { describe, it, expect } from "vitest";
import { computeStaffSfn } from "./compute-staff-sfn";
import type { SfnShiftRow } from "./sfn-geld/types";

const RATE = 1500; // 15,00 €/h in Cent

function row(over: Partial<SfnShiftRow>): SfnShiftRow {
  return {
    totalHours: 4,
    eveningHours: 0,
    nightHours: 0,
    nightDeepHours: 0,
    sundayHolidayHours: 0,
    isHoliday: false,
    shiftDate: "2026-01-05",
    ...over,
  };
}

describe("computeStaffSfn — §3b-Aufschlüsselung (extended)", () => {
  it("25.12. zählt als 150%-Feiertag, nicht als Sonntag oder 125%", () => {
    const r = computeStaffSfn(
      [row({ shiftDate: "2026-12-25", isHoliday: true, sundayHolidayHours: 4 })],
      RATE,
    );
    expect(r.extended.holiday150Hours).toBeGreaterThan(0);
    expect(r.extended.holidayHours).toBe(0);
    expect(r.extended.sundayHours).toBe(0);
  });

  it("125%-Feiertag (z. B. 03.10.) → holidayHours > 0, holiday150 = 0", () => {
    const r = computeStaffSfn(
      [row({ shiftDate: "2026-10-03", isHoliday: true, sundayHolidayHours: 4 })],
      RATE,
    );
    expect(r.extended.holidayHours).toBeGreaterThan(0);
    expect(r.extended.holiday150Hours).toBe(0);
    expect(r.extended.sundayHours).toBe(0);
  });

  it("gewöhnlicher Sonntag → sundayHours > 0, keine Feiertags-Töpfe", () => {
    // 2026-01-04 ist ein Sonntag
    const r = computeStaffSfn(
      [row({ shiftDate: "2026-01-04", isHoliday: false, sundayHolidayHours: 4 })],
      RATE,
    );
    expect(r.extended.sundayHours).toBeGreaterThan(0);
    expect(r.extended.holidayHours).toBe(0);
    expect(r.extended.holiday150Hours).toBe(0);
  });

  it("Sonntagabend: extended.night25 ≥ simple.night25 (extended zieht So/Fei nicht heraus)", () => {
    const sundayEvening = row({
      shiftDate: "2026-01-04",
      isHoliday: false,
      sundayHolidayHours: 4,
      eveningHours: 3,
      totalHours: 4,
    });
    const r = computeStaffSfn([sundayEvening], RATE);
    expect(r.extended.night25Hours).toBeGreaterThanOrEqual(r.simple.night25Hours);
  });
});
