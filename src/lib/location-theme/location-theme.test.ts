import { describe, expect, it } from "vitest";
import { locationThemeKey } from "./location-theme";

describe("locationThemeKey", () => {
  it("erkennt Spicery unabhängig von Groß-/Kleinschreibung", () => {
    expect(locationThemeKey("Spicery")).toBe("spicery");
    expect(locationThemeKey("spicery")).toBe("spicery");
    expect(locationThemeKey("  Spicery  ")).toBe("spicery");
  });
  it("erkennt YUM", () => {
    expect(locationThemeKey("YUM")).toBe("yum");
    expect(locationThemeKey("Yum")).toBe("yum");
    expect(locationThemeKey("yum ")).toBe("yum");
  });
  it("liefert neutral für TSB, Alle und leere Namen", () => {
    expect(locationThemeKey("TSB")).toBe("neutral");
    expect(locationThemeKey("Alle")).toBe("neutral");
    expect(locationThemeKey("")).toBe("neutral");
    expect(locationThemeKey(null)).toBe("neutral");
    expect(locationThemeKey(undefined)).toBe("neutral");
  });
});
