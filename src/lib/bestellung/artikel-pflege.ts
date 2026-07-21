// AP1-A — Reine Gruppier-/Zähllogik für die Artikel-Massenpflege.
// Kein DB-/UI-Zugriff, damit die Regeln (Sortierung, Zählung, Inaktiv-Filter)
// unabhängig von der Section testbar sind.

export type ArtikelPflegeArticle = {
  id: string;
  supplier_id: string;
  name: string;
  is_active: boolean;
  reviewed_at: string | null;
};

// Vollständige Zeilenform, wie sie `listArticles` ausliefert. Wird für
// `rowToArticleInput` benötigt (Voll-Objekt-Write über `updateArticle`).
export type ArtikelPflegeRow = ArtikelPflegeArticle & {
  sku: string | null;
  description: string | null;
  category: string | null;
  unit: string;
  price_cents: number;
  packaging_unit: number | null;
  order_unit: string;
  inventory_unit: string;
  order_to_inventory_factor: number;
  quantity_step: number;
  allow_decimal_order_quantity: boolean;
  min_order_quantity: number;
  target_stock_total: number | null;
  target_stock_bar: number | null;
  image_url: string | null;
  sort_order: number;
  grape_variety: string | null;
  origin_country: string | null;
  food_pairings: string | null;
  special_attributes: string[] | null;
  locationIds: string[];
};

// AP1-B §2 — reine Umformung Row → updateArticle-Input.
// - snake_case → camelCase
// - `packagingUnit` bewusst weggelassen (AK3-Semantik: DB-Wert bleibt)
// - nullable Strings → "" (die Zod-Schemas erwarten string|undefined|"" statt null)
// - alle übrigen Felder 1:1 aus der Zeile, damit ein Voll-Write nichts plättet.
export type ArtikelPflegeInput = {
  supplierId: string;
  name: string;
  sku: string;
  description: string;
  category: string;
  unit: string;
  priceCents: number;
  orderUnit: string;
  inventoryUnit: string;
  orderToInventoryFactor: number;
  quantityStep: number;
  allowDecimalOrderQuantity: boolean;
  minOrderQuantity: number;
  targetStockTotal: number | null;
  targetStockBar: number | null;
  imageUrl: string;
  sortOrder: number;
  grapeVariety: string;
  originCountry: string;
  foodPairings: string;
  specialAttributes: string[] | null;
  locationIds: string[];
};

export function rowToArticleInput(row: ArtikelPflegeRow): ArtikelPflegeInput {
  return {
    supplierId: row.supplier_id,
    name: row.name,
    sku: row.sku ?? "",
    description: row.description ?? "",
    category: row.category ?? "",
    unit: row.unit,
    priceCents: row.price_cents,
    orderUnit: row.order_unit,
    inventoryUnit: row.inventory_unit,
    orderToInventoryFactor: row.order_to_inventory_factor,
    quantityStep: row.quantity_step,
    allowDecimalOrderQuantity: row.allow_decimal_order_quantity,
    minOrderQuantity: row.min_order_quantity,
    targetStockTotal: row.target_stock_total,
    targetStockBar: row.target_stock_bar,
    imageUrl: row.image_url ?? "",
    sortOrder: row.sort_order,
    grapeVariety: row.grape_variety ?? "",
    originCountry: row.origin_country ?? "",
    foodPairings: row.food_pairings ?? "",
    specialAttributes: row.special_attributes,
    locationIds: row.locationIds,
  };
}

export type ArtikelPflegeSupplier = {
  id: string;
  name: string;
  is_active: boolean;
};

export type ArtikelPflegeGroup<A extends ArtikelPflegeArticle> = {
  supplierId: string;
  supplierName: string;
  articles: A[];
  reviewedCount: number;
};

export function countReviewed(articles: ReadonlyArray<ArtikelPflegeArticle>): number {
  let n = 0;
  for (const a of articles) if (a.reviewed_at != null) n += 1;
  return n;
}

export function groupArticlesBySupplier<A extends ArtikelPflegeArticle>(
  articles: ReadonlyArray<A>,
  suppliers: ReadonlyArray<ArtikelPflegeSupplier>,
  opts: { showInactive: boolean },
): ArtikelPflegeGroup<A>[] {
  const activeSuppliers = suppliers.filter((s) => s.is_active);
  const bySupplier = new Map<string, A[]>();
  for (const a of articles) {
    if (!opts.showInactive && !a.is_active) continue;
    const arr = bySupplier.get(a.supplier_id) ?? [];
    arr.push(a);
    bySupplier.set(a.supplier_id, arr);
  }
  const groups: ArtikelPflegeGroup<A>[] = activeSuppliers.map((s) => {
    const list = (bySupplier.get(s.id) ?? [])
      .slice()
      .sort((x, y) => x.name.localeCompare(y.name, "de"));
    return {
      supplierId: s.id,
      supplierName: s.name,
      articles: list,
      reviewedCount: countReviewed(list),
    };
  });
  groups.sort((a, b) => a.supplierName.localeCompare(b.supplierName, "de"));
  return groups;
}
