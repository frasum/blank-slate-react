import { describe, it, expect } from "vitest";
import { resolveCustomerNumber } from "./customer-number";

describe("resolveCustomerNumber", () => {
  // Zeile mit non-empty customer_number → gewinnt
  it("Standort-Zeile mit Nummer + org-weit gesetzt → Standort", () => {
    expect(resolveCustomerNumber("ORG-1", { customer_number: "LOC-1" })).toBe("LOC-1");
  });
  it("Standort-Zeile mit Nummer + org-weit NULL → Standort", () => {
    expect(resolveCustomerNumber(null, { customer_number: "LOC-1" })).toBe("LOC-1");
  });

  // Zeile mit NULL → Fallback
  it("Standort-Zeile NULL + org-weit gesetzt → org-weit", () => {
    expect(resolveCustomerNumber("ORG-1", { customer_number: null })).toBe("ORG-1");
  });
  it("Standort-Zeile NULL + org-weit NULL → null", () => {
    expect(resolveCustomerNumber(null, { customer_number: null })).toBeNull();
  });

  // Zeile mit Leerstring → Fallback
  it("Standort-Zeile Leerstring + org-weit gesetzt → org-weit", () => {
    expect(resolveCustomerNumber("ORG-1", { customer_number: "   " })).toBe("ORG-1");
  });
  it("Standort-Zeile Leerstring + org-weit NULL → null", () => {
    expect(resolveCustomerNumber(null, { customer_number: "" })).toBeNull();
  });

  // Keine Zeile → Fallback
  it("keine Zeile + org-weit gesetzt → org-weit", () => {
    expect(resolveCustomerNumber("ORG-1", null)).toBe("ORG-1");
    expect(resolveCustomerNumber("ORG-1", undefined)).toBe("ORG-1");
  });
  it("keine Zeile + org-weit NULL → null", () => {
    expect(resolveCustomerNumber(null, null)).toBeNull();
    expect(resolveCustomerNumber(undefined, undefined)).toBeNull();
  });

  // org-weit Leerstring wird ebenfalls wie NULL behandelt
  it("Standort-Zeile NULL + org-weit Leerstring → null", () => {
    expect(resolveCustomerNumber("  ", { customer_number: null })).toBeNull();
  });
});