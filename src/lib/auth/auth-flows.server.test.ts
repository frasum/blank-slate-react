import { describe, it, expect } from "vitest";
import { validatePinLoginName } from "./auth-flows.server";

describe("validatePinLoginName", () => {
  it("liefert gültige Namen unverändert (inkl. Umlaute/Akzente, Bindestrich, Leerzeichen)", () => {
    expect(validatePinLoginName("Anna")).toBe("Anna");
    expect(validatePinLoginName("Anna-Maria")).toBe("Anna-Maria");
    expect(validatePinLoginName("Lara Müller")).toBe("Lara Müller");
    expect(validatePinLoginName("Renée")).toBe("Renée");
  });

  it("trimmt umschließende Leerzeichen", () => {
    expect(validatePinLoginName("  Anna  ")).toBe("Anna");
  });

  it("lehnt DSL-/Wildcard- und leere Eingaben mit null ab", () => {
    for (const bad of ["a%", "x.eq.1", "a,b", "a*", "a(b)", "a:b", "", "   ", "a\\b"]) {
      expect(validatePinLoginName(bad)).toBeNull();
    }
  });
});