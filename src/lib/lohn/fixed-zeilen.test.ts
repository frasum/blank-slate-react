import { describe, it, expect } from "vitest";
import {
  buildFixedZeilen,
  countDistinctWorkdays,
  mahlzeitSachbezugCent,
} from "./fixed-zeilen";

describe("countDistinctWorkdays", () => {
  it("zählt jeden business_date nur einmal (Splitschicht = 1)", () => {
    expect(countDistinctWorkdays(["2026-05-01", "2026-05-01", "2026-05-02"])).toBe(2);
  });

  it("leer = 0", () => {
    expect(countDistinctWorkdays([])).toBe(0);
  });
});

describe("mahlzeitSachbezugCent", () => {
  it("2026 = 457 Cent", () => {
    expect(mahlzeitSachbezugCent(2026)).toBe(457);
  });

  it("unbekanntes Jahr wirft", () => {
    expect(() => mahlzeitSachbezugCent(2099)).toThrow();
  });
});

describe("buildFixedZeilen", () => {
  it("erzeugt Sachbezug + Mahlzeiten korrekt", () => {
    const zeilen = buildFixedZeilen({
      sachbezugMonthlyCents: 5000,
      mealAllowance: true,
      workdayCount: 19,
      year: 2026,
    });
    expect(zeilen).toHaveLength(2);
    const sb = zeilen.find((z) => z.kategorie === "sachbezug_frei");
    const mz = zeilen.find((z) => z.kategorie === "mahlzeiten_paust");
    expect(sb?.betragCent).toBe(5000);
    expect(mz?.betragCent).toBe(19 * 457);
  });

  it("workdayCount=0 ⇒ keine Mahlzeiten-Zeile, Sachbezug bleibt", () => {
    const zeilen = buildFixedZeilen({
      sachbezugMonthlyCents: 5000,
      mealAllowance: true,
      workdayCount: 0,
      year: 2026,
    });
    expect(zeilen).toHaveLength(1);
    expect(zeilen[0].kategorie).toBe("sachbezug_frei");
  });

  it("sachbezugMonthlyCents=0 ⇒ keine Sachbezug-Zeile", () => {
    const zeilen = buildFixedZeilen({
      sachbezugMonthlyCents: 0,
      mealAllowance: true,
      workdayCount: 10,
      year: 2026,
    });
    expect(zeilen).toHaveLength(1);
    expect(zeilen[0].kategorie).toBe("mahlzeiten_paust");
  });

  it("mealAllowance=false ⇒ keine Mahlzeiten-Zeile", () => {
    const zeilen = buildFixedZeilen({
      sachbezugMonthlyCents: 5000,
      mealAllowance: false,
      workdayCount: 20,
      year: 2026,
    });
    expect(zeilen).toHaveLength(1);
    expect(zeilen[0].kategorie).toBe("sachbezug_frei");
  });
});