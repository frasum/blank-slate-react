import { describe, it, expect } from "vitest";
import { currentBillingCycle, isInCurrentBillingCycle } from "./billing-cycle";

describe("currentBillingCycle", () => {
  it("liefert Vormonat-26 → aktueller-Monat-25 für Tage ≤ 25", () => {
    expect(currentBillingCycle("2026-07-16")).toEqual({
      startDate: "2026-06-26",
      endDate: "2026-07-25",
    });
  });
  it("liefert aktueller-Monat-26 → Folgemonat-25 für Tage > 25", () => {
    expect(currentBillingCycle("2026-07-26")).toEqual({
      startDate: "2026-07-26",
      endDate: "2026-08-25",
    });
  });
  it("überschreitet Jahresgrenzen korrekt", () => {
    expect(currentBillingCycle("2026-01-10")).toEqual({
      startDate: "2025-12-26",
      endDate: "2026-01-25",
    });
    expect(currentBillingCycle("2026-12-30")).toEqual({
      startDate: "2026-12-26",
      endDate: "2027-01-25",
    });
  });
  it("isInCurrentBillingCycle grenzt inklusiv ab", () => {
    expect(isInCurrentBillingCycle("2026-06-26", "2026-07-16")).toBe(true);
    expect(isInCurrentBillingCycle("2026-07-25", "2026-07-16")).toBe(true);
    expect(isInCurrentBillingCycle("2026-06-25", "2026-07-16")).toBe(false);
    expect(isInCurrentBillingCycle("2026-07-26", "2026-07-16")).toBe(false);
  });
});
