import { describe, expect, it } from "vitest";
import { bavarianHolidaySurchargeRate } from "./holiday-rate";

describe("bavarianHolidaySurchargeRate", () => {
  it("1. Mai → 1.5", () => {
    expect(bavarianHolidaySurchargeRate("2026-05-01")).toBe(1.5);
  });
  it("25.12. → 1.5", () => {
    expect(bavarianHolidaySurchargeRate("2026-12-25")).toBe(1.5);
  });
  it("26.12. → 1.5", () => {
    expect(bavarianHolidaySurchargeRate("2026-12-26")).toBe(1.5);
  });
  it("Karfreitag 2026 → 1.25", () => {
    expect(bavarianHolidaySurchargeRate("2026-04-06")).toBe(1.25);
  });
  it("Neujahr → 1.25", () => {
    expect(bavarianHolidaySurchargeRate("2026-01-01")).toBe(1.25);
  });
});
