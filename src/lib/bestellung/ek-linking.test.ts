import { describe, expect, it } from "vitest";
import {
  computeEkFromLink,
  parsePortionMlFromName,
  parseVolumeMlFromName,
  wareneinsatzQuote,
} from "./ek-linking";

describe("computeEkFromLink", () => {
  it("4 cl aus 1,0-l-Flasche zu 15,20 € → 0,61 € (gerundet)", () => {
    const r = computeEkFromLink({
      sourcePriceCents: 1520,
      portionMl: 40,
      sourceVolumeMl: 1000,
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.ekCents).toBe(61);
  });

  it("0,2 l aus 0,75-l-Flasche zu 6,00 € → 1,60 € (gerundet)", () => {
    const r = computeEkFromLink({
      sourcePriceCents: 600,
      portionMl: 200,
      sourceVolumeMl: 750,
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.ekCents).toBe(160);
  });

  it("1:1 (beide ml NULL) → sourcePrice übernommen", () => {
    const r = computeEkFromLink({
      sourcePriceCents: 1234,
      portionMl: null,
      sourceVolumeMl: null,
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.ekCents).toBe(1234);
      expect(r.ratio).toBe(1);
    }
  });

  it("Kaufmännische Rundung: 3 × 100 / 7 = 42,857… → 43 Cent", () => {
    const r = computeEkFromLink({
      sourcePriceCents: 100,
      portionMl: 3,
      sourceVolumeMl: 7,
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.ekCents).toBe(43);
  });

  it("Portion > Gebinde wird verweigert", () => {
    const r = computeEkFromLink({
      sourcePriceCents: 500,
      portionMl: 1000,
      sourceVolumeMl: 750,
    });
    expect(r.ok).toBe(false);
  });

  it("Nur eine ml-Angabe → Fehler (Konsistenz mit DB-CHECK)", () => {
    expect(
      computeEkFromLink({ sourcePriceCents: 500, portionMl: 40, sourceVolumeMl: null }).ok,
    ).toBe(false);
    expect(
      computeEkFromLink({ sourcePriceCents: 500, portionMl: null, sourceVolumeMl: 1000 }).ok,
    ).toBe(false);
  });

  it("Negative oder nicht-integer Preise → Fehler", () => {
    expect(
      computeEkFromLink({ sourcePriceCents: -1, portionMl: null, sourceVolumeMl: null }).ok,
    ).toBe(false);
    expect(
      computeEkFromLink({ sourcePriceCents: 1.5, portionMl: null, sourceVolumeMl: null }).ok,
    ).toBe(false);
  });
});

describe("parseVolumeMlFromName", () => {
  it("liest 0,75l → 750", () => {
    expect(parseVolumeMlFromName("Weißwein Blanc 0,75l")).toBe(750);
  });
  it("liest 1,0l → 1000", () => {
    expect(parseVolumeMlFromName("Wodka 1,0l")).toBe(1000);
  });
  it("liest 70cl → 700", () => {
    expect(parseVolumeMlFromName("Rum 70cl")).toBe(700);
  });
  it("liest 500ml → 500", () => {
    expect(parseVolumeMlFromName("Sirup 500 ml")).toBe(500);
  });
  it("keine Angabe → null", () => {
    expect(parseVolumeMlFromName("Kaffee Bohnen")).toBe(null);
  });
});

describe("parsePortionMlFromName", () => {
  it("'4 cl' → 40", () => {
    expect(parsePortionMlFromName("Grappa 4 cl")).toBe(40);
  });
  it("'0,2' → 200 (Gastro-Dezimalliter)", () => {
    expect(parsePortionMlFromName("Wein 0,2")).toBe(200);
  });
  it("'0,5' → 500", () => {
    expect(parsePortionMlFromName("Bier 0,5")).toBe(500);
  });
  it("nackte 5 (ohne Komma) → null", () => {
    expect(parsePortionMlFromName("Espresso 5")).toBe(null);
  });
});

describe("wareneinsatzQuote", () => {
  it("Normalfall: EK 53 ct, VK brutto 490 ct → 12.9 %", () => {
    // VK netto = 490 / 1.19 = 411.7647 → 53 / 411.7647 = 0.12871 → 12.9
    expect(wareneinsatzQuote(53, 490)).toBe(12.9);
  });
  it("EK null → null", () => {
    expect(wareneinsatzQuote(null, 490)).toBe(null);
  });
  it("VK null → null", () => {
    expect(wareneinsatzQuote(53, null)).toBe(null);
  });
  it("VK 0 → null", () => {
    expect(wareneinsatzQuote(53, 0)).toBe(null);
  });
  it("EK 0 → 0", () => {
    expect(wareneinsatzQuote(0, 490)).toBe(0);
  });
  it("vatRate wirkt: 0.07 statt 0.19 verschiebt Ergebnis", () => {
    // VK netto = 490 / 1.07 = 457.9439 → 53 / 457.9439 = 0.11573 → 11.6
    expect(wareneinsatzQuote(53, 490, 0.07)).toBe(11.6);
  });
});
