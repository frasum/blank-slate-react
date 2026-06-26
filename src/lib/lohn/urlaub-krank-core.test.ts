import { describe, it, expect } from "vitest";
import {
  isoWeekday,
  deriveWorkingWeekdays,
  countWorkdaysInAbsence,
} from "./urlaub-krank-core";

describe("isoWeekday", () => {
  it("liefert Mo=1 und So=0 UTC-stabil", () => {
    expect(isoWeekday("2026-05-25")).toBe(1);
    expect(isoWeekday("2026-05-24")).toBe(0);
  });
});

describe("deriveWorkingWeekdays", () => {
  it("nimmt Wochentage ab threshold auf, ignoriert seltene", () => {
    const dates = [
      ...Array(8).fill("2026-05-25"), // Montag
      ...Array(2).fill("2026-05-26"), // Dienstag
    ];
    const wd = deriveWorkingWeekdays(dates, 7);
    expect(wd.has(1)).toBe(true);
    expect(wd.has(2)).toBe(false);
  });
});

describe("countWorkdaysInAbsence", () => {
  it("zählt nur Tage, deren Wochentag ein Arbeitstag ist", () => {
    // 7 Kalendertage Mo–So (2026-05-25 = Mo)
    const dates = [
      "2026-05-25",
      "2026-05-26",
      "2026-05-27",
      "2026-05-28",
      "2026-05-29",
      "2026-05-30",
      "2026-05-31",
    ];
    const working = new Set<number>([1, 2, 3, 4, 5]); // Mo–Fr
    expect(countWorkdaysInAbsence(dates, working)).toBe(5);
  });
});