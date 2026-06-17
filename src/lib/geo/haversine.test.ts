import { describe, it, expect } from "vitest";
import { distanceMeters } from "./haversine";

describe("distanceMeters", () => {
  it("liefert 0 für identische Punkte", () => {
    expect(distanceMeters(48.137, 11.575, 48.137, 11.575)).toBeCloseTo(0, 5);
  });

  it("misst die ~111 m für 0.001° Breitendifferenz", () => {
    // 1/1000° Breite ≈ 111,2 m unabhängig von der Länge
    const d = distanceMeters(48.137, 11.575, 48.138, 11.575);
    expect(d).toBeGreaterThan(110);
    expect(d).toBeLessThan(113);
  });

  it("liefert ~9.5 km für München-Hbf → München-Marienplatz (Referenz)", () => {
    // Hbf 48.1402,11.5586  ·  Marienplatz 48.1374,11.5755 → ~1,3 km
    const d = distanceMeters(48.1402, 11.5586, 48.1374, 11.5755);
    expect(d).toBeGreaterThan(1200);
    expect(d).toBeLessThan(1400);
  });

  it("ist NaN bei ungültigen Eingaben", () => {
    expect(Number.isNaN(distanceMeters(Number.NaN, 0, 0, 0))).toBe(true);
    expect(Number.isNaN(distanceMeters(0, 0, 0, Number.POSITIVE_INFINITY))).toBe(true);
  });
});