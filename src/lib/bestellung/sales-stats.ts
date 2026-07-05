// PV1 — Reine Helfer für POS-Verkaufsstatistik (Server-Fn + UI teilen sich
// diese Funktionen).
//
// Der Namens-Join zwischen `sales_article_stats` (Vectron-Export) und
// `sales_articles` (VA1/VA2, Gruppen-Hierarchie) läuft weich über einen
// normalisierten Namen: `trim` + `toLocaleLowerCase("de")` + Whitespace-
// Kollaps. Bewusst KEIN FK, weil Gesamt-Berichte historische/deaktivierte
// Artikel enthalten, die in `sales_articles` nicht existieren — sie landen
// dann im Bucket „Ohne Zuordnung".

export type SalesStatRow = {
  id: string;
  locationId: string;
  period: "d365" | "alltime";
  nummer: number;
  name: string;
  verkaufCount: number;
  umsatzCents: number;
  reportDate: string;
};

export type SalesArticleForJoin = {
  name: string;
  warengruppe: string | null;
  productGroup: number | null;
  untergruppe: string | null;
  untergruppeNr: number | null;
  hauptgruppe: string | null;
  hauptgruppeNr: number | null;
};

export type EnrichedStatRow = SalesStatRow & {
  warengruppe: string | null;
  productGroup: number | null;
  untergruppe: string | null;
  untergruppeNr: number | null;
  hauptgruppe: string | null;
  hauptgruppeNr: number | null;
  /** true, wenn kein sales_articles-Treffer über Namens-Match gefunden. */
  unmatched: boolean;
};

export function normalizeName(input: string): string {
  return input.trim().toLocaleLowerCase("de").replace(/\s+/g, " ");
}

export function enrichSalesStats(
  stats: readonly SalesStatRow[],
  articles: readonly SalesArticleForJoin[],
): { rows: EnrichedStatRow[]; unmatchedCount: number } {
  const byName = new Map<string, SalesArticleForJoin>();
  for (const a of articles) {
    const key = normalizeName(a.name);
    if (!byName.has(key)) byName.set(key, a);
  }
  let unmatchedCount = 0;
  const rows = stats.map((s): EnrichedStatRow => {
    const match = byName.get(normalizeName(s.name));
    if (!match) unmatchedCount += 1;
    return {
      ...s,
      warengruppe: match?.warengruppe ?? null,
      productGroup: match?.productGroup ?? null,
      untergruppe: match?.untergruppe ?? null,
      untergruppeNr: match?.untergruppeNr ?? null,
      hauptgruppe: match?.hauptgruppe ?? null,
      hauptgruppeNr: match?.hauptgruppeNr ?? null,
      unmatched: !match,
    };
  });
  return { rows, unmatchedCount };
}

/**
 * Ø-Preis in Cent (Umsatz / Stückzahl). Bei Count 0 → null (Anzeige „—").
 * Negative Umsätze/Counts (Storno-/Rabatt-PLUs) werden durchgereicht.
 */
export function averagePriceCents(umsatzCents: number, count: number): number | null {
  if (count === 0) return null;
  return umsatzCents / count;
}
