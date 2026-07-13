import { describe, it, expect } from "vitest";
import { isValidPinFormat, assertValidPinFormat } from "./pin-format";

describe("PIN-Format", () => {
  it("akzeptiert 6 bis 8 Ziffern (SEC-PIN2)", () => {
    expect(isValidPinFormat("123456")).toBe(true);
    expect(isValidPinFormat("1234567")).toBe(true);
    expect(isValidPinFormat("12345678")).toBe(true);
  });
  it("lehnt zu kurze oder zu lange PINs ab (SEC-PIN2: <6 verboten)", () => {
    expect(isValidPinFormat("1234")).toBe(false);
    expect(isValidPinFormat("12345")).toBe(false);
    expect(isValidPinFormat("123456789")).toBe(false);
    expect(isValidPinFormat("")).toBe(false);
  });
  it("lehnt nicht-numerische Zeichen ab", () => {
    expect(isValidPinFormat("12a456")).toBe(false);
    expect(isValidPinFormat(" 123456")).toBe(false);
    expect(isValidPinFormat("123456 ")).toBe(false);
    expect(isValidPinFormat("1.23456")).toBe(false);
  });
  it("assertValidPinFormat wirft bei ungültigen PINs", () => {
    expect(() => assertValidPinFormat("abc")).toThrow();
    expect(() => assertValidPinFormat("1234")).toThrow();
    expect(() => assertValidPinFormat("123456")).not.toThrow();
  });
});
