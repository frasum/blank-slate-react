import { describe, expect, it } from "vitest";
import { articleRowToDraft, draftToArticleUpdateInput, type ArticleRowLike } from "./article-draft";

const FULL_ROW: ArticleRowLike = {
  name: "Riesling trocken",
  sku: "R-001",
  description: "Trocken, mineralisch",
  category: "Weißwein",
  unit: "Flasche",
  price_cents: 2190,
  order_unit: "Kiste",
  inventory_unit: "Flasche",
  order_to_inventory_factor: 2.5,
  min_order_quantity: 1,
  quantity_step: 1,
  allow_decimal_order_quantity: false,
  target_stock_total: 24,
  target_stock_bar: 6,
  locationIds: ["loc-a", "loc-b"],
};

describe("articleRowToDraft ↔ draftToArticleUpdateInput roundtrip", () => {
  it("reproduziert Preis und Faktor 1:1", () => {
    const { draft, locationIds } = articleRowToDraft(FULL_ROW, ["fallback"]);
    expect(draft.priceEuro).toBe("21,90");
    expect(draft.orderToInventoryFactor).toBe("2,5");
    expect(locationIds).toEqual(["loc-a", "loc-b"]);
    const input = draftToArticleUpdateInput(draft);
    expect(input.priceCents).toBe(2190);
    expect(input.orderToInventoryFactor).toBe(2.5);
    expect(input.orderUnit).toBe("Kiste");
    expect(input.inventoryUnit).toBe("Flasche");
    expect(input.targetStockTotal).toBe(24);
    expect(input.targetStockBar).toBe(6);
  });

  it("null-lastige Zeile → leere Strings/Defaults", () => {
    const row: ArticleRowLike = {
      name: "Neu",
      sku: null,
      description: null,
      category: null,
      unit: "Stk",
      price_cents: null,
      order_unit: null,
      inventory_unit: null,
      order_to_inventory_factor: null,
      min_order_quantity: null,
      quantity_step: null,
      allow_decimal_order_quantity: null,
      target_stock_total: null,
      target_stock_bar: null,
    };
    const { draft, locationIds } = articleRowToDraft(row, ["fb1"]);
    expect(draft.sku).toBe("");
    expect(draft.category).toBe("");
    expect(draft.priceEuro).toBe("");
    expect(draft.orderUnit).toBe("Stk");
    expect(draft.inventoryUnit).toBe("Stk");
    expect(draft.orderToInventoryFactor).toBe("1");
    expect(draft.minOrderQuantity).toBe("1");
    expect(draft.quantityStep).toBe("1");
    expect(draft.allowDecimalOrderQuantity).toBe(false);
    expect(draft.targetStockTotal).toBe("");
    expect(locationIds).toEqual(["fb1"]);
    const input = draftToArticleUpdateInput(draft);
    expect(input.priceCents).toBe(0);
    expect(input.targetStockTotal).toBeNull();
    expect(input.targetStockBar).toBeNull();
  });

  it("fallbackLocationIds greift nur, wenn locationIds fehlt", () => {
    const row: ArticleRowLike = { ...FULL_ROW, locationIds: undefined };
    const { locationIds } = articleRowToDraft(row, ["fb"]);
    expect(locationIds).toEqual(["fb"]);
  });
});
