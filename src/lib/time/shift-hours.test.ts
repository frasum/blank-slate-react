import { describe, expect, it } from "vitest";
import { computeShiftHours, isBavarianHoliday, isSundayOrHoliday } from "./shift-hours";

// Hinweis: ISO-Strings mit explizitem Berlin-Offset (Sommerzeit "+02:00", Winterzeit "+01:00").
// 15.06.2026 ist ein Montag (Sommerzeit).

describe("shift-hours", () => {
  it("(a) Normalschicht 15:00–23:30 → Ges=8,5h, Abend=3,5h, Nacht=0", () => {
    const r = computeShiftHours(
      "2026-06-15T15:00:00+02:00",
      "2026-06-15T23:30:00+02:00",
      "2026-06-15",
    );
    expect(r.totalHours).toBeCloseTo(8.5, 5);
    expect(r.eveningHours).toBeCloseTo(3.5, 5);
    expect(r.nightHours).toBeCloseTo(0, 5);
    expect(r.sundayHolidayHours).toBe(0);
  });

  it("(b) Mitternachtsschicht 16:00–00:15 → Ges=8,25h, Abend=4h, Nacht=0,25h", () => {
    const r = computeShiftHours(
      "2026-06-15T16:00:00+02:00",
      "2026-06-16T00:15:00+02:00",
      "2026-06-15",
    );
    expect(r.totalHours).toBeCloseTo(8.25, 5);
    expect(r.eveningHours).toBeCloseTo(4, 5);
    expect(r.nightHours).toBeCloseTo(0.25, 5);
  });

  it("(c) Sonntagsschicht überschreibt Abend-Zuschlag", () => {
    // 14.06.2026 ist ein Sonntag.
    const r = computeShiftHours(
      "2026-06-14T15:00:00+02:00",
      "2026-06-14T23:00:00+02:00",
      "2026-06-14",
    );
    expect(r.totalHours).toBeCloseTo(8, 5);
    expect(r.sundayHolidayHours).toBeCloseTo(8, 5);
    expect(r.eveningHours).toBe(0);
    expect(r.nightHours).toBe(0);
  });

  it("(d) 01.05. ist Feiertag (Tag der Arbeit)", () => {
    const d = new Date("2026-05-01T12:00:00Z");
    expect(isBavarianHoliday(d)).toBe(true);
    expect(isSundayOrHoliday(d)).toBe(true);
  });

  it("(e) Ostermontag 2026 = 06.04.2026", () => {
    const ostermontag = new Date("2026-04-06T12:00:00Z");
    const normaler = new Date("2026-04-07T12:00:00Z");
    expect(isBavarianHoliday(ostermontag)).toBe(true);
    expect(isBavarianHoliday(normaler)).toBe(false);
  });

  it("(f) Schicht ohne Mitternachtsüberschreitung → nightHours=0", () => {
    const r = computeShiftHours(
      "2026-06-15T10:00:00+02:00",
      "2026-06-15T18:00:00+02:00",
      "2026-06-15",
    );
    expect(r.nightHours).toBe(0);
    expect(r.eveningHours).toBe(0);
    expect(r.totalHours).toBeCloseTo(8, 5);
  });
});
