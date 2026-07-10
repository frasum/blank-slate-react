import { describe, expect, it } from "vitest";
import { buildBankStats, type StatsTx } from "./bank-stats-core";

const cats = new Map<string, string>([
  ["c-karte", "Kartenumsatz"],
  ["c-ware", "Wareneinsatz"],
]);

function tx(part: Partial<StatsTx>): StatsTx {
  return {
    buchungstag: "2026-01-01",
    betragCents: 100,
    saldoCents: null,
    gegenpartei: "",
    categoryId: null,
    ...part,
  };
}

describe("buildBankStats", () => {
  it("aggregiert Ein-/Ausgänge, Netto und Monate", () => {
    const s = buildBankStats(
      [
        tx({ buchungstag: "2026-01-05", betragCents: 10_000, gegenpartei: "TSB" }),
        tx({
          buchungstag: "2026-01-10",
          betragCents: -3_000,
          gegenpartei: "KAO",
          categoryId: "c-ware",
        }),
        tx({
          buchungstag: "2026-02-01",
          betragCents: -1_500,
          gegenpartei: "KAO",
          categoryId: "c-ware",
        }),
        tx({
          buchungstag: "2026-02-15",
          betragCents: 5_000,
          gegenpartei: "First Data",
          categoryId: "c-karte",
        }),
      ],
      cats,
    );
    expect(s.totalInCents).toBe(15_000);
    expect(s.totalOutCents).toBe(-4_500);
    expect(s.nettoCents).toBe(10_500);
    expect(s.monthly.map((m) => m.month)).toEqual(["2026-01", "2026-02"]);
    expect(s.monthly[0]).toMatchObject({ einCents: 10_000, ausCents: -3_000, nettoCents: 7_000 });
  });

  it("baut Kategorie×Monat-Matrix und stellt Ohne-Kategorie an den Anfang", () => {
    const s = buildBankStats(
      [
        tx({ buchungstag: "2026-01-05", betragCents: 100, categoryId: null, gegenpartei: "X" }),
        tx({
          buchungstag: "2026-01-06",
          betragCents: -50,
          categoryId: "c-ware",
          gegenpartei: "KAO",
        }),
      ],
      cats,
    );
    expect(s.categoryMonth.rows[0].categoryId).toBeNull();
    expect(s.categoryMonth.rows[0].categoryName).toBe("Ohne Kategorie");
    expect(s.categoryMonth.months).toEqual(["2026-01"]);
  });

  it("Top-Gegenparteien getrennt nach Ein/Aus", () => {
    const s = buildBankStats(
      [
        tx({ betragCents: 1_000, gegenpartei: "A" }),
        tx({ betragCents: 2_000, gegenpartei: "A" }),
        tx({ betragCents: 500, gegenpartei: "B" }),
        tx({ betragCents: -800, gegenpartei: "KAO" }),
        tx({ betragCents: -400, gegenpartei: "Piana" }),
      ],
      cats,
    );
    expect(s.topIn[0]).toMatchObject({ name: "A", sumCents: 3_000, count: 2 });
    expect(s.topOut[0]).toMatchObject({ name: "KAO", sumCents: -800 });
  });

  it("Start-/End-Saldo aus erster/letzter Buchung mit Saldo", () => {
    const s = buildBankStats(
      [
        tx({ buchungstag: "2026-01-01", betragCents: -100, saldoCents: 900 }),
        tx({ buchungstag: "2026-01-02", betragCents: 200, saldoCents: 1_100 }),
      ],
      cats,
    );
    expect(s.startSaldoCents).toBe(1000);
    expect(s.endSaldoCents).toBe(1100);
  });
});
