import { describe, expect, it } from "vitest";
import { formatDeleteBlockedMessage, isUniqueViolation, mapTaxonomyWriteError } from "./taxonomy";

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
