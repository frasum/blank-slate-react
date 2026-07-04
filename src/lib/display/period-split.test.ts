import { describe, expect, it } from "vitest";
import { currentPeriodEnd, nextPeriodEnd, periodLabel, periodRangeLabel } from "./period-split";

describe("currentPeriodEnd", () => {
  it("Tag < 26 ⇒ 25. des laufenden Monats", () => {
    expect(currentPeriodEnd("2026-07-10")).toBe("2026-07-25");
    expect(currentPeriodEnd("2026-07-25")).toBe("2026-07-25");
    expect(currentPeriodEnd("2026-07-01")).toBe("2026-07-25");
  });
  it("Tag ≥ 26 ⇒ 25. des Folgemonats", () => {
    expect(currentPeriodEnd("2026-07-26")).toBe("2026-08-25");
    expect(currentPeriodEnd("2026-07-31")).toBe("2026-08-25");
  });
  it("Jahreswechsel: 26.12. ⇒ 25.01. Folgejahr", () => {
    expect(currentPeriodEnd("2026-12-26")).toBe("2027-01-25");
    expect(currentPeriodEnd("2026-12-31")).toBe("2027-01-25");
  });
  it("25.12. ⇒ 25.12.", () => {
    expect(currentPeriodEnd("2026-12-25")).toBe("2026-12-25");
  });
});

describe("periodLabel", () => {
  it("Periode Juli endet am 25.07.", () => {
    expect(periodLabel("2026-07-25")).toBe("Juli");
  });
  it("Periode Januar endet am 25.01.", () => {
    expect(periodLabel("2027-01-25")).toBe("Januar");
  });
  it("Periode Dezember endet am 25.12.", () => {
    expect(periodLabel("2026-12-25")).toBe("Dezember");
  });
});

describe("nextPeriodEnd", () => {
  it("nach 25.07. kommt 25.08.", () => {
    expect(nextPeriodEnd("2026-07-25")).toBe("2026-08-25");
  });
  it("nach 25.12. kommt 25.01. Folgejahr", () => {
    expect(nextPeriodEnd("2026-12-25")).toBe("2027-01-25");
  });
});

describe("periodRangeLabel", () => {
  it("Juli ⇒ 26.06.–25.07.", () => {
    expect(periodRangeLabel("2026-07-25")).toBe("26.06.–25.07.");
  });
  it("Januar ⇒ 26.12.–25.01.", () => {
    expect(periodRangeLabel("2027-01-25")).toBe("26.12.–25.01.");
  });
});
