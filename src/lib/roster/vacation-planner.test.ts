import { describe, expect, it } from "vitest";
import {
  dailyVacationCounts,
  dayOfYearIndex,
  dayOfYearPct,
  mergeAbsenceRanges,
  monthOffsets,
  yearDayCount,
} from "./vacation-planner";

describe("mergeAbsenceRanges", () => {
  it("fasst lückenlose Tage über Monatsgrenze zu einem Balken zusammen", () => {
    const dates = ["2026-01-30", "2026-01-31", "2026-02-01", "2026-02-02"];
    expect(mergeAbsenceRanges(dates)).toEqual([
      { start: "2026-01-30", end: "2026-02-02", days: 4 },
    ]);
  });

  it("liefert Einzeltag als Balken mit days=1", () => {
    expect(mergeAbsenceRanges(["2026-05-14"])).toEqual([
      { start: "2026-05-14", end: "2026-05-14", days: 1 },
    ]);
  });

  it("Lücke von einem Tag trennt Balken", () => {
    const dates = ["2026-03-01", "2026-03-02", "2026-03-04"];
    expect(mergeAbsenceRanges(dates)).toEqual([
      { start: "2026-03-01", end: "2026-03-02", days: 2 },
      { start: "2026-03-04", end: "2026-03-04", days: 1 },
    ]);
  });

  it("kappt Jahreswechsel-Urlaub am Jahresrand (2026-Anteil)", () => {
    const dates: string[] = [];
    // 12.12.2026 – 24.01.2027
    for (let d = 12; d <= 31; d++) dates.push(`2026-12-${String(d).padStart(2, "0")}`);
    for (let d = 1; d <= 24; d++) dates.push(`2027-01-${String(d).padStart(2, "0")}`);
    expect(mergeAbsenceRanges(dates, 2026)).toEqual([
      { start: "2026-12-12", end: "2026-12-31", days: 20 },
    ]);
    expect(mergeAbsenceRanges(dates, 2027)).toEqual([
      { start: "2027-01-01", end: "2027-01-24", days: 24 },
    ]);
  });

  it("dedupliziert doppelte Datumseinträge", () => {
    expect(mergeAbsenceRanges(["2026-06-01", "2026-06-01", "2026-06-02"])).toEqual([
      { start: "2026-06-01", end: "2026-06-02", days: 2 },
    ]);
  });
});

describe("yearDayCount / dayOfYearPct", () => {
  it("Schaltjahr 2024 → 366, Nicht-Schaltjahr 2026 → 365", () => {
    expect(yearDayCount(2024)).toBe(366);
    expect(yearDayCount(2026)).toBe(365);
    expect(yearDayCount(2100)).toBe(365);
    expect(yearDayCount(2000)).toBe(366);
  });

  it("dayOfYearIndex ist 0-basiert und Schaltjahr-fest", () => {
    expect(dayOfYearIndex("2026-01-01")).toBe(0);
    expect(dayOfYearIndex("2026-12-31")).toBe(364);
    expect(dayOfYearIndex("2024-12-31")).toBe(365);
  });

  it("dayOfYearPct liefert Position und Tages-Breite", () => {
    const p = dayOfYearPct("2026-01-01", 2026);
    expect(p.leftPct).toBeCloseTo(0);
    expect(p.widthPct).toBeCloseTo(100 / 365);
    const q = dayOfYearPct("2024-01-01", 2024);
    expect(q.widthPct).toBeCloseTo(100 / 366);
  });
});

describe("dailyVacationCounts", () => {
  it("zählt Überschneidungen pro Tag und klemmt aufs Jahr", () => {
    const map = new Map<string, { start: string; end: string }[]>([
      ["a", [{ start: "2026-12-30", end: "2027-01-02" }]],
      ["b", [{ start: "2026-12-31", end: "2027-01-01" }]],
    ]);
    const counts = dailyVacationCounts(map, 2026);
    expect(counts.get("2026-12-30")).toBe(1);
    expect(counts.get("2026-12-31")).toBe(2);
    expect(counts.get("2027-01-01")).toBeUndefined();
  });
});

describe("monthOffsets", () => {
  it("liefert 12 Monatsanker; Januar bei 0%", () => {
    const off = monthOffsets(2026);
    expect(off).toHaveLength(12);
    expect(off[0].leftPct).toBe(0);
    expect(off[11].leftPct).toBeGreaterThan(off[0].leftPct);
  });
});