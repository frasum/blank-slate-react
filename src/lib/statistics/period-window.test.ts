import { describe, expect, it } from "vitest";
import {
  addDays,
  currentMonth,
  daysBetween,
  monthRange,
  previousMonthRange,
  previousRangeForDates,
} from "./period-window";

describe("addDays", () => {
  it("addiert über Monatsgrenze", () => {
    expect(addDays("2026-01-31", 1)).toBe("2026-02-01");
  });
  it("addiert über Jahreswechsel", () => {
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
  });
  it("subtrahiert über Jahreswechsel", () => {
    expect(addDays("2026-01-01", -1)).toBe("2025-12-31");
  });
});

describe("daysBetween", () => {
  it("gleicher Tag = 0", () => {
    expect(daysBetween("2026-06-15", "2026-06-15")).toBe(0);
  });
  it("eine Woche", () => {
    expect(daysBetween("2026-06-01", "2026-06-08")).toBe(7);
  });
});

describe("previousRangeForDates", () => {
  it("liefert gleich langes Fenster direkt davor", () => {
    const prev = previousRangeForDates("2026-06-01", "2026-06-30");
    expect(prev).toEqual({ startDate: "2026-05-02", endDate: "2026-05-31" });
    expect(daysBetween(prev.startDate, prev.endDate)).toBe(29);
    expect(daysBetween("2026-06-01", "2026-06-30")).toBe(29);
  });
  it("Eintagesfenster", () => {
    expect(previousRangeForDates("2026-06-15", "2026-06-15")).toEqual({
      startDate: "2026-06-14",
      endDate: "2026-06-14",
    });
  });
});

describe("monthRange", () => {
  it("30-Tage-Monat (Juni)", () => {
    expect(monthRange("2026-06")).toEqual({ startDate: "2026-06-01", endDate: "2026-06-30" });
  });
  it("31-Tage-Monat (Januar)", () => {
    expect(monthRange("2026-01")).toEqual({ startDate: "2026-01-01", endDate: "2026-01-31" });
  });
  it("Februar 28 Tage (2026)", () => {
    expect(monthRange("2026-02")).toEqual({ startDate: "2026-02-01", endDate: "2026-02-28" });
  });
  it("Februar 29 Tage (Schaltjahr 2024)", () => {
    expect(monthRange("2024-02")).toEqual({ startDate: "2024-02-01", endDate: "2024-02-29" });
  });
  it("ungültiges Format wirft", () => {
    expect(() => monthRange("2026-6")).toThrow();
    expect(() => monthRange("2026-13")).toThrow();
  });
});

describe("previousMonthRange", () => {
  it("regulärer Vormonat", () => {
    expect(previousMonthRange("2026-06")).toEqual({
      startDate: "2026-05-01",
      endDate: "2026-05-31",
    });
  });
  it("Jahreswechsel Januar → Dezember Vorjahr", () => {
    expect(previousMonthRange("2026-01")).toEqual({
      startDate: "2025-12-01",
      endDate: "2025-12-31",
    });
  });
  it("März → Februar Schaltjahr", () => {
    expect(previousMonthRange("2024-03")).toEqual({
      startDate: "2024-02-01",
      endDate: "2024-02-29",
    });
  });
  it("throughDay klemmt Enddatum (unvollständiger laufender Monat)", () => {
    expect(previousMonthRange("2026-06", 15)).toEqual({
      startDate: "2026-05-01",
      endDate: "2026-05-15",
    });
  });
  it("throughDay > Tage im Vormonat wird auf Monatsende geklemmt", () => {
    // April hat 30 Tage
    expect(previousMonthRange("2026-05", 31)).toEqual({
      startDate: "2026-04-01",
      endDate: "2026-04-30",
    });
  });
  it("throughDay über Jahreswechsel", () => {
    expect(previousMonthRange("2026-01", 10)).toEqual({
      startDate: "2025-12-01",
      endDate: "2025-12-10",
    });
  });
  it("ungültiges throughDay wirft", () => {
    expect(() => previousMonthRange("2026-06", 0)).toThrow();
    expect(() => previousMonthRange("2026-06", 32)).toThrow();
  });
});

describe("currentMonth", () => {
  it("formatiert YYYY-MM in UTC", () => {
    expect(currentMonth(new Date("2026-06-29T22:00:00Z"))).toBe("2026-06");
    expect(currentMonth(new Date("2026-01-01T00:00:00Z"))).toBe("2026-01");
  });
});
