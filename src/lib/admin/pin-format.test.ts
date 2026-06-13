import { describe, it, expect } from "vitest";
import { isValidPinFormat, assertValidPinFormat } from "./pin-format";

describe("PIN-Format", () => {
  it("akzeptiert 4 bis 8 Ziffern", () => {
    expect(isValidPinFormat("1234")).toBe(true);
    expect(isValidPinFormat("12345")).toBe(true);
    expect(isValidPinFormat("12345678")).toBe(true);
  });
  it("lehnt zu kurze oder zu lange PINs ab", () => {
    expect(isValidPinFormat("123")).toBe(false);
    expect(isValidPinFormat("123456789")).toBe(false);
    expect(isValidPinFormat("")).toBe(false);
  });
  it("lehnt nicht-numerische Zeichen ab", () => {
    expect(isValidPinFormat("12a4")).toBe(false);
    expect(isValidPinFormat(" 1234")).toBe(false);
    expect(isValidPinFormat("1234 ")).toBe(false);
    expect(isValidPinFormat("1.234")).toBe(false);
  });
  it("assertValidPinFormat wirft bei ungültigen PINs", () => {
    expect(() => assertValidPinFormat("abc")).toThrow();
    expect(() => assertValidPinFormat("1234")).not.toThrow();
  });
});
