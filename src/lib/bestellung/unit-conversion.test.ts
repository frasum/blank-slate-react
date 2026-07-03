import { describe, expect, it } from "vitest";
import {
  computeInventoryLineValueCents,
  formatUnitPrice,
  normalizedPriceCents,
  validateOrderQuantity,
} from "./unit-conversion";

describe("normalizedPriceCents", () => {
  it("Coca-Cola: 18,90 € / Kiste bei 24 Flaschen = 78,75 Cent / Flasche", () => {
    expect(normalizedPriceCents(1890, 24)).toBeCloseTo(78.75, 6);
  });
  it("Faktor 1 → unverändert", () => {
    expect(normalizedPriceCents(320, 1)).toBe(320);
  });
  it("factor <= 0 wirft", () => {
    expect(() => normalizedPriceCents(1000, 0)).toThrow();
    expect(() => normalizedPriceCents(1000, -1)).toThrow();
  });
});

describe("computeInventoryLineValueCents", () => {
  it("Coca-Cola-Abnahmefall: 17 Bar + 76 Trockenlager @ 1890/24 = 7324 Cent", () => {
    // 93 * 78,75 = 7323,75 → rounded 7324
    expect(computeInventoryLineValueCents(17, 76, 1890, 24)).toBe(7324);
  });
  it("Faktor 1: 2,5 kg × 3,20 € = 800 Cent", () => {
    expect(computeInventoryLineValueCents(1.5, 1, 320, 1)).toBe(800);
  });
  it("factor <= 0 wirft", () => {
    expect(() => computeInventoryLineValueCents(1, 0, 100, 0)).toThrow();
  });
});

describe("validateOrderQuantity", () => {
  it("Kiste (step 1, min 1, decimal false)", () => {
    const o = { step: 1, min: 1, allowDecimal: false };
    expect(validateOrderQuantity(2, o).ok).toBe(true);
    expect(validateOrderQuantity(0, o).ok).toBe(false);
    expect(validateOrderQuantity(1.5, o).ok).toBe(false);
  });
  it("kg (step 0.5, min 0.5, decimal true)", () => {
    const o = { step: 0.5, min: 0.5, allowDecimal: true };
    expect(validateOrderQuantity(1.5, o).ok).toBe(true);
    expect(validateOrderQuantity(1.3, o).ok).toBe(false);
    expect(validateOrderQuantity(0.4, o).ok).toBe(false);
  });
});

describe("formatUnitPrice", () => {
  it("gleiche Einheiten → einfache Anzeige", () => {
    expect(formatUnitPrice(320, "kg", 1, "kg")).toBe("3,20 € / kg");
  });
  it("Kiste/Flasche → dreiteilig", () => {
    expect(formatUnitPrice(1890, "Kiste", 24, "Flasche")).toContain("18,90 € / Kiste");
    expect(formatUnitPrice(1890, "Kiste", 24, "Flasche")).toContain("1 Kiste = 24 Flasche");
    expect(formatUnitPrice(1890, "Kiste", 24, "Flasche")).toContain("0,7875 € / Flasche");
  });
});