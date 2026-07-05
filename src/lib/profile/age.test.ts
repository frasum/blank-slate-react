import { describe, it, expect } from "vitest";
import { computeAgeYears } from "./age";

describe("computeAgeYears", () => {
  it("vor dem Geburtstag im Jahr → ein Jahr weniger", () => {
    expect(computeAgeYears("1990-06-15", new Date(2026, 5, 14))).toBe(35);
  });
  it("am Geburtstag → volles Jahr", () => {
    expect(computeAgeYears("1990-06-15", new Date(2026, 5, 15))).toBe(36);
  });
  it("nach dem Geburtstag → volles Jahr", () => {
    expect(computeAgeYears("1990-06-15", new Date(2026, 5, 16))).toBe(36);
  });
  it("Schaltjahr 29.02. in Nicht-Schaltjahr → am 28.02. noch nicht, am 01.03. voll", () => {
    expect(computeAgeYears("2000-02-29", new Date(2025, 1, 28))).toBe(24);
    expect(computeAgeYears("2000-02-29", new Date(2025, 2, 1))).toBe(25);
  });
  it("null / leer / ungültig → null", () => {
    expect(computeAgeYears(null)).toBeNull();
    expect(computeAgeYears("")).toBeNull();
    expect(computeAgeYears("nicht-datum")).toBeNull();
    expect(computeAgeYears("2000-13-01")).toBeNull();
    expect(computeAgeYears("2001-02-29")).toBeNull();
  });
  it("Zukunftsdatum → null", () => {
    expect(computeAgeYears("2099-01-01", new Date(2026, 0, 1))).toBeNull();
  });
});
