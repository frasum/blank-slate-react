/**
 * Portierte computeSfn-Tests aus bunker-shift-flow (zweite Testquelle B2-SFN).
 * Gegen Adapter src/lib/time/sfn/bunker.ts. Original 13 Fälle, 1:1 übernommen.
 */

import { describe, it, expect } from "vitest";
import { computeSfn, DEFAULT_SFN, type SfnSettings } from "./bunker";

const settings: SfnSettings = { ...DEFAULT_SFN };
const noHolidays = new Set<string>();

// 2025-06-09 = Mo, 2025-06-14 = Sa, 2025-06-15 = So
describe("computeSfn (bunker, portiert)", () => {
  it("returns empty breakdown when disabled", () => {
    const r = computeSfn({
      shiftDate: "2025-06-15",
      startTime: "10:00",
      endTime: "18:00",
      breakMinutes: 0,
      totalHours: 8,
      hourlyRate: 15,
      settings: { ...settings, enabled: false },
      holidays: noHolidays,
    });
    expect(r.surchargeWage).toBe(0);
    expect(r.sundayHours).toBe(0);
    expect(r.nightHours).toBe(0);
  });

  it("returns empty when start or end is missing", () => {
    const r = computeSfn({
      shiftDate: "2025-06-15",
      startTime: null,
      endTime: "18:00",
      breakMinutes: 0,
      totalHours: 8,
      hourlyRate: 15,
      settings,
      holidays: noHolidays,
    });
    expect(r.surchargeWage).toBe(0);
  });

  it("Monday 10:00–18:00: no surcharge at all", () => {
    const r = computeSfn({
      shiftDate: "2025-06-09",
      startTime: "10:00",
      endTime: "18:00",
      breakMinutes: 0,
      totalHours: 8,
      hourlyRate: 15,
      settings,
      holidays: noHolidays,
    });
    expect(r.sundayHours).toBe(0);
    expect(r.holidayHours).toBe(0);
    expect(r.nightHours).toBe(0);
    expect(r.surchargeWage).toBe(0);
  });

  it("Sunday full day 10:00–18:00: 8h Sunday, 0 night", () => {
    const r = computeSfn({
      shiftDate: "2025-06-15",
      startTime: "10:00",
      endTime: "18:00",
      breakMinutes: 0,
      totalHours: 8,
      hourlyRate: 15,
      settings,
      holidays: noHolidays,
    });
    expect(r.sundayHours).toBeCloseTo(8, 5);
    expect(r.nightHours).toBe(0);
    expect(r.surchargeWage).toBeCloseTo(60, 5);
  });

  it("Monday night 22:00–02:00 (wrap into Tuesday): 4h night, no sunday", () => {
    const r = computeSfn({
      shiftDate: "2025-06-09",
      startTime: "22:00",
      endTime: "02:00",
      breakMinutes: 0,
      totalHours: 4,
      hourlyRate: 10,
      settings,
      holidays: noHolidays,
    });
    expect(r.nightHours).toBeCloseTo(4, 5);
    expect(r.sundayHours).toBe(0);
    expect(r.surchargeWage).toBeCloseTo(10, 5);
  });

  it("Saturday 22:00 → Sunday 02:00: 2h Sunday, 4h night", () => {
    const r = computeSfn({
      shiftDate: "2025-06-14",
      startTime: "22:00",
      endTime: "02:00",
      breakMinutes: 0,
      totalHours: 4,
      hourlyRate: 10,
      settings,
      holidays: noHolidays,
    });
    expect(r.sundayHours).toBeCloseTo(2, 5);
    expect(r.nightHours).toBeCloseTo(4, 5);
    expect(r.surchargeWage).toBeCloseTo(20, 5);
  });

  it("Sunday → Monday 22:00–02:00: 2h Sunday, 4h night", () => {
    const r = computeSfn({
      shiftDate: "2025-06-15",
      startTime: "22:00",
      endTime: "02:00",
      breakMinutes: 0,
      totalHours: 4,
      hourlyRate: 10,
      settings,
      holidays: noHolidays,
    });
    expect(r.sundayHours).toBeCloseTo(2, 5);
    expect(r.nightHours).toBeCloseTo(4, 5);
  });

  it("Holiday outranks Sunday categorization", () => {
    const r = computeSfn({
      shiftDate: "2025-06-15",
      startTime: "10:00",
      endTime: "14:00",
      breakMinutes: 0,
      totalHours: 4,
      hourlyRate: 12,
      settings,
      holidays: new Set(["2025-06-15"]),
    });
    expect(r.holidayHours).toBeCloseTo(4, 5);
    expect(r.sundayHours).toBe(0);
    expect(r.surchargeWage).toBeCloseTo(60, 5);
  });

  it("Break is applied proportionally", () => {
    const r = computeSfn({
      shiftDate: "2025-06-15",
      startTime: "10:00",
      endTime: "18:00",
      breakMinutes: 60,
      totalHours: 7,
      hourlyRate: 10,
      settings,
      holidays: noHolidays,
    });
    expect(r.sundayHours).toBeCloseTo(8 * (7 / 8), 5);
    expect(r.surchargeWage).toBeCloseTo((7 * 50 * 10) / 100, 5);
  });

  it("end-time exactly at night_end (06:00) counts only night hours up to that point", () => {
    const r = computeSfn({
      shiftDate: "2025-06-09",
      startTime: "04:00",
      endTime: "06:00",
      breakMinutes: 0,
      totalHours: 2,
      hourlyRate: 10,
      settings,
      holidays: noHolidays,
    });
    expect(r.nightHours).toBeCloseTo(2, 5);
    expect(r.surchargeWage).toBeCloseTo(5, 5);
  });

  it("Non-wrapping night window (e.g. 02:00–05:00) only counts that range", () => {
    const r = computeSfn({
      shiftDate: "2025-06-09",
      startTime: "00:00",
      endTime: "06:00",
      breakMinutes: 0,
      totalHours: 6,
      hourlyRate: 10,
      settings: { ...settings, night_start: "02:00", night_end: "05:00" },
      holidays: noHolidays,
    });
    expect(r.nightHours).toBeCloseTo(3, 5);
  });

  it("Shift covering entire Sunday (00:00–23:59) gives ~24h Sunday hours", () => {
    const r = computeSfn({
      shiftDate: "2025-06-15",
      startTime: "00:00",
      endTime: "23:59",
      breakMinutes: 0,
      totalHours: 23.9833,
      hourlyRate: 10,
      settings,
      holidays: noHolidays,
    });
    expect(r.sundayHours).toBeGreaterThan(23);
    expect(r.sundayHours).toBeLessThanOrEqual(24);
  });

  it("Surcharge percentage is weighted average", () => {
    const r = computeSfn({
      shiftDate: "2025-06-15",
      startTime: "20:00",
      endTime: "24:00",
      breakMinutes: 0,
      totalHours: 4,
      hourlyRate: 10,
      settings,
      holidays: noHolidays,
    });
    expect(r.surchargeWage).toBeCloseTo(30, 5);
    expect(r.surchargePct).toBeCloseTo(75, 3);
  });
});
