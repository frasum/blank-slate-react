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
