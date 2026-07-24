// BH1 (24.07.2026) — Unit-Test für die Viertelstunden-Abrundung.
import { describe, it, expect } from "vitest";
import { floorToQuarterHours } from "./zeit-uebersicht-core";

describe("floorToQuarterHours", () => {
  it("volle Viertelstunden bleiben unverändert", () => {
    expect(floorToQuarterHours(30.0)).toBe(30.0);
    expect(floorToQuarterHours(30.25)).toBe(30.25);
    expect(floorToQuarterHours(30.5)).toBe(30.5);
    expect(floorToQuarterHours(30.75)).toBe(30.75);
  });
  it("rundet nach unten auf die nächste Viertelstunde", () => {
    expect(floorToQuarterHours(30.24)).toBe(30.0);
    expect(floorToQuarterHours(30.49)).toBe(30.25);
    expect(floorToQuarterHours(30.99)).toBe(30.75);
    expect(floorToQuarterHours(178.37)).toBe(178.25);
  });
  it("Null und negative Werte werden zu 0", () => {
    expect(floorToQuarterHours(0)).toBe(0);
    expect(floorToQuarterHours(-1.5)).toBe(0);
  });
});
