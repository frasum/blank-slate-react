import { describe, it, expect } from "vitest";
import { midpoint, sortOrderForInsert } from "./sort-order";

describe("midpoint", () => {
  it("leere Nachbarn → 0", () => {
    expect(midpoint(null, null)).toBe(0);
  });
  it("nur Nachfolger → next - 1 (Spaltenanfang)", () => {
    expect(midpoint(null, 5)).toBe(4);
  });
  it("nur Vorgänger → prev + 1 (Spaltenende)", () => {
    expect(midpoint(5, null)).toBe(6);
  });
  it("zwischen zwei Nachbarn → arithmetisches Mittel", () => {
    expect(midpoint(1, 2)).toBe(1.5);
    expect(midpoint(1.5, 2)).toBe(1.75);
  });
});

describe("sortOrderForInsert", () => {
  const col = [{ sort_order: 1 }, { sort_order: 2 }, { sort_order: 3 }];
  it("Anfang (0)", () => expect(sortOrderForInsert(col, 0)).toBe(0));
  it("Mitte (1)", () => expect(sortOrderForInsert(col, 1)).toBe(1.5));
  it("Ende (Länge)", () => expect(sortOrderForInsert(col, 3)).toBe(4));
  it("leere Spalte → 0", () => expect(sortOrderForInsert([], 0)).toBe(0));
  it("Index außerhalb wird geklemmt", () => {
    expect(sortOrderForInsert(col, 99)).toBe(4);
    expect(sortOrderForInsert(col, -5)).toBe(0);
  });
});