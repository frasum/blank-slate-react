import { describe, it, expect } from "vitest";
import { parseNumberDe } from "./parse-de";

describe("parseNumberDe", () => {
  it("Komma als Dezimaltrenner", () => {
    expect(parseNumberDe("12,90")).toBe(12.9);
  });
  it("Bestandsverhalten: nur letztes Komma zählt, Punkte werden nicht als Tausender behandelt", () => {
    // Historisches Verhalten (`replace(",", ".")`): "1.234,5" → Number("1.234.5") → NaN → null.
    expect(parseNumberDe("1.234,5")).toBeNull();
  });
  it("Punkt als Dezimaltrenner bleibt gültig", () => {
    expect(parseNumberDe("3.14")).toBe(3.14);
  });
  it("Leerer String → null", () => {
    expect(parseNumberDe("   ")).toBeNull();
  });
  it("Müll → null", () => {
    expect(parseNumberDe("abc")).toBeNull();
  });
});
