import { describe, it, expect } from "vitest";
import { isLocked } from "./time-lock";

describe("isLocked", () => {
  it("null Wasserlinie sperrt nichts", () => {
    expect(isLocked("2026-01-01", null)).toBe(false);
  });
  it("Datum ≤ Wasserlinie ist gesperrt", () => {
    expect(isLocked("2026-01-15", "2026-01-15")).toBe(true);
    expect(isLocked("2026-01-14", "2026-01-15")).toBe(true);
  });
  it("Datum > Wasserlinie ist offen", () => {
    expect(isLocked("2026-01-16", "2026-01-15")).toBe(false);
  });
});