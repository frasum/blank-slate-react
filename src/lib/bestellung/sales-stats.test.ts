import { describe, expect, it } from "vitest";
import {
  averagePriceCents,
  enrichSalesStats,
  normalizeName,
  type PosGroupOverride,
  type SalesArticleForJoin,
  type SalesStatRow,
} from "./sales-stats";

function stat(name: string, over: Partial<SalesStatRow> = {}): SalesStatRow {
  return {
    id: over.id ?? `id-${name}`,
    locationId: over.locationId ?? "loc-1",
    period: over.period ?? "d365",
    nummer: over.nummer ?? 1,
    name,
    verkaufCount: over.verkaufCount ?? 1,
    umsatzCents: over.umsatzCents ?? 1000,
    reportDate: over.reportDate ?? "2026-01-01",
  };
}

function article(name: string, over: Partial<SalesArticleForJoin> = {}): SalesArticleForJoin {
  return {
    name,
    warengruppe: over.warengruppe ?? "Pasta",
    productGroup: over.productGroup ?? 12,
    untergruppe: over.untergruppe ?? "Küche",
    untergruppeNr: over.untergruppeNr ?? 20,
    hauptgruppe: over.hauptgruppe ?? "Speisen",
    hauptgruppeNr: over.hauptgruppeNr ?? 1,
  };
}

describe("normalizeName", () => {
  it("trimmt, lowercased mit dt. Locale und kollabiert Whitespace", () => {
    expect(normalizeName("  Spaghetti   Carbonara  ")).toBe("spaghetti carbonara");
    expect(normalizeName("STRAßE")).toBe(normalizeName("straße"));
    expect(normalizeName("Müller")).toBe("müller");
  });
});

describe("enrichSalesStats", () => {
  it("matcht auf normalisiertem Namen und übernimmt Gruppen", () => {
    const { rows, unmatchedCount } = enrichSalesStats(
      [stat("Spaghetti Carbonara")],
      [article("SPAGHETTI  Carbonara", { warengruppe: "Pasta", productGroup: 12 })],
    );
    expect(unmatchedCount).toBe(0);
    expect(rows[0].warengruppe).toBe("Pasta");
    expect(rows[0].productGroup).toBe(12);
    expect(rows[0].hauptgruppeNr).toBe(1);
    expect(rows[0].unmatched).toBe(false);
    expect(rows[0].overridden).toBe(false);
  });

  it("setzt Gruppen auf null wenn kein Treffer und zählt unmatched", () => {
    const { rows, unmatchedCount } = enrichSalesStats(
      [stat("Storno-PLU"), stat("Bekannt")],
      [article("Bekannt")],
    );
    expect(unmatchedCount).toBe(1);
    const storno = rows.find((r) => r.name === "Storno-PLU")!;
    expect(storno.warengruppe).toBeNull();
    expect(storno.hauptgruppeNr).toBeNull();
    expect(storno.unmatched).toBe(true);
    expect(storno.overridden).toBe(false);
  });

  it("Override je Nummer schlägt Namens-Match und markiert overridden", () => {
    const override: PosGroupOverride = {
      nummer: 42,
      warengruppe: "Cocktails",
      productGroup: 99,
      untergruppe: "Bar",
      untergruppeNr: 30,
      hauptgruppe: "Getränke",
      hauptgruppeNr: 2,
    };
    const { rows, unmatchedCount } = enrichSalesStats(
      [
        stat("Unbekannter Artikel", { nummer: 42 }),
        stat("Bekannt", { nummer: 7 }),
      ],
      [article("Bekannt", { warengruppe: "Pasta" })],
      [override],
    );
    expect(unmatchedCount).toBe(0); // Override zählt nicht als unmatched.
    const ov = rows.find((r) => r.nummer === 42)!;
    expect(ov.warengruppe).toBe("Cocktails");
    expect(ov.hauptgruppe).toBe("Getränke");
    expect(ov.hauptgruppeNr).toBe(2);
    expect(ov.overridden).toBe(true);
    expect(ov.unmatched).toBe(false);
  });

  it("Override überschreibt auch existierenden Namens-Treffer", () => {
    const override: PosGroupOverride = {
      nummer: 1,
      warengruppe: "Cocktails",
      productGroup: 99,
      untergruppe: null,
      untergruppeNr: null,
      hauptgruppe: null,
      hauptgruppeNr: null,
    };
    const { rows } = enrichSalesStats(
      [stat("Bekannt", { nummer: 1 })],
      [article("Bekannt", { warengruppe: "Pasta" })],
      [override],
    );
    expect(rows[0].warengruppe).toBe("Cocktails");
    expect(rows[0].overridden).toBe(true);
  });
});

describe("averagePriceCents", () => {
  it("liefert null bei Count 0", () => {
    expect(averagePriceCents(1000, 0)).toBeNull();
  });
  it("rechnet normal", () => {
    expect(averagePriceCents(2000, 4)).toBe(500);
  });
  it("gibt negative Werte durch (Storno/Rabatt)", () => {
    expect(averagePriceCents(-1000, 5)).toBe(-200);
    expect(averagePriceCents(1000, -2)).toBe(-500);
  });
});
