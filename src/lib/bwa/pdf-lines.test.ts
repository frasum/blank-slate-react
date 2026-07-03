import { describe, expect, it } from "vitest";
import { clusterItemsToLines, extractTokenLines, LINE_Y_TOLERANCE } from "./pdf-lines";

describe("clusterItemsToLines", () => {
  it("clustert Items mit minimalem y-Versatz in dieselbe Zeile", () => {
    // eurodata-Realität: Zeilennummer sitzt ~0,5 pt tiefer als der Rest.
    const lines = clusterItemsToLines([
      { x: 20, y: 300.4, s: "47" },
      { x: 60, y: 300.9, s: "Summe" },
      { x: 100, y: 300.9, s: "Sachkosten" },
      { x: 300, y: 300.9, s: "21.611" },
    ]);
    expect(lines).toEqual(["47 Summe Sachkosten 21.611"]);
  });

  it("trennt Zeilen, sobald der y-Abstand die Toleranz übersteigt", () => {
    const lines = clusterItemsToLines([
      { x: 20, y: 310, s: "Zeile-oben" },
      { x: 20, y: 300, s: "Zeile-unten" },
    ]);
    expect(lines).toEqual(["Zeile-oben", "Zeile-unten"]);
  });

  it("liefert Zeilen von oben nach unten (absteigendes y)", () => {
    const lines = clusterItemsToLines([
      { x: 0, y: 100, s: "unten" },
      { x: 0, y: 500, s: "oben" },
      { x: 0, y: 300, s: "mitte" },
    ]);
    expect(lines).toEqual(["oben", "mitte", "unten"]);
  });

  it("sortiert Items innerhalb einer Zeile nach x", () => {
    const lines = clusterItemsToLines([
      { x: 300, y: 200, s: "C" },
      { x: 100, y: 200, s: "A" },
      { x: 200, y: 200, s: "B" },
    ]);
    expect(lines).toEqual(["A B C"]);
  });

  it("filtert leere Zeilen weg", () => {
    const lines = clusterItemsToLines([
      { x: 0, y: 200, s: "   " },
      { x: 0, y: 150, s: "" },
      { x: 0, y: 100, s: "Text" },
    ]);
    expect(lines).toEqual(["Text"]);
  });

  it("Toleranz-Grenze ist exportiert und ≥ 0,5 pt", () => {
    expect(LINE_Y_TOLERANCE).toBeGreaterThanOrEqual(0.5);
  });
});

describe("extractTokenLines", () => {
  it("gruppiert Items nach y in Zeilen und reicht x pro Token durch", () => {
    const lines = extractTokenLines([
      { x: 100, y: 300, s: "A." },
      { x: 300, y: 300, s: "1.000,00" },
      { x: 100, y: 280, s: "I." },
      { x: 300, y: 280, s: "700,00" },
    ]);
    expect(lines).toEqual([
      [
        { text: "A.", x: 100, xEnd: 100 },
        { text: "1.000,00", x: 300, xEnd: 300 },
      ],
      [
        { text: "I.", x: 100, xEnd: 100 },
        { text: "700,00", x: 300, xEnd: 300 },
      ],
    ]);
  });

  it("clustert Items mit minimalem y-Versatz in dieselbe Zeile", () => {
    const lines = extractTokenLines([
      { x: 20, y: 300.4, s: "47" },
      { x: 60, y: 300.9, s: "Summe" },
    ]);
    expect(lines).toEqual([
      [
        { text: "47", x: 20, xEnd: 20 },
        { text: "Summe", x: 60, xEnd: 60 },
      ],
    ]);
  });

  it("verwirft leere Tokens und leere Zeilen", () => {
    const lines = extractTokenLines([
      { x: 20, y: 300, s: "  " },
      { x: 40, y: 300, s: "Text" },
      { x: 20, y: 280, s: "" },
    ]);
    expect(lines).toEqual([[{ text: "Text", x: 40, xEnd: 40 }]]);
  });
});
