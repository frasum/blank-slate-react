import { describe, it, expect } from "vitest";
import { getHolidayName } from "./holidays-display";

describe("getHolidayName", () => {
  it("kennt Mariä Himmelfahrt (15.08.)", () => {
    expect(getHolidayName("2026-08-15")).toBe("Mariä Himmelfahrt");
  });
  it("kennt Neujahr", () => {
    expect(getHolidayName("2027-01-01")).toBe("Neujahr");
  });
  it("beweglicher Feiertag: Ostermontag 2026 (06.04.)", () => {
    expect(getHolidayName("2026-04-06")).toBe("Ostermontag");
  });
  it("normaler Tag → null", () => {
    expect(getHolidayName("2026-07-14")).toBeNull();
  });
  it("ungültiges Datum → null", () => {
    expect(getHolidayName("kaputt")).toBeNull();
  });
  it("unbekannte Region → null", () => {
    expect(getHolidayName("2026-08-15", "BY")).toBe("Mariä Himmelfahrt");
  });
});
