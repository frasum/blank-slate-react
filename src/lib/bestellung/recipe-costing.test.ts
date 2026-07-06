import { describe, expect, it } from "vitest";
import {
  CycleError,
  DepthError,
  MAX_RECIPE_DEPTH,
  MissingContentError,
  MissingDataError,
  UnitMismatchError,
  costRecipeCents,
  costItemsCents,
  pricePerBaseUnitCents,
  type ArticleData,
  type CostingCtx,
  type RecipeData,
  type RecipeItemData,
  type SubRecipeMeta,
} from "./recipe-costing";

function mkArticle(over: Partial<ArticleData>): ArticleData {
  return {
    id: over.id ?? "a1",
    priceCents: over.priceCents ?? 1000, // 10,00 €
    orderToInventoryFactor: over.orderToInventoryFactor ?? 1,
    contentQuantity: over.contentQuantity ?? 1000,
    contentUnit: over.contentUnit ?? "g",
  };
}

function mkItem(over: Partial<RecipeItemData>): RecipeItemData {
  return {
    id: over.id ?? "i1",
    articleId: over.articleId ?? null,
    subRecipeId: over.subRecipeId ?? null,
    quantity: over.quantity ?? 100,
    unit: over.unit ?? "g",
    lossPercent: over.lossPercent ?? 0,
  };
}

function ctx(
  articles: ArticleData[] = [],
  recipes: RecipeData[] = [],
  subs: SubRecipeMeta[] = [],
): CostingCtx {
  return {
    articles: new Map(articles.map((a) => [a.id, a])),
    recipes: new Map(recipes.map((r) => [r.id, r])),
    subs: new Map(subs.map((s) => [s.id, s])),
  };
}

describe("pricePerBaseUnitCents", () => {
  it("einfach: 10 €/kg → 1 ct/g", () => {
    const a = mkArticle({ priceCents: 1000, orderToInventoryFactor: 1, contentQuantity: 1000 });
    expect(pricePerBaseUnitCents(a)).toBeCloseTo(1, 9);
  });

  it("mit E1-Faktor: Kiste Cola 24 × 330 ml zu 18,90 € → 0,2386 ct/ml", () => {
    // Bestellpreis 1890 ct / Kiste ÷ 24 Flaschen = 78,75 ct/Flasche
    // 78,75 ct/Flasche ÷ 330 ml = 0,23864 ct/ml
    const a = mkArticle({
      priceCents: 1890,
      orderToInventoryFactor: 24,
      contentQuantity: 330,
      contentUnit: "ml",
    });
    expect(pricePerBaseUnitCents(a)).toBeCloseTo(78.75 / 330, 9);
  });

  it("fehlt content_* → MissingContentError", () => {
    const a = mkArticle({ contentQuantity: null, contentUnit: null });
    expect(() => pricePerBaseUnitCents(a)).toThrow(MissingContentError);
  });
});

describe("costRecipeCents — Verlust-Formel", () => {
  it("10 % Verlust ⇒ ÷0,9, nicht ×1,1 (klassischer Rechenfehler)", () => {
    // 100 g × 1 ct/g = 100 ct, / 0,9 = 111,11 → gerundet 111
    const a = mkArticle({ id: "a1" });
    const r: RecipeData = {
      id: "r1",
      items: [mkItem({ articleId: "a1", quantity: 100, unit: "g", lossPercent: 10 })],
    };
    expect(costRecipeCents("r1", ctx([a], [r]))).toBe(111);
    // ×1,1 wäre 110 → darf NICHT rauskommen.
    expect(costRecipeCents("r1", ctx([a], [r]))).not.toBe(110);
  });

  it("loss_percent 0 = keine Verteuerung", () => {
    const a = mkArticle({ id: "a1" });
    const r: RecipeData = {
      id: "r1",
      items: [mkItem({ articleId: "a1", quantity: 100, lossPercent: 0 })],
    };
    expect(costRecipeCents("r1", ctx([a], [r]))).toBe(100);
  });

  it("loss_percent 90 = ×10 (Randfall)", () => {
    // 100 g × 1 ct/g / 0,1 = 1000 ct
    const a = mkArticle({ id: "a1" });
    const r: RecipeData = {
      id: "r1",
      items: [mkItem({ articleId: "a1", quantity: 100, lossPercent: 90 })],
    };
    expect(costRecipeCents("r1", ctx([a], [r]))).toBe(1000);
  });
});

describe("costRecipeCents — Sub-Kaskade", () => {
  it("zwei Ebenen: Currypaste (sub) in Currygericht", () => {
    // Sub: 500 g Currypaste aus 400 g Zwiebel @ 1 ct/g + 100 g Chili @ 5 ct/g
    //  → Zwiebel: 400 ct, Chili: 500 ct, Sub-Total: 900 ct, Yield 500 g
    //  → 1,8 ct/g Currypaste
    // Dish: 50 g Paste + 200 g Reis @ 0,5 ct/g
    //  → Paste 90 ct, Reis 100 ct, Total 190 ct
    const zwiebel = mkArticle({ id: "zw", priceCents: 1000, contentQuantity: 1000 }); // 1 ct/g
    const chili = mkArticle({ id: "ch", priceCents: 5000, contentQuantity: 1000 }); // 5 ct/g
    const reis = mkArticle({ id: "re", priceCents: 500, contentQuantity: 1000 }); // 0,5 ct/g

    const sub: RecipeData = {
      id: "sub-paste",
      items: [
        mkItem({ id: "s1", articleId: "zw", quantity: 400, unit: "g" }),
        mkItem({ id: "s2", articleId: "ch", quantity: 100, unit: "g" }),
      ],
    };
    const dish: RecipeData = {
      id: "dish-curry",
      items: [
        mkItem({ id: "d1", subRecipeId: "sub-paste", quantity: 50, unit: "g" }),
        mkItem({ id: "d2", articleId: "re", quantity: 200, unit: "g" }),
      ],
    };
    const c = ctx(
      [zwiebel, chili, reis],
      [sub, dish],
      [{ id: "sub-paste", yieldQuantity: 500, yieldUnit: "g" }],
    );
    expect(costRecipeCents("dish-curry", c)).toBe(190);
  });

  it("Rundung NUR am Ende: Sub liefert krumme Zwischenkosten", () => {
    // 3 ct auf 7 g Yield = 0,4285714… ct/g. Dish nutzt 7 g → 3 ct genau
    // (mit Rundung erst am Ende). Würde jede Ebene runden, käme 0 ct raus
    // (0,43 gerundet auf Ebene, ×7 = 3,01), Test würde noch stimmen — deshalb
    // mit einer bewusst pathologischen Zahl:
    // Sub: 1 g × 1 ct/g = 1 ct, Yield 3 g → 0,3333 ct/g. Dish 6 g → 2 ct.
    // Mit Zwischenrundung: 0 ct/g × 6 = 0 ct.
    const a = mkArticle({ id: "a1", priceCents: 100, contentQuantity: 100 }); // 1 ct/g
    const sub: RecipeData = {
      id: "s",
      items: [mkItem({ id: "si", articleId: "a1", quantity: 1, unit: "g" })],
    };
    const dish: RecipeData = {
      id: "d",
      items: [mkItem({ id: "di", subRecipeId: "s", quantity: 6, unit: "g" })],
    };
    const c = ctx([a], [sub, dish], [{ id: "s", yieldQuantity: 3, yieldUnit: "g" }]);
    // 1/3 × 6 = 2. Ganze Cent.
    expect(costRecipeCents("d", c)).toBe(2);
  });
});

describe("costRecipeCents — Zyklen und Tiefe", () => {
  it("direkter Zyklus: A → A wird durch DB-CHECK verhindert, aber Kern fängt manipulierten Input", () => {
    // Wir simulieren einen manipulierten Kontext, in dem items sub_recipe_id
    // auf die eigene Rezept-ID zeigen. Der Kern MUSS das fangen.
    const a = mkArticle({ id: "a1" });
    const r: RecipeData = {
      id: "r-loop",
      items: [mkItem({ id: "i1", subRecipeId: "r-loop", quantity: 1, unit: "g" })],
    };
    const c = ctx([a], [r], [{ id: "r-loop", yieldQuantity: 1, yieldUnit: "g" }]);
    expect(() => costRecipeCents("r-loop", c)).toThrow(CycleError);
  });

  it("transitiver Zyklus A → B → A", () => {
    const a: RecipeData = {
      id: "a",
      items: [mkItem({ id: "ai", subRecipeId: "b", quantity: 1, unit: "g" })],
    };
    const b: RecipeData = {
      id: "b",
      items: [mkItem({ id: "bi", subRecipeId: "a", quantity: 1, unit: "g" })],
    };
    const c = ctx(
      [],
      [a, b],
      [
        { id: "a", yieldQuantity: 1, yieldUnit: "g" },
        { id: "b", yieldQuantity: 1, yieldUnit: "g" },
      ],
    );
    expect(() => costRecipeCents("a", c)).toThrow(CycleError);
  });

  it("Tiefenlimit greift bei linearer Kette länger als MAX_RECIPE_DEPTH", () => {
    // Kette: r0 → r1 → r2 → r3 → r4 → r5 → r6 (7 Ebenen; MAX = 5)
    const chainLen = MAX_RECIPE_DEPTH + 2;
    const recipes: RecipeData[] = [];
    const subs: SubRecipeMeta[] = [];
    for (let i = 0; i < chainLen; i += 1) {
      const nextId = i < chainLen - 1 ? `r${i + 1}` : null;
      recipes.push({
        id: `r${i}`,
        items:
          nextId === null
            ? [
                mkItem({
                  id: `leaf${i}`,
                  articleId: "a1",
                  quantity: 1,
                  unit: "g",
                }),
              ]
            : [
                mkItem({
                  id: `i${i}`,
                  subRecipeId: nextId,
                  quantity: 1,
                  unit: "g",
                }),
              ],
      });
      subs.push({ id: `r${i}`, yieldQuantity: 1, yieldUnit: "g" });
    }
    const a = mkArticle({ id: "a1" });
    const c = ctx([a], recipes, subs);
    expect(() => costRecipeCents("r0", c)).toThrow(DepthError);
  });
});

describe("costRecipeCents — Einheiten- und Datenfehler", () => {
  it("UnitMismatch: Zeile in g, Artikel content_unit ml", () => {
    const a = mkArticle({ id: "a1", contentUnit: "ml" });
    const r: RecipeData = {
      id: "r",
      items: [mkItem({ id: "i1", articleId: "a1", unit: "g" })],
    };
    expect(() => costRecipeCents("r", ctx([a], [r]))).toThrow(UnitMismatchError);
  });

  it("UnitMismatch: Sub yield ml, Zeile stk", () => {
    const a = mkArticle({ id: "a1", contentUnit: "ml" });
    const sub: RecipeData = {
      id: "s",
      items: [mkItem({ id: "si", articleId: "a1", quantity: 100, unit: "ml" })],
    };
    const dish: RecipeData = {
      id: "d",
      items: [mkItem({ id: "di", subRecipeId: "s", quantity: 1, unit: "stk" })],
    };
    const c = ctx([a], [sub, dish], [{ id: "s", yieldQuantity: 100, yieldUnit: "ml" }]);
    expect(() => costRecipeCents("d", c)).toThrow(UnitMismatchError);
  });

  it("MissingContent auf Zutat wird bis nach oben durchgereicht", () => {
    const a = mkArticle({ id: "a1", contentQuantity: null, contentUnit: null });
    const r: RecipeData = {
      id: "r",
      items: [mkItem({ id: "i1", articleId: "a1" })],
    };
    expect(() => costRecipeCents("r", ctx([a], [r]))).toThrow(MissingContentError);
  });

  it("MissingDataError, wenn Artikel-Row fehlt", () => {
    const r: RecipeData = {
      id: "r",
      items: [mkItem({ id: "i1", articleId: "unknown" })],
    };
    expect(() => costRecipeCents("r", ctx([], [r]))).toThrow(MissingDataError);
  });
});

describe("costItemsCents (Editor-Preview)", () => {
  it("berechnet Items ohne persistierte recipe-Row", () => {
    const a = mkArticle({ id: "a1" });
    const items = [mkItem({ id: "x", articleId: "a1", quantity: 200, lossPercent: 0 })];
    expect(costItemsCents(items, ctx([a]))).toBe(200);
  });
});