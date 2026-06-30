import { describe, it, expect } from "vitest";
import { pillStyle, abbr } from "./pill-style";

describe("abbr", () => {
  it("nimmt die ersten zwei Buchstaben in Großbuchstaben", () => {
    expect(abbr("Cook")).toBe("CO");
  });
  it("liefert leeren String für null/undefined/leer", () => {
    expect(abbr(null)).toBe("");
    expect(abbr(undefined)).toBe("");
    expect(abbr("   ")).toBe("");
  });
});

describe("pillStyle", () => {
  it("Küche mit Skill-Farbe (confirmed) → abgedunkelte Farbe + weißer Text", () => {
    const r = pillStyle({
      skillColor: "#ff0000",
      area: "kitchen",
      label: "CO",
      status: "confirmed",
    });
    expect(r.backgroundColor).toBe("color-mix(in oklab, #ff0000 85%, black)");
    expect(r.textClass).toBe("text-white border-transparent");
  });

  it("Default-Service \"X\" → weiß/schwarz", () => {
    const r = pillStyle({ skillColor: null, area: "service", label: "X", status: "confirmed" });
    expect(r.backgroundColor).toBe("#ffffff");
    expect(r.textClass).toBe("text-black border-transparent");
  });

  it("planned vs. confirmed → mixPct 92 vs. 85", () => {
    const planned = pillStyle({
      skillColor: "#00ff00",
      area: "kitchen",
      label: "CO",
      status: "planned",
    });
    const confirmed = pillStyle({
      skillColor: "#00ff00",
      area: "kitchen",
      label: "CO",
      status: "confirmed",
    });
    expect(planned.backgroundColor).toBe("color-mix(in oklab, #00ff00 92%, black)");
    expect(confirmed.backgroundColor).toBe("color-mix(in oklab, #00ff00 85%, black)");
  });

  it("Service mit Skill (z. B. \"B\") → abgedunkelte Farbe + weißer Text", () => {
    const r = pillStyle({
      skillColor: "#3366ff",
      area: "service",
      label: "B",
      status: "confirmed",
    });
    expect(r.backgroundColor).toBe("color-mix(in oklab, #3366ff 85%, black)");
    expect(r.textClass).toBe("text-white border-transparent");
  });

  it("Küche ohne Skill-Farbe → grauer Fallback", () => {
    const r = pillStyle({ skillColor: null, area: "kitchen", label: "XY", status: "confirmed" });
    expect(r.backgroundColor).toBe("color-mix(in oklab, #9ca3af 85%, black)");
  });
});