import { describe, it, expect } from "vitest";
import {
  parseOpenInvoiceEntries,
  sumOpenInvoiceEntries,
  formatOpenInvoiceNames,
} from "./open-invoices";

describe("parseOpenInvoiceEntries", () => {
  it("akzeptiert gültige Einträge", () => {
    expect(
      parseOpenInvoiceEntries([
        { name: "Meier", cents: 4500 },
        { name: "  Schulz  ", cents: 0 },
      ]),
    ).toEqual([
      { name: "Meier", cents: 4500 },
      { name: "Schulz", cents: 0 },
    ]);
  });

  it("verwirft kaputte Einträge (kein Name, NaN, negativ, kein Objekt)", () => {
    expect(
      parseOpenInvoiceEntries([
        { name: "", cents: 100 },
        { name: "  ", cents: 100 },
        { name: "A", cents: -1 },
        { name: "B", cents: "abc" },
        null,
        "foo",
        { name: "C" },
      ]),
    ).toEqual([]);
  });

  it("akzeptiert cents als String und rundet", () => {
    expect(
      parseOpenInvoiceEntries([
        { name: "A", cents: "1234" },
        { name: "B", cents: 12.6 },
      ]),
    ).toEqual([
      { name: "A", cents: 1234 },
      { name: "B", cents: 13 },
    ]);
  });

  it("gibt bei nicht-Array leeres Ergebnis zurück", () => {
    expect(parseOpenInvoiceEntries(null)).toEqual([]);
    expect(parseOpenInvoiceEntries({})).toEqual([]);
    expect(parseOpenInvoiceEntries("x")).toEqual([]);
  });
});

describe("sumOpenInvoiceEntries", () => {
  it("summiert cents", () => {
    expect(
      sumOpenInvoiceEntries([
        { name: "A", cents: 1200 },
        { name: "B", cents: 350 },
        { name: "C", cents: 0 },
      ]),
    ).toBe(1550);
  });

  it("leeres Array = 0", () => {
    expect(sumOpenInvoiceEntries([])).toBe(0);
  });
});

describe("formatOpenInvoiceNames", () => {
  it("fügt Namen mit Trenner zusammen, behält Reihenfolge und Duplikate", () => {
    expect(
      formatOpenInvoiceNames([
        { name: "Meier", cents: 100 },
        { name: "Schulz", cents: 200 },
        { name: "Meier", cents: 50 },
      ]),
    ).toBe("Meier · Schulz · Meier");
  });

  it("überspringt leere Namen", () => {
    expect(
      formatOpenInvoiceNames([
        { name: "A", cents: 1 },
        { name: "   ", cents: 1 },
        { name: "B", cents: 1 },
      ]),
    ).toBe("A · B");
  });

  it("leeres Array = leerer String", () => {
    expect(formatOpenInvoiceNames([])).toBe("");
  });
});
