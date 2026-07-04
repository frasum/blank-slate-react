import { describe, it, expect } from "vitest";
import {
  shouldWarnAbsenceClockIn,
  parseAbsenceTodayError,
  absenceTodayError,
} from "./absence-warn";

describe("shouldWarnAbsenceClockIn", () => {
  it("keine Abwesenheit → keine Warnung", () => {
    expect(shouldWarnAbsenceClockIn({ absenceToday: null, confirmed: false })).toEqual({
      warn: false,
    });
  });

  it("Urlaub heute, nicht bestätigt → warnen mit Typ urlaub", () => {
    expect(shouldWarnAbsenceClockIn({ absenceToday: "urlaub", confirmed: false })).toEqual({
      warn: true,
      type: "urlaub",
    });
  });

  it("Krank heute, nicht bestätigt → warnen mit Typ krank", () => {
    expect(shouldWarnAbsenceClockIn({ absenceToday: "krank", confirmed: false })).toEqual({
      warn: true,
      type: "krank",
    });
  });

  it("Urlaub heute, bestätigt → Override durchreichen", () => {
    expect(shouldWarnAbsenceClockIn({ absenceToday: "urlaub", confirmed: true })).toEqual({
      override: true,
      type: "urlaub",
    });
  });

  it("Krank heute, bestätigt → Override durchreichen", () => {
    expect(shouldWarnAbsenceClockIn({ absenceToday: "krank", confirmed: true })).toEqual({
      override: true,
      type: "krank",
    });
  });

  it("keine Abwesenheit + bestätigt → keine Warnung (Override sinnlos)", () => {
    expect(shouldWarnAbsenceClockIn({ absenceToday: null, confirmed: true })).toEqual({
      warn: false,
    });
  });
});

describe("absenceTodayError / parseAbsenceTodayError", () => {
  it("rundläuft für urlaub", () => {
    expect(parseAbsenceTodayError(absenceTodayError("urlaub"))).toBe("urlaub");
  });
  it("rundläuft für krank", () => {
    expect(parseAbsenceTodayError(absenceTodayError("krank"))).toBe("krank");
  });
  it("fremde Message → null", () => {
    expect(parseAbsenceTodayError("Etwas anderes")).toBeNull();
  });
  it("unbekannter Typ → null", () => {
    expect(parseAbsenceTodayError("ABSENCE_TODAY:foo")).toBeNull();
  });
});
