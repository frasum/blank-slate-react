import { describe, it, expect } from "vitest";
import { sanitizeArticleSearchTerm } from "./articles.functions";

describe("sanitizeArticleSearchTerm", () => {
  it("lässt normale Volltextsuchen unverändert", () => {
    expect(sanitizeArticleSearchTerm("Pad Thai")).toBe("Pad Thai");
  });

  it("erhält SKU-Muster mit Ziffern und Bindestrich", () => {
    expect(sanitizeArticleSearchTerm("ART-12")).toBe("ART-12");
  });

  it("behält Unicode-Buchstaben (Umlaute, Akzente)", () => {
    expect(sanitizeArticleSearchTerm("Lara Müller")).toBe("Lara Müller");
    expect(sanitizeArticleSearchTerm("Renée")).toBe("Renée");
  });

  it("entfernt PostgREST-DSL-Zeichen ohne den Rest zu zerstören", () => {
    const cleaned = sanitizeArticleSearchTerm("a,b(c)*");
    expect(cleaned).toBe("abc");
    expect(cleaned).not.toMatch(/[,().*%_\\:]/);
  });

  it("entfernt ilike-Wildcards und PostgREST-Syntax aus konstruierten Angriffen", () => {
    const cleaned = sanitizeArticleSearchTerm("name.ilike.%x%");
    expect(cleaned).not.toMatch(/[.%]/);
    expect(cleaned).toBe("nameilikex");
  });

  it("liefert leeren String bei reinen Wildcards (Caller lässt Filter weg)", () => {
    expect(sanitizeArticleSearchTerm("%_")).toBe("");
  });

  it("liefert leeren String bei reinem Whitespace", () => {
    expect(sanitizeArticleSearchTerm("   ")).toBe("");
  });

  it("liefert leeren String bei reinen Backslashes", () => {
    expect(sanitizeArticleSearchTerm("\\\\")).toBe("");
  });
});