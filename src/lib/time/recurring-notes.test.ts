import { describe, expect, it } from "vitest";
import {
  activeNotesForPeriod,
  formatRecurringText,
  isRecurringActive,
  periodsElapsed,
  type PeriodRef,
  type RecurringNote,
} from "./recurring-notes";

const periods: PeriodRef[] = [
  { startDate: "2026-04-24", endDate: "2026-05-23" },
  { startDate: "2026-05-24", endDate: "2026-06-23" },
  { startDate: "2026-06-24", endDate: "2026-07-23" },
  { startDate: "2026-07-24", endDate: "2026-08-23" },
  { startDate: "2026-08-24", endDate: "2026-09-23" },
  { startDate: "2026-09-24", endDate: "2026-10-23" },
  { startDate: "2026-10-24", endDate: "2026-11-23" },
  { startDate: "2026-11-24", endDate: "2026-12-23" },
];

const rate6: RecurringNote = {
  id: "r1",
  staffId: "s1",
  locationId: null,
  kind: "rate",
  text: "Darlehen 500 €",
  firstPeriodStart: "2026-05-24",
  periodsTotal: 6,
  canceledAt: null,
};

const dauer: RecurringNote = {
  id: "d1",
  staffId: "s1",
  locationId: null,
  kind: "dauer",
  text: "Pfändung",
  firstPeriodStart: "2026-06-24",
  periodsTotal: null,
  canceledAt: null,
};

describe("periodsElapsed", () => {
  it("returns 1 for the first period", () => {
    expect(periodsElapsed(periods, "2026-05-24", "2026-05-24")).toBe(1);
  });
  it("returns 6 at end of a 6-period run", () => {
    expect(periodsElapsed(periods, "2026-05-24", "2026-10-24")).toBe(6);
  });
  it("returns 0 when current is before first", () => {
    expect(periodsElapsed(periods, "2026-06-24", "2026-05-24")).toBe(0);
  });
});

describe("isRecurringActive + formatRecurringText", () => {
  it("rate is active for periods 1..N", () => {
    for (let n = 1; n <= 6; n++) expect(isRecurringActive(rate6, n)).toBe(true);
  });
  it("rate becomes inactive after N", () => {
    expect(isRecurringActive(rate6, 7)).toBe(false);
  });
  it("canceled = inactive", () => {
    expect(isRecurringActive({ ...rate6, canceledAt: "2026-06-01" }, 2)).toBe(false);
  });
  it("dauer stays active for arbitrary counts", () => {
    expect(isRecurringActive(dauer, 1)).toBe(true);
    expect(isRecurringActive(dauer, 99)).toBe(true);
  });
  it("format shows n/total for rate, plain text for dauer", () => {
    expect(formatRecurringText(rate6, 3)).toBe("Darlehen 500 € · 3/6");
    expect(formatRecurringText(dauer, 99)).toBe("Pfändung");
  });
});

describe("activeNotesForPeriod", () => {
  it("returns rate + dauer at period 2, excludes rate at period 7", () => {
    const p2 = "2026-06-24"; // = elapsed 2 for rate6, 1 for dauer
    const active = activeNotesForPeriod([rate6, dauer], periods, p2);
    expect(active.map((a) => a.display)).toEqual(["Darlehen 500 € · 2/6", "Pfändung"]);

    const p7 = "2026-11-24"; // elapsed 7 for rate6
    const past = activeNotesForPeriod([rate6, dauer], periods, p7);
    expect(past.map((a) => a.display)).toEqual(["Pfändung"]);
  });
  it("respects location scope (org-wide note passes any filter)", () => {
    const scoped: RecurringNote = { ...rate6, id: "r2", locationId: "loc-A" };
    const active = activeNotesForPeriod([rate6, scoped], periods, "2026-06-24", "loc-B");
    // rate6 (locationId=null) passes; scoped (loc-A) is filtered out for loc-B
    expect(active).toHaveLength(1);
    expect(active[0].note.id).toBe("r1");
  });
});
