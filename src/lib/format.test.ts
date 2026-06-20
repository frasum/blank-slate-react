import { describe, it, expect } from "vitest";
import { fmtCents, parseEuroToCents, parseIso, todayIso } from "./format";

describe("fmtCents", () => {
  it("formatiert 0 als 0,00", () => {
    expect(fmtCents(0)).toBe("0,00");
  });
  it("formatiert 12345 als 123,45", () => {
    expect(fmtCents(12345)).toBe("123,45");
  });
  it("formatiert 123456 mit Tausender-Punkt", () => {
    expect(fmtCents(123456)).toBe("1.234,56");
  });
  it("behandelt null als 0,00", () => {
    expect(fmtCents(null)).toBe("0,00");
  });
  it("behandelt undefined als 0,00", () => {
    expect(fmtCents(undefined)).toBe("0,00");
  });
});

describe("parseIso", () => {
  it("liefert mittags-UTC für zeitzonensichere Datumsarithmetik", () => {
    const d = parseIso("2026-03-15");
    expect(d.getUTCHours()).toBe(12);
    expect(d.getUTCFullYear()).toBe(2026);
    expect(d.getUTCMonth()).toBe(2);
    expect(d.getUTCDate()).toBe(15);
  });
});

describe("todayIso", () => {
  it("liefert YYYY-MM-DD", () => {
    const s = todayIso();
    expect(s).toHaveLength(10);
    expect(s).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe("parseEuroToCents", () => {
  it("parst Tausenderpunkt + Dezimalkomma", () => {
    expect(parseEuroToCents("1.234,56")).toBe(123456);
  });
  it("parst Dezimalkomma", () => {
    expect(parseEuroToCents("1,50")).toBe(150);
    expect(parseEuroToCents("12,50")).toBe(1250);
  });
  it("ohne Komma: einzelner Punkt = Dezimaltrenner", () => {
    expect(parseEuroToCents("12.50")).toBe(1250);
  });
  it("ganze Zahl ohne Trenner", () => {
    expect(parseEuroToCents("12")).toBe(1200);
  });
  it("mehrdeutig ohne Komma → null", () => {
    expect(parseEuroToCents("1.234")).toBeNull();
  });
  it("mehrere Punkte mit Komma sind Tausendertrenner", () => {
    expect(parseEuroToCents("1.2.3,45")).toBe(12345);
  });
  it("leere Eingabe respektiert emptyAs", () => {
    expect(parseEuroToCents("", { emptyAs: 0 })).toBe(0);
    expect(parseEuroToCents("")).toBeNull();
  });
  it("negative Werte nur mit allowNegative", () => {
    expect(parseEuroToCents("-5,00", { allowNegative: true })).toBe(-500);
    expect(parseEuroToCents("-5,00")).toBeNull();
  });
  it("lehnt invaliden Input ab", () => {
    expect(parseEuroToCents("abc")).toBeNull();
    expect(parseEuroToCents("1,234")).toBeNull();
  });
  // Charakterisierung der bewussten kasse/abrechnung-Deltas:
  it("akzeptiert jetzt Tausendertrenner in kasse/abrechnung (vorher null)", () => {
    expect(parseEuroToCents("1.234,56", { emptyAs: 0 })).toBe(123456);
  });
  it("lehnt Trailing-Dot jetzt ab (vorher 1200)", () => {
    expect(parseEuroToCents("12.", { emptyAs: 0 })).toBeNull();
  });
});
