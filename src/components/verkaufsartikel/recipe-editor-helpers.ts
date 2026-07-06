// R2 — reine Helfer für den Rezept-Editor, in eigener Datei, damit die
// React-Komponentendatei kein Nicht-Komponenten-Export mehr enthält
// (react-refresh/only-export-components).

import {
  CycleError,
  DepthError,
  MissingContentError,
  MissingDataError,
  UnitMismatchError,
  type ArticleData,
  type CostingCtx,
  type RecipeData,
  type RecipeItemData,
  type RecipeUnit,
  type SubRecipeMeta,
} from "@/lib/bestellung/recipe-costing";
import type { RecipeCandidateBundle } from "@/lib/bestellung/recipes.functions";

export type EditorItem = {
  key: string;
  articleId: string | null;
  subRecipeId: string | null;
  quantity: number;
  unit: RecipeUnit;
  lossPercent: number;
};

export function toCostingItems(items: EditorItem[]): RecipeItemData[] {
  return items.map((it, idx) => ({
    id: `edit-${idx}`,
    articleId: it.articleId,
    subRecipeId: it.subRecipeId,
    quantity: it.quantity,
    unit: it.unit,
    lossPercent: it.lossPercent,
  }));
}

/** Baut aus dem Kandidaten-Bundle einen CostingCtx (identisch zum Server). */
export function buildCostingCtxFromBundle(bundle: RecipeCandidateBundle): CostingCtx {
  const articles = new Map<string, ArticleData>();
  for (const a of bundle.articles) {
    articles.set(a.id, {
      id: a.id,
      priceCents: a.priceCents,
      orderToInventoryFactor: a.orderToInventoryFactor,
      contentQuantity: a.contentQuantity,
      contentUnit: a.contentUnit,
    });
  }
  const recipes = new Map<string, RecipeData>();
  const subs = new Map<string, SubRecipeMeta>();
  for (const r of bundle.recipes) {
    recipes.set(r.id, {
      id: r.id,
      items: r.items.map((it) => ({
        id: it.id,
        articleId: it.articleId,
        subRecipeId: it.subRecipeId,
        quantity: it.quantity,
        unit: it.unit,
        lossPercent: it.lossPercent,
      })),
    });
    if (r.kind === "sub" && r.yieldQuantity !== null && r.yieldUnit !== null) {
      subs.set(r.id, {
        id: r.id,
        yieldQuantity: r.yieldQuantity,
        yieldUnit: r.yieldUnit,
      });
    }
  }
  return { articles, recipes, subs };
}

/** Wandelt einen Fehler des Rechenkerns in eine kurze deutsche Meldung. */
export function costingErrorMessage(e: unknown): string {
  if (e instanceof MissingContentError)
    return `Ein Einkaufsartikel hat keinen Inhalt je Inventureinheit (${e.articleId}).`;
  if (e instanceof UnitMismatchError)
    return `Einheiten passen nicht: erwartet „${e.expected}", gewählt „${e.actual}".`;
  if (e instanceof CycleError) return `Rezept-Zyklus: ${e.path.join(" → ")}.`;
  if (e instanceof DepthError) return e.message;
  if (e instanceof MissingDataError) return e.message;
  if (e instanceof Error) return e.message;
  return "Kostenberechnung fehlgeschlagen.";
}
