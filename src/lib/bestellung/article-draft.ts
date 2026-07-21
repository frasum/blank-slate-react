// AP1-C — Draft-Modell des Artikel-Formulars als eigenständiges, testbares Modul.
// Verschoben aus `src/routes/_authenticated/admin/bestellung.lieferanten.tsx`
// (Typ, EMPTY-Konstante, Row→Draft-Konverter, Draft→UpdateInput-Konverter).
// Verhalten strikt 1:1 zur bisherigen Inline-Fassung.

import { parseEuroToCents } from "@/lib/format";
import { parseNumberDe } from "@/lib/bestellung/parse-de";

export type ArticleDraft = {
  name: string;
  sku: string;
  description: string;
  category: string;
  unit: string;
  priceEuro: string;
  orderUnit: string;
  inventoryUnit: string;
  orderToInventoryFactor: string;
  minOrderQuantity: string;
  quantityStep: string;
  allowDecimalOrderQuantity: boolean;
  targetStockTotal: string;
  targetStockBar: string;
};

export const EMPTY_ARTICLE_DRAFT: ArticleDraft = {
  name: "",
  sku: "",
  description: "",
  category: "",
  unit: "Stk",
  priceEuro: "",
  orderUnit: "Stk",
  inventoryUnit: "Stk",
  orderToInventoryFactor: "1",
  minOrderQuantity: "1",
  quantityStep: "1",
  allowDecimalOrderQuantity: false,
  targetStockTotal: "",
  targetStockBar: "",
};

// Minimal-Formen der Zeile, die der Konverter braucht. Kompatibel mit dem
// `listArticles`-Row-Type (breiter → wir lesen nur diese Felder).
export type ArticleRowLike = {
  name: string;
  sku: string | null;
  description: string | null;
  category: string | null;
  unit: string;
  price_cents: number | null;
  order_unit: string | null;
  inventory_unit: string | null;
  order_to_inventory_factor: number | null;
  min_order_quantity: number | null;
  quantity_step: number | null;
  allow_decimal_order_quantity: boolean | null;
  target_stock_total: number | null;
  target_stock_bar: number | null;
  locationIds?: string[] | null;
};

export function articleRowToDraft(
  row: ArticleRowLike,
  fallbackLocationIds: string[],
): { draft: ArticleDraft; locationIds: string[] } {
  const draft: ArticleDraft = {
    name: row.name,
    sku: row.sku ?? "",
    description: row.description ?? "",
    category: row.category ?? "",
    unit: row.unit,
    priceEuro: row.price_cents != null ? (row.price_cents / 100).toFixed(2).replace(".", ",") : "",
    orderUnit: row.order_unit ?? row.unit ?? "Stk",
    inventoryUnit: row.inventory_unit ?? row.unit ?? "Stk",
    orderToInventoryFactor: String(row.order_to_inventory_factor ?? 1).replace(".", ","),
    minOrderQuantity: String(row.min_order_quantity ?? 1).replace(".", ","),
    quantityStep: String(row.quantity_step ?? 1).replace(".", ","),
    allowDecimalOrderQuantity: !!row.allow_decimal_order_quantity,
    targetStockTotal:
      row.target_stock_total != null ? String(row.target_stock_total).replace(".", ",") : "",
    targetStockBar:
      row.target_stock_bar != null ? String(row.target_stock_bar).replace(".", ",") : "",
  };
  const locationIds = row.locationIds ?? fallbackLocationIds;
  return { draft, locationIds };
}

// Draft → Payload für `updateArticle` / `createArticle` OHNE
// `articleId`/`supplierId`/`locationIds` (die ergänzt der Aufrufer).
export function draftToArticleUpdateInput(draft: ArticleDraft): {
  name: string;
  sku: string;
  description: string;
  category: string;
  unit: string;
  priceCents: number;
  orderUnit: string | undefined;
  inventoryUnit: string | undefined;
  orderToInventoryFactor: number | undefined;
  minOrderQuantity: number | undefined;
  quantityStep: number | undefined;
  allowDecimalOrderQuantity: boolean;
  targetStockTotal: number | null;
  targetStockBar: number | null;
} {
  return {
    name: draft.name,
    sku: draft.sku,
    description: draft.description,
    category: draft.category,
    unit: draft.orderUnit || draft.unit,
    priceCents: parseEuroToCents(draft.priceEuro) ?? 0,
    orderUnit: draft.orderUnit || undefined,
    inventoryUnit: draft.inventoryUnit || undefined,
    orderToInventoryFactor: parseNumberDe(draft.orderToInventoryFactor) ?? undefined,
    minOrderQuantity: parseNumberDe(draft.minOrderQuantity) ?? undefined,
    quantityStep: parseNumberDe(draft.quantityStep) ?? undefined,
    allowDecimalOrderQuantity: draft.allowDecimalOrderQuantity,
    targetStockTotal: parseNumberDe(draft.targetStockTotal),
    targetStockBar: parseNumberDe(draft.targetStockBar),
  };
}
