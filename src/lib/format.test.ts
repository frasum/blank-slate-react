import { describe, it, expect } from "vitest";
import { fmtCents, parseIso, todayIso } from "./format";

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
