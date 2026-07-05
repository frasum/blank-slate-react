import { describe, expect, it } from "vitest";
import {
  deriveHauptOptions,
  deriveUnterOptions,
  deriveWgOptions,
  matchesHaupt,
  matchesUnter,
  matchesWg,
  type GroupedRow,
} from "./sales-group-filter";

function row(over: Partial<GroupedRow>): GroupedRow {
  return {
    hauptgruppe: null,
    hauptgruppeNr: null,
    untergruppe: null,
    untergruppeNr: null,
    warengruppe: null,
    productGroup: null,
    ...over,
  };
}

describe("deriveHauptOptions", () => {
  it("dedupliziert, sortiert alphabetisch (de) und nutzt Fallback #Nr", () => {
    const rows = [
      row({ hauptgruppe: "Speisen", hauptgruppeNr: 1 }),
      row({ hauptgruppe: "Speisen", hauptgruppeNr: 1 }),
      row({ hauptgruppe: null, hauptgruppeNr: 9 }),
      row({ hauptgruppe: "Getränke", hauptgruppeNr: 2 }),
    ];
    const opts = deriveHauptOptions(rows);
    // Sortierung nach Label unter de-Locale: „Hauptgruppe 9" liegt
    // zwischen „Getränke" und „Speisen".
    expect(opts.map((o) => o.value)).toEqual(["Getränke", "#9", "Speisen"]);
    expect(opts.map((o) => o.label)).toEqual(["Getränke", "Hauptgruppe 9", "Speisen"]);
  });
});

describe("Unter-/WG-Options", () => {
  it("werden analog abgeleitet", () => {
    const rows = [
      row({ untergruppe: "Küche", untergruppeNr: 20, warengruppe: "Pasta", productGroup: 12 }),
      row({ untergruppe: null, untergruppeNr: 30, warengruppe: null, productGroup: 99 }),
    ];
    expect(deriveUnterOptions(rows).map((o) => o.value)).toEqual(["Küche", "#30"]);
    expect(deriveWgOptions(rows).map((o) => o.value)).toEqual(["Pasta", "#99"]);
  });
});

describe("Match-Predicates", () => {
  it("greifen auch bei Fallback #Nr", () => {
    const r = row({ hauptgruppeNr: 9, untergruppeNr: 30, productGroup: 99 });
    expect(matchesHaupt(r, "#9")).toBe(true);
    expect(matchesUnter(r, "#30")).toBe(true);
    expect(matchesWg(r, "#99")).toBe(true);
  });
  it("greifen auf benannten Wert", () => {
    const r = row({ hauptgruppe: "Speisen", untergruppe: "Küche", warengruppe: "Pasta" });
    expect(matchesHaupt(r, "Speisen")).toBe(true);
    expect(matchesUnter(r, "Küche")).toBe(true);
    expect(matchesWg(r, "Pasta")).toBe(true);
  });
});
