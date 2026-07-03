// F4b-Fix: extractTokenLines uebernimmt die rechte Kante (xEnd) aus w,
// damit der Bilanz-Parser rechtsbuendige Spalten anhand von xEnd banden kann.
import { describe, expect, it } from "vitest";
import { extractTokenLines } from "./pdf-lines";

describe("extractTokenLines – xEnd via width", () => {
  it("berechnet xEnd = x + w wenn w gesetzt ist", () => {
    const lines = extractTokenLines([
      { x: 100, y: 300, s: "A.", w: 6 },
      { x: 337, y: 300, s: "28.000,00", w: 36 },
    ]);
    expect(lines).toEqual([
      [
        { text: "A.", x: 100, xEnd: 106 },
        { text: "28.000,00", x: 337, xEnd: 373 },
      ],
    ]);
  });
});