import { describe, expect, it } from "vitest";
import {
  computeUnknownTaxonomyValues,
  formatDeleteBlockedMessage,
  isUniqueViolation,
  mapTaxonomyWriteError,
  validateMergePair,
} from "./taxonomy";

describe("taxonomy helpers", () => {
  it("erkennt Postgres 23505 als Unique-Violation", () => {
    expect(isUniqueViolation({ code: "23505", message: "dup" })).toBe(true);
    expect(isUniqueViolation({ code: "42P01" })).toBe(false);
    expect(isUniqueViolation(new Error("x"))).toBe(false);
    expect(isUniqueViolation(null)).toBe(false);
  });

  it("mappt Unique-Violation zu verständlichem Text", () => {
    const err = mapTaxonomyWriteError({ code: "23505" }, "category", "Kaffee");
    expect(err.message).toBe("Kategorie „Kaffee“ existiert bereits.");
    const err2 = mapTaxonomyWriteError({ code: "23505" }, "unit", "kg");
    expect(err2.message).toBe("Einheit „kg“ existiert bereits.");
  });

  it("reicht andere Fehler unverändert weiter", () => {
    const orig = new Error("Netz weg");
    expect(mapTaxonomyWriteError(orig, "unit", "x")).toBe(orig);
  });

  it("formatiert Delete-Guard-Meldung mit korrekter Pluralform", () => {
    expect(formatDeleteBlockedMessage("category", "Wein", 1)).toBe(
      "Kategorie „Wein“ wird von 1 Artikel verwendet — erst zusammenlegen.",
    );
    expect(formatDeleteBlockedMessage("unit", "kg", 4)).toBe(
      "Einheit „kg“ wird von 4 Artikeln verwendet — erst zusammenlegen.",
    );
  });
});

describe("validateMergePair", () => {
  it("akzeptiert unterschiedliche Einträge gleichen Kinds", () => {
    expect(
      validateMergePair({ id: "a", kind: "category" }, { id: "b", kind: "category" }),
    ).toBeNull();
  });
  it("lehnt fehlende Einträge ab", () => {
    expect(validateMergePair(null, { id: "b", kind: "unit" })).toBeInstanceOf(Error);
    expect(validateMergePair({ id: "a", kind: "unit" }, undefined)).toBeInstanceOf(Error);
  });
  it("lehnt gemischte Kinds ab", () => {
    const err = validateMergePair({ id: "a", kind: "category" }, { id: "b", kind: "unit" });
    expect(err?.message).toMatch(/Kategorien und Einheiten/);
  });
  it("lehnt identische Einträge ab", () => {
    const err = validateMergePair({ id: "a", kind: "unit" }, { id: "a", kind: "unit" });
    expect(err?.message).toMatch(/nicht identisch/);
  });
});

describe("computeUnknownTaxonomyValues", () => {
  const taxonomy = [
    { kind: "category" as const, name: "Wein" },
    { kind: "unit" as const, name: "kg" },
    { kind: "unit" as const, name: "Flasche" },
  ];
  it("erkennt Werte, die nicht in der Liste stehen (case-/whitespace-insensitiv)", () => {
    const res = computeUnknownTaxonomyValues(
      [
        { category: "Wein", order_unit: "kg", inventory_unit: "kg" },
        { category: " wein ", order_unit: "KG", inventory_unit: "Flasche" },
        { category: "Kaffee", order_unit: "Sack", inventory_unit: "g" },
        { category: "Kaffee", order_unit: "Sack", inventory_unit: null },
      ],
      taxonomy,
    );
    expect(res.categories).toEqual([{ name: "Kaffee", count: 2 }]);
    // Sack: 2× (aus order_unit), g: 1× (aus inventory_unit). Sortiert nach Zahl absteigend.
    expect(res.units).toEqual([
      { name: "Sack", count: 2 },
      { name: "g", count: 1 },
    ]);
  });
  it("liefert leere Reports, wenn alles bekannt ist", () => {
    const res = computeUnknownTaxonomyValues(
      [{ category: "Wein", order_unit: "kg", inventory_unit: "Flasche" }],
      taxonomy,
    );
    expect(res.categories).toEqual([]);
    expect(res.units).toEqual([]);
  });
});
