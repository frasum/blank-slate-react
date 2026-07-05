import { describe, expect, it } from "vitest";
import {
  averagePriceCents,
  enrichSalesStats,
  normalizeName,
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
