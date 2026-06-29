import { describe, it, expect } from "vitest";
import { resolveCellKind } from "./cell";

describe("resolveCellKind", () => {
  it("Schicht schlägt alles", () => {
    expect(
      resolveCellKind({
        hasShift: true,
        absenceType: "urlaub",
        hasWish: true,
        hasAvailability: true,
      }),
    ).toBe("shift");
  });
  it("Urlaub vor Krank-irrelevant, Urlaub vor Wunsch/Verfügbar", () => {
    expect(
      resolveCellKind({
        hasShift: false,
        absenceType: "urlaub",
        hasWish: true,
        hasAvailability: true,
      }),
    ).toBe("urlaub");
  });
  it("Krank ohne Schicht", () => {
    expect(
      resolveCellKind({
        hasShift: false,
        absenceType: "krank",
        hasWish: false,
        hasAvailability: false,
      }),
    ).toBe("krank");
  });
  it("Wunsch vor Verfügbar", () => {
    expect(
      resolveCellKind({
        hasShift: false,
        absenceType: null,
        hasWish: true,
        hasAvailability: true,
      }),
    ).toBe("wish");
  });
  it("Verfügbar wenn sonst nichts", () => {
    expect(
      resolveCellKind({
        hasShift: false,
        absenceType: null,
        hasWish: false,
        hasAvailability: true,
      }),
    ).toBe("available");
  });
  it("leer als Default", () => {
    expect(
      resolveCellKind({
        hasShift: false,
        absenceType: null,
        hasWish: false,
        hasAvailability: false,
      }),
    ).toBe("empty");
  });
});