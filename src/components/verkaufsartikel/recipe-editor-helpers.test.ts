import { describe, expect, it } from "vitest";
import {
  buildCostingCtxFromBundle,
  costingErrorMessage,
  toCostingItems,
  type EditorItem,
} from "./recipe-editor-helpers";
import {
  costRecipeCents,
  costItemsCents,
  MissingContentError,
  UnitMismatchError,
  CycleError,
  MissingDataError,
} from "@/lib/bestellung/recipe-costing";
import type { RecipeCandidateBundle } from "@/lib/bestellung/recipes.functions";

// Mini-Kandidaten-Bundle: 1 Artikel (Mehl, 1 kg im Gebinde), 1 Sub-Rezept.
const bundle: RecipeCandidateBundle = {
  articles: [
    {
      id: "art-mehl",
      name: "Mehl 1 kg",
      supplierName: "Metro",
      priceCents: 100, // 1,00 €
      orderToInventoryFactor: 1,
      contentQuantity: 1000, // 1000 g
      contentUnit: "g",
    },
    {
      id: "art-butter",
      name: "Butter 250 g",
      supplierName: "Metro",
      priceCents: 200,
      orderToInventoryFactor: 1,
      contentQuantity: 250,
      contentUnit: "g",
    },
    {
      id: "art-leer",
      name: "Ohne Inhalt",
      supplierName: null,
      priceCents: 500,
      orderToInventoryFactor: 1,
      contentQuantity: null,
      contentUnit: null,
    },
  ],
  recipes: [
    {
      id: "sub-teig",
      name: "Teig",
      kind: "sub",
      yieldQuantity: 1000,
      yieldUnit: "g",
      items: [
        {
          id: "i1",
          position: 0,
          articleId: "art-mehl",
          subRecipeId: null,
          quantity: 600,
          unit: "g",
          lossPercent: 0,
        },
        {
          id: "i2",
          position: 1,
          articleId: "art-butter",
          subRecipeId: null,
          quantity: 400,
          unit: "g",
          lossPercent: 0,
        },
      ],
    },
  ],
};

describe("buildCostingCtxFromBundle", () => {
  it("mappt Artikel und Sub-Rezepte in einen nutzbaren CostingCtx", () => {
    const ctx = buildCostingCtxFromBundle(bundle);
    expect(ctx.articles.size).toBe(3);
    expect(ctx.recipes.size).toBe(1);
    expect(ctx.subs.size).toBe(1);
    // 600 g Mehl (0,1 ct/g × 600) + 400 g Butter (0,8 ct/g × 400) = 60 + 320 = 380 ct
    expect(costRecipeCents("sub-teig", ctx)).toBe(380);
  });

  it("liefert exakt dieselbe Summe wie zeilenweises costItemsCents", () => {
    const ctx = buildCostingCtxFromBundle(bundle);
    const items: EditorItem[] = [
      {
        key: "a",
        articleId: "art-mehl",
        subRecipeId: null,
        quantity: 100,
        unit: "g",
        lossPercent: 0,
      },
      {
        key: "b",
        articleId: "art-butter",
        subRecipeId: null,
        quantity: 100,
        unit: "g",
        lossPercent: 0,
      },
    ];
    const line1 = costItemsCents([toCostingItems(items)[0]], ctx);
    const line2 = costItemsCents([toCostingItems(items)[1]], ctx);
    const total = costItemsCents(toCostingItems(items), ctx);
    // 100g × 0,1 ct/g = 10 ct; 100g × 0,8 ct/g = 80 ct
    expect(line1).toBe(10);
    expect(line2).toBe(80);
    expect(total).toBe(line1 + line2);
  });

  it("kann in Zeilenkosten den Anteil je Zutat rechnen (Breakdown)", () => {
    const ctx = buildCostingCtxFromBundle(bundle);
    const items = toCostingItems([
      {
        key: "a",
        articleId: "art-mehl",
        subRecipeId: null,
        quantity: 500,
        unit: "g",
        lossPercent: 0,
      },
      {
        key: "b",
        articleId: "art-butter",
        subRecipeId: null,
        quantity: 500,
        unit: "g",
        lossPercent: 0,
      },
    ]);
    const lines = items.map((it) => costItemsCents([it], ctx));
    const total = lines.reduce((s, n) => s + n, 0);
    const share = lines.map((c) => (100 * c) / total);
    // 50 ct Mehl + 400 ct Butter → Butter dominiert (~89 %).
    expect(Math.round(share[1])).toBe(89);
    expect(Math.round(share[0])).toBe(11);
  });
});

describe("costingErrorMessage", () => {
  it("übersetzt bekannte Fehlerklassen in deutschen Text", () => {
    expect(costingErrorMessage(new MissingContentError("art-leer"))).toMatch(/art-leer/);
    expect(costingErrorMessage(new UnitMismatchError("i1", "g", "ml"))).toMatch(/„g"/);
    expect(costingErrorMessage(new CycleError(["a", "b", "a"]))).toMatch(/a → b → a/);
    expect(costingErrorMessage(new MissingDataError("Artikel", "x"))).toMatch(/Artikel x/);
    expect(costingErrorMessage(new Error("boom"))).toBe("boom");
    expect(costingErrorMessage("string")).toMatch(/fehlgeschlagen/);
  });
});
