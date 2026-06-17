import { describe, expect, it } from "vitest";
import { applyBreakProration } from "./time-entry-sfn";

describe("applyBreakProration", () => {
  it("30 min Pause auf 8h-Schicht → Faktor 0.9375", () => {
    const out = applyBreakProration(
      {
        totalHours: 8,
        eveningHours: 4,
        nightHours: 2,
        nightDeepHours: 2,
        sundayHolidayHours: 0,
      },
      30,
    );
    expect(out.totalHours).toBe(7.5);
    expect(out.eveningHours).toBe(3.75);
    expect(out.nightHours).toBe(1.875);
    expect(out.nightDeepHours).toBe(1.875);
    expect(out.sundayHolidayHours).toBe(0);
  });

  it("0 min Pause → unverändert", () => {
    const input = {
      totalHours: 8,
      eveningHours: 4,
      nightHours: 2,
      nightDeepHours: 2,
      sundayHolidayHours: 8,
    };
    const out = applyBreakProration(input, 0);
    expect(out).toEqual(input);
  });

  it("Pause > Schicht (600 min auf 8h) → alles 0", () => {
    const out = applyBreakProration(
      {
        totalHours: 8,
        eveningHours: 4,
        nightHours: 2,
        nightDeepHours: 2,
        sundayHolidayHours: 8,
      },
      600,
    );
    expect(out).toEqual({
      totalHours: 0,
      eveningHours: 0,
      nightHours: 0,
      nightDeepHours: 0,
      sundayHolidayHours: 0,
    });
  });

  it("totalHours = 0 → alles 0 (keine Division durch 0)", () => {
    const out = applyBreakProration(
      {
        totalHours: 0,
        eveningHours: 0,
        nightHours: 0,
        nightDeepHours: 0,
        sundayHolidayHours: 0,
      },
      30,
    );
    expect(out).toEqual({
      totalHours: 0,
      eveningHours: 0,
      nightHours: 0,
      nightDeepHours: 0,
      sundayHolidayHours: 0,
    });
  });
});