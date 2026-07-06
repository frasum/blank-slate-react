// R1 — Reiner Rechenkern für Speisen-Rezepturen (dritte EK-Herkunft nach
// EKZ1 und Manuell). Wird sowohl serverseitig (recipes.functions.ts,
// recalcAllLinkedEk) als auch später client-seitig im Editor (R2) für die
// Live-Kostenanzeige verwendet — deshalb pur, ohne I/O.
//
// Regeln (Hausdisziplin wie SFN / EKZ1 / EKW1):
//  – Cent-Arithmetik als float; Rundung NUR am Ende (Math.round) in
//    costRecipeCents. Zwischensummen und Kaskaden-Ergebnisse fliessen
//    unrudiert weiter, damit die Sub-Kaskade nicht auf jeder Ebene rundet.
//  – Verlust wird IMMER als Ausbeute geschrieben: `qty / (1 - loss/100)`.
//    10 % Verlust  ⇒  ÷ 0,9   (nicht × 1,1 — häufigster Rechenfehler).
//  – KEINE Einheiten-Umrechnung. `item.unit` MUSS mit `article.contentUnit`
//    bzw. `sub.yieldUnit` übereinstimmen, sonst UnitMismatchError. Ehrlich
//    statt Dichte-Raterei (Frank-Entscheidung R1).
//  – Der Preis je Basiseinheit nutzt das E1-Modul (unit-conversion.ts),
//    damit Kette Bestellpreis → Inventurpreis → Basiseinheit deckungsgleich
//    zur Bestandsbewertung rechnet.
//  – Zyklen-Schutz: `path.includes(recipeId)` fängt direkte UND transitive
//    Ringe VOR jeder Rekursion. Tiefenlimit MAX_RECIPE_DEPTH als weiterer
//    Reissverschluss (falls jemand versucht, exponentielle Ketten zu bauen).

import { normalizedPriceCents } from "./unit-conversion";

export type RecipeUnit = "g" | "ml" | "stk";

export const MAX_RECIPE_DEPTH = 5;

// ---------------------------------------------------------------------------
// Fehlerklassen — differenziert, damit recalcAllLinkedEk sie in der
// „skipped"-Rückgabe unterscheiden und die UI (R2) sie einzeln melden kann.
// ---------------------------------------------------------------------------

export class MissingContentError extends Error {
  articleId: string;
  constructor(articleId: string) {
    super(`Einkaufsartikel ${articleId} ohne Inhalt je Inventureinheit.`);
    this.name = "MissingContentError";
    this.articleId = articleId;
  }
}

export class UnitMismatchError extends Error {
  itemId: string;
  expected: RecipeUnit;
  actual: RecipeUnit;
  constructor(itemId: string, expected: RecipeUnit, actual: RecipeUnit) {
    super(
      `Rezeptzeile ${itemId}: erwartet Einheit "${expected}", verwendet "${actual}" (keine automatische Umrechnung).`,
    );
    this.name = "UnitMismatchError";
    this.itemId = itemId;
    this.expected = expected;
    this.actual = actual;
  }
}

export class CycleError extends Error {
  path: string[];
  constructor(path: string[]) {
    super(`Rezept-Zyklus: ${path.join(" → ")}`);
    this.name = "CycleError";
    this.path = path;
  }
}

export class DepthError extends Error {
  constructor(recipeId: string) {
    super(`Rezept-Verschachtelung tiefer als ${MAX_RECIPE_DEPTH} Ebenen (bei ${recipeId}).`);
    this.name = "DepthError";
  }
}

export class MissingDataError extends Error {
  constructor(what: string, id: string) {
    super(`${what} ${id} nicht im Costing-Kontext geladen.`);
    this.name = "MissingDataError";
  }
}

// ---------------------------------------------------------------------------
// Eingabeformen — bewusst schlank. Der Aufrufer (recipes.functions oder der
// R2-Editor) baut die Maps aus DB-Rows; der Kern kennt keine DB.
// ---------------------------------------------------------------------------

export type ArticleData = {
  id: string;
  priceCents: number; // Bestellpreis (Cent), aus articles.price_cents
  orderToInventoryFactor: number; // articles.order_to_inventory_factor, > 0
  contentQuantity: number | null; // articles.content_quantity, Menge je Inventureinheit
  contentUnit: RecipeUnit | null; // articles.content_unit
};

export type SubRecipeMeta = {
  id: string;
  yieldQuantity: number; // recipes.yield_quantity (bei kind='sub' immer > 0)
  yieldUnit: RecipeUnit; // recipes.yield_unit
};

export type RecipeItemData = {
  id: string;
  articleId: string | null;
  subRecipeId: string | null;
  quantity: number;
  unit: RecipeUnit;
  lossPercent: number; // 0..90 (DB-CHECK)
};

export type RecipeData = {
  id: string;
  items: RecipeItemData[];
};

export type CostingCtx = {
  articles: Map<string, ArticleData>;
  recipes: Map<string, RecipeData>;
  subs: Map<string, SubRecipeMeta>; // yield-Info je Sub-Rezept (kind='sub')
};

// ---------------------------------------------------------------------------
// Preis je Basiseinheit eines Artikels (Cent/g bzw. Cent/ml bzw. Cent/Stk).
// Kette: Bestellpreis ÷ Bestell→Inventur-Faktor  (E1, unit-conversion.ts)
//        ÷ Inhalt je Inventureinheit  ⇒  Preis je Basiseinheit.
// Beispiel: Kiste Cola 24 × 0,33 l zu 18,90 € → Inventurpreis 78,75 ct/Flasche
//           ÷ 330 ml/Flasche = 0,2386 ct/ml.
// ---------------------------------------------------------------------------

export function pricePerBaseUnitCents(a: ArticleData): number {
  if (a.contentQuantity === null || a.contentUnit === null) {
    throw new MissingContentError(a.id);
  }
  const perInventoryUnit = normalizedPriceCents(a.priceCents, a.orderToInventoryFactor);
  return perInventoryUnit / a.contentQuantity;
}

// Zeilenkosten: qty / Ausbeute × Preis. Wirft für item.unit-Mismatch.
function lineCostCents(pricePerBase: number, qty: number, lossPercent: number): number {
  // DB-CHECK garantiert 0 <= loss <= 90 → Nenner immer ≥ 0.1. Bewusste
  // Verteuerung durch Verlust: 10 % Verlust bedeutet, wir brauchen 100 g
  // Zutat, um 90 g nutzbar herauszubekommen → 100/0.9 = 111.11 %.
  const yield_ = 1 - lossPercent / 100;
  return (qty * pricePerBase) / yield_;
}

// Interne Rekursion — arbeitet unrudiert und trägt Pfad für Zyklus-Diagnose.
function costRecipeInternalCents(
  recipeId: string,
  ctx: CostingCtx,
  path: string[],
  depth: number,
): number {
  if (path.includes(recipeId)) {
    throw new CycleError([...path, recipeId]);
  }
  if (depth > MAX_RECIPE_DEPTH) {
    throw new DepthError(recipeId);
  }
  const recipe = ctx.recipes.get(recipeId);
  if (!recipe) throw new MissingDataError("Rezept", recipeId);

  const nextPath = [...path, recipeId];
  let total = 0;
  for (const item of recipe.items) {
    if (item.articleId !== null) {
      const art = ctx.articles.get(item.articleId);
      if (!art) throw new MissingDataError("Artikel", item.articleId);
      if (art.contentUnit === null || art.contentQuantity === null) {
        throw new MissingContentError(art.id);
      }
      if (art.contentUnit !== item.unit) {
        throw new UnitMismatchError(item.id, art.contentUnit, item.unit);
      }
      const pricePerBase = pricePerBaseUnitCents(art);
      total += lineCostCents(pricePerBase, item.quantity, item.lossPercent);
    } else if (item.subRecipeId !== null) {
      const sub = ctx.subs.get(item.subRecipeId);
      if (!sub) throw new MissingDataError("Sub-Rezept-Meta", item.subRecipeId);
      if (sub.yieldUnit !== item.unit) {
        throw new UnitMismatchError(item.id, sub.yieldUnit, item.unit);
      }
      const subTotal = costRecipeInternalCents(sub.id, ctx, nextPath, depth + 1);
      const pricePerBase = subTotal / sub.yieldQuantity;
      total += lineCostCents(pricePerBase, item.quantity, item.lossPercent);
    } else {
      // DB-CHECK recipe_items_source_xor macht das eigentlich unmöglich,
      // aber wir sichern den Client-seitigen Editor-Pfad ebenfalls ab.
      throw new Error(`Rezeptzeile ${item.id} ohne Zutat.`);
    }
  }
  return total;
}

/**
 * Gerichtkosten in Cent (ganzzahlig, kaufmännisch gerundet). Rundung findet
 * ausschliesslich hier statt — Sub-Kaskaden fliessen unrudiert.
 */
export function costRecipeCents(recipeId: string, ctx: CostingCtx): number {
  const total = costRecipeInternalCents(recipeId, ctx, [], 0);
  return Math.round(total);
}

// Für Tests und den späteren Editor: erlaubt Preview eines noch nicht
// gespeicherten Rezepts, indem die items als Overlay reingereicht werden.
export function costItemsCents(items: RecipeItemData[], ctx: CostingCtx): number {
  // Wir hängen ein synthetisches Rezept an — die ID darf nicht kollidieren.
  const previewId = "__preview__" + Math.random().toString(36).slice(2);
  const augmented: CostingCtx = {
    articles: ctx.articles,
    subs: ctx.subs,
    recipes: new Map(ctx.recipes),
  };
  augmented.recipes.set(previewId, { id: previewId, items });
  return costRecipeCents(previewId, augmented);
}