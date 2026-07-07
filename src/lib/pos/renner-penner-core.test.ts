import { describe, expect, it } from "vitest";
import {
  aggregateRennerPenner,
  matchesGroupFilter,
  type RennerRawRow,
} from "./renner-penner-core";

function row(overrides: Partial<RennerRawRow>): RennerRawRow {
  return {
    nummer: 1,
    name: "Artikel",
    hauptgruppe: "Wein",
    warengruppe: "Weißwein",
    verkaufCount: 1,
    umsatzCents: 500,
    ekSourceArticleId: null,
    ekPortionMl: null,
    ekSourceVolumeMl: null,
    ekPriceCents: null,
    priceCents: null,
    ...overrides,
  };
}

describe("aggregateRennerPenner", () => {
  it("bündelt Zeilen mit gleicher ek_source_article_id", () => {
    const src = "wein-a";
    const rows: RennerRawRow[] = [
      row({
        nummer: 100,
        name: "Grüner Veltliner 0,1l",
        verkaufCount: 120,
        umsatzCents: 54000,
        ekSourceArticleId: src,
        ekPortionMl: 100,
        ekSourceVolumeMl: 750,
        ekPriceCents: 100,
      }),
      row({
        nummer: 101,
        name: "Grüner Veltliner 0,2l",
        verkaufCount: 63,
        umsatzCents: 56700,
        ekSourceArticleId: src,
        ekPortionMl: 200,
        ekSourceVolumeMl: 750,
        ekPriceCents: 200,
      }),
      row({
        nummer: 102,
        name: "Grüner Veltliner Flasche 0,75l",
        verkaufCount: 12,
        umsatzCents: 42000,
        ekSourceArticleId: src,
        ekPortionMl: 750,
        ekSourceVolumeMl: 750,
        ekPriceCents: 750,
      }),
    ];
    const { entries } = aggregateRennerPenner(rows, []);
    expect(entries).toHaveLength(1);
    const e = entries[0];
    expect(e.key).toBe(src);
    // kürzester Name gewinnt (0,1l und 0,2l gleich lang → erster genommen)
    expect(e.name).toBe("Grüner Veltliner 0,1l");
    expect(e.einheitenGesamt).toBe(195);
    expect(e.umsatzCents).toBe(152700);
    expect(e.components).toHaveLength(3);
    // Offene Gläser = Portion < Gebinde: 120 + 63
    expect(e.offeneGlaeserCount).toBe(183);
    expect(e.flaschenCount).toBe(12);
    // Vol = 120*100 + 63*200 + 12*750 = 12000+12600+9000 = 33600 ml → 33600/750 = 44.8
    expect(e.volumenMl).toBe(33600);
    expect(e.flaschenAequivalent).toBeCloseTo(44.8, 5);
    // WE = 120*100 + 63*200 + 12*750 = 33600 c
    expect(e.wareneinsatzCents).toBe(33600);
    expect(e.dbCents).toBe(152700 - 33600);
  });

  it("belässt Zeilen ohne EK-Link als eigene Einträge", () => {
    const rows = [
      row({ nummer: 1, name: "A", verkaufCount: 3, umsatzCents: 900 }),
      row({ nummer: 2, name: "B", verkaufCount: 5, umsatzCents: 1500 }),
    ];
    const { entries } = aggregateRennerPenner(rows, []);
    expect(entries).toHaveLength(2);
    expect(entries[0].components).toHaveLength(1);
    expect(entries[0].wareneinsatzCents).toBeNull();
    expect(entries[0].flaschenAequivalent).toBeNull();
    expect(entries[0].ekwPct).toBeNull();
  });

  it("EKW übernimmt zentrale Formel (EK netto ÷ VK netto × 100)", () => {
    // Ein einzelner Verkauf: EK 100c, VK 500c → VKnetto = 500/1.19 ≈ 420.17
    // → 100/420.17 ≈ 23.8 %
    const rows = [
      row({
        nummer: 1,
        name: "X",
        verkaufCount: 1,
        umsatzCents: 500,
        ekSourceArticleId: "src",
        ekPortionMl: 40,
        ekSourceVolumeMl: 700,
        ekPriceCents: 100,
      }),
    ];
    const { entries } = aggregateRennerPenner(rows, []);
    expect(entries[0].ekwPct).toBeCloseTo(23.8, 1);
  });

  it("Ladenhüter = aktive Artikel ohne Stats-Zeile", () => {
    const rows = [row({ nummer: 10 }), row({ nummer: 11 })];
    const arts = [
      { nummer: 10, name: "A", hauptgruppe: "Wein", warengruppe: null },
      { nummer: 12, name: "C", hauptgruppe: "Wein", warengruppe: null },
      { nummer: 13, name: "D", hauptgruppe: "Wein", warengruppe: null },
    ];
    const { ladenhueter } = aggregateRennerPenner(rows, arts);
    expect(ladenhueter.map((l) => l.nummer)).toEqual([12, 13]);
  });
});

describe("matchesGroupFilter", () => {
  it("leere Auswahl matched alles", () => {
    expect(matchesGroupFilter({ hauptgruppe: "Wein", warengruppe: "Rot" }, [])).toBe(true);
  });
  it("matched hauptgruppe case-insensitiv", () => {
    expect(matchesGroupFilter({ hauptgruppe: "Wein", warengruppe: null }, ["wein"])).toBe(true);
  });
  it("matched warengruppe wenn hauptgruppe leer", () => {
    expect(
      matchesGroupFilter({ hauptgruppe: null, warengruppe: "Cocktails" }, ["Cocktails"]),
    ).toBe(true);
  });
  it("no match", () => {
    expect(matchesGroupFilter({ hauptgruppe: "Bier", warengruppe: null }, ["Wein"])).toBe(false);
  });
});