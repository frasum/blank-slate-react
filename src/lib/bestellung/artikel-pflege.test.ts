import { describe, it, expect } from "vitest";
import {
  countReviewed,
  groupArticlesBySupplier,
  rowToArticleInput,
  type ArtikelPflegeRow,
  type ArtikelPflegeArticle,
  type ArtikelPflegeSupplier,
} from "./artikel-pflege";

const suppliers: ArtikelPflegeSupplier[] = [
  { id: "s-b", name: "Bäcker", is_active: true },
  { id: "s-a", name: "Adler-Wein", is_active: true },
  { id: "s-inactive", name: "Zzz Alt", is_active: false },
];

const articles: ArtikelPflegeArticle[] = [
  { id: "a1", supplier_id: "s-a", name: "Riesling", is_active: true, reviewed_at: null },
  {
    id: "a2",
    supplier_id: "s-a",
    name: "Chardonnay",
    is_active: true,
    reviewed_at: "2026-07-21T10:00:00Z",
  },
  { id: "a3", supplier_id: "s-a", name: "Alt-Chianti", is_active: false, reviewed_at: null },
  { id: "a4", supplier_id: "s-b", name: "Brötchen", is_active: true, reviewed_at: null },
];

describe("countReviewed", () => {
  it("zählt nur Artikel mit reviewed_at", () => {
    expect(countReviewed(articles)).toBe(1);
  });
  it("leere Liste = 0", () => {
    expect(countReviewed([])).toBe(0);
  });
});

describe("groupArticlesBySupplier", () => {
  it("Lieferanten alphabetisch, inaktive Lieferanten raus", () => {
    const groups = groupArticlesBySupplier(articles, suppliers, { showInactive: false });
    expect(groups.map((g) => g.supplierName)).toEqual(["Adler-Wein", "Bäcker"]);
  });

  it("Artikel innerhalb alphabetisch, inaktive Artikel per Default raus", () => {
    const groups = groupArticlesBySupplier(articles, suppliers, { showInactive: false });
    const adler = groups.find((g) => g.supplierId === "s-a")!;
    expect(adler.articles.map((a) => a.name)).toEqual(["Chardonnay", "Riesling"]);
    expect(adler.reviewedCount).toBe(1);
  });

  it("showInactive=true nimmt inaktive Artikel und ihren geprüft-Zähler mit", () => {
    const groups = groupArticlesBySupplier(articles, suppliers, { showInactive: true });
    const adler = groups.find((g) => g.supplierId === "s-a")!;
    expect(adler.articles.map((a) => a.name)).toEqual(["Alt-Chianti", "Chardonnay", "Riesling"]);
    expect(adler.reviewedCount).toBe(1);
  });

  it("Lieferant ohne Artikel wird als leere Gruppe mit 0/0 geliefert", () => {
    const groups = groupArticlesBySupplier([], suppliers, { showInactive: false });
    expect(groups).toHaveLength(2);
    for (const g of groups) {
      expect(g.articles).toEqual([]);
      expect(g.reviewedCount).toBe(0);
    }
  });
});

describe("rowToArticleInput", () => {
  const fullRow: ArtikelPflegeRow = {
    id: "aa",
    supplier_id: "sup-1",
    name: "Riesling",
    is_active: true,
    reviewed_at: null,
    sku: "R-001",
    description: "Trocken",
    category: "Wein",
    unit: "Fl",
    price_cents: 1290,
    packaging_unit: 6,
    order_unit: "Kiste",
    inventory_unit: "Fl",
    order_to_inventory_factor: 6,
    quantity_step: 1,
    allow_decimal_order_quantity: false,
    min_order_quantity: 1,
    target_stock_total: 24,
    target_stock_bar: 6,
    image_url: "https://x/y.jpg",
    sort_order: 10,
    grape_variety: "Riesling",
    origin_country: "DE",
    food_pairings: "Fisch",
    special_attributes: ["bio"],
    locationIds: ["loc-a", "loc-b"],
  };

  it("mappt jedes Feld 1:1 (snake→camel) und übernimmt locationIds", () => {
    const out = rowToArticleInput(fullRow);
    expect(out).toEqual({
      supplierId: "sup-1",
      name: "Riesling",
      sku: "R-001",
      description: "Trocken",
      category: "Wein",
      unit: "Fl",
      priceCents: 1290,
      orderUnit: "Kiste",
      inventoryUnit: "Fl",
      orderToInventoryFactor: 6,
      quantityStep: 1,
      allowDecimalOrderQuantity: false,
      minOrderQuantity: 1,
      targetStockTotal: 24,
      targetStockBar: 6,
      imageUrl: "https://x/y.jpg",
      sortOrder: 10,
      grapeVariety: "Riesling",
      originCountry: "DE",
      foodPairings: "Fisch",
      specialAttributes: ["bio"],
      locationIds: ["loc-a", "loc-b"],
    });
  });

  it("lässt packagingUnit weg (AK3: DB-Wert bleibt)", () => {
    const out = rowToArticleInput(fullRow) as Record<string, unknown>;
    expect("packagingUnit" in out).toBe(false);
  });

  it('nullbare Strings werden zu ""', () => {
    const out = rowToArticleInput({
      ...fullRow,
      sku: null,
      description: null,
      category: null,
      image_url: null,
      grape_variety: null,
      origin_country: null,
      food_pairings: null,
    });
    expect(out.sku).toBe("");
    expect(out.description).toBe("");
    expect(out.category).toBe("");
    expect(out.imageUrl).toBe("");
    expect(out.grapeVariety).toBe("");
    expect(out.originCountry).toBe("");
    expect(out.foodPairings).toBe("");
  });
});
