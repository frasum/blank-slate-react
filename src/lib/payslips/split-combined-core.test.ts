import { describe, it, expect } from "vitest";
import {
  parsePersoFromPageText,
  parseRunMonth,
  groupPagesByPerso,
  type PageMeta,
} from "./split-combined-core";

const SEQ = [
  "000001",
  "000001",
  "000001",
  "000001",
  "000001",
  "000002",
  "000004",
  "000006",
  "000007",
  "000012",
  "000014",
  "000020",
  "000023",
  "000050",
  "000100",
  "000253",
  "000317",
  "000352",
  "000357",
  "000358",
  "000360",
  "000364",
  "000503",
  "000504",
  "000008",
  "000011",
  "000011",
  "000017",
  "000018",
  "000019",
  "000025",
  "000027",
  "000027",
  "000101",
  "000104",
  "000109",
  "000109",
  "000109",
  "000109",
  "000109",
  "000117",
  "000125",
  "000129",
  "000309",
  "000320",
  "000330",
  "000331",
  "000334",
  "000373",
];

describe("parsePersoFromPageText", () => {
  it("liest 6-stellige perso nach Personal-Nr.", () => {
    expect(parsePersoFromPageText("… Personal-Nr.\n000006 …")).toBe("000006");
  });
  it("liefert null ohne Treffer", () => {
    expect(parsePersoFromPageText("Nichts hier")).toBeNull();
  });
});

describe("parseRunMonth", () => {
  it("regulärer Lauf-Monat", () => {
    expect(parseRunMonth("… Mai 2026 …")).toEqual({ year: 2026, month: 5, isKorrektur: false });
  });
  it("Korrektur-Lauf-Monat", () => {
    expect(parseRunMonth("… April 2026 Korrektur in 05.2026 …")).toEqual({
      year: 2026,
      month: 5,
      isKorrektur: true,
    });
  });
  it("null bei unbekanntem Text", () => {
    expect(parseRunMonth("kein Monat")).toBeNull();
  });
});

describe("groupPagesByPerso (Golden Master Mai 2026)", () => {
  const metas: PageMeta[] = SEQ.map((perso, i) => ({
    page: i,
    perso,
    runYear: 2026,
    runMonth: 5,
  }));
  const { groups, unparsablePages } = groupPagesByPerso(metas);

  it("49 Seiten → 39 Mitarbeiter, keine unparsablen", () => {
    expect(SEQ.length).toBe(49);
    expect(groups.length).toBe(39);
    expect(unparsablePages).toEqual([]);
  });

  it("Mehrseiten-Gruppen korrekt", () => {
    const byPerso = new Map(groups.map((g) => [g.perso, g]));
    expect(byPerso.get("000001")!.pages).toEqual([0, 1, 2, 3, 4]);
    expect(byPerso.get("000011")!.pages).toEqual([25, 26]);
    expect(byPerso.get("000027")!.pages).toEqual([31, 32]);
    expect(byPerso.get("000109")!.pages).toEqual([35, 36, 37, 38, 39]);
  });

  it("alle übrigen Gruppen genau 1 Seite", () => {
    const multi = new Set(["000001", "000011", "000027", "000109"]);
    const singles = groups.filter((g) => !multi.has(g.perso));
    expect(singles.length).toBe(35);
    for (const g of singles) expect(g.pages.length).toBe(1);
  });

  it("Dateiname endet auf -PERSO-2026-05.pdf", () => {
    for (const g of groups) {
      expect(g.year).toBe(2026);
      expect(g.month).toBe(5);
      expect(g.fileName).toBe(`Lohn-${g.perso}-2026-05.pdf`);
      expect(g.fileName.endsWith(`-${g.perso}-2026-05.pdf`)).toBe(true);
    }
  });
});

describe("groupPagesByPerso – unparsable", () => {
  it("Seite ohne perso landet in unparsablePages, in keiner Gruppe", () => {
    const metas: PageMeta[] = [
      { page: 0, perso: "000006", runYear: 2026, runMonth: 5 },
      { page: 1, perso: null, runYear: 2026, runMonth: 5 },
      { page: 2, perso: "000007", runYear: 2026, runMonth: 5 },
    ];
    const { groups, unparsablePages } = groupPagesByPerso(metas);
    expect(unparsablePages).toEqual([1]);
    expect(groups.map((g) => g.perso)).toEqual(["000006", "000007"]);
    expect(groups.every((g) => !g.pages.includes(1))).toBe(true);
  });
});
