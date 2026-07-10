// Kategorisierung von Bank-Buchungen (BK1). Reines Modul, ohne IO.
//
// Präzedenz: Override > erste passende Regel > "Ohne Kategorie".
// Regel-Sortierung: `priority` aufsteigend; bei Gleichstand nach `pattern`.
// Matching: case-insensitiver Substring auf `gegenpartei` (`name`) bzw.
// `verwendungszweck` (`zweck`). Bank-Kategorien werden NICHT als Fallback
// verwendet — zwei Taxonomien nicht mischen.

export type CategoryLite = { id: string; name: string; sortOrder: number };

export type CategoryRuleLite = {
  id: string;
  categoryId: string;
  matchField: "name" | "zweck";
  pattern: string;
  priority: number;
};

export type ResolveInput = {
  gegenpartei: string;
  verwendungszweck: string;
  overrideCategoryId: string | null;
};

export type ResolveResult = {
  categoryId: string | null;
  source: "override" | "rule" | "none";
  ruleId: string | null;
};

export function sortRules(rules: readonly CategoryRuleLite[]): CategoryRuleLite[] {
  return [...rules].sort((a, b) => {
    if (a.priority !== b.priority) return a.priority - b.priority;
    return a.pattern.localeCompare(b.pattern);
  });
}

export function resolveCategory(
  tx: ResolveInput,
  sortedRules: readonly CategoryRuleLite[],
): ResolveResult {
  if (tx.overrideCategoryId) {
    return { categoryId: tx.overrideCategoryId, source: "override", ruleId: null };
  }
  const nameLc = (tx.gegenpartei ?? "").toLowerCase();
  const zweckLc = (tx.verwendungszweck ?? "").toLowerCase();
  for (const r of sortedRules) {
    const hay = r.matchField === "name" ? nameLc : zweckLc;
    if (hay.length === 0) continue;
    if (hay.includes(r.pattern.toLowerCase())) {
      return { categoryId: r.categoryId, source: "rule", ruleId: r.id };
    }
  }
  return { categoryId: null, source: "none", ruleId: null };
}

/** Zählt, wie viele Buchungen aktuell durch eine Regel getroffen werden. */
export function countRuleHits(
  transactions: readonly ResolveInput[],
  rules: readonly CategoryRuleLite[],
): Record<string, number> {
  const sorted = sortRules(rules);
  const counts: Record<string, number> = {};
  for (const r of sorted) counts[r.id] = 0;
  for (const tx of transactions) {
    if (tx.overrideCategoryId) continue;
    const res = resolveCategory(tx, sorted);
    if (res.source === "rule" && res.ruleId) counts[res.ruleId] = (counts[res.ruleId] ?? 0) + 1;
  }
  return counts;
}
