// ST1-A — Reine Helfer für article_taxonomy (leichte, testbare Funktionen).
// Keine I/O. Wird vom Server-Modul (taxonomy.functions.ts) genutzt und
// separat in Tests verifiziert (Unique-Fehler-Mapping, Delete-Guard-Text).

import type { PostgrestError } from "@supabase/supabase-js";

export type TaxonomyKind = "category" | "unit";

// Postgres unique_violation → verständlicher Text.
// (Fehlercode 23505 kommt zuverlässig aus dem article_taxonomy-Index.)
export function isUniqueViolation(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const code = (err as PostgrestError).code;
  return code === "23505";
}

export function mapTaxonomyWriteError(err: unknown, kind: TaxonomyKind, name: string): Error {
  if (isUniqueViolation(err)) {
    const label = kind === "category" ? "Kategorie" : "Einheit";
    return new Error(`${label} „${name}“ existiert bereits.`);
  }
  if (err instanceof Error) return err;
  return new Error(String(err));
}

// Baut die Fehlermeldung für den Delete-Guard, wenn ein Wert noch von
// Artikeln verwendet wird. Reine Textformatierung, damit sie testbar bleibt.
export function formatDeleteBlockedMessage(
  kind: TaxonomyKind,
  name: string,
  usageCount: number,
): string {
  const label = kind === "category" ? "Kategorie" : "Einheit";
  return `${label} „${name}“ wird von ${usageCount} Artikel${
    usageCount === 1 ? "" : "n"
  } verwendet — erst zusammenlegen.`;
}

// ST1-B — Reine Validierung der Merge-Paar-Kombination.
// Fehlerobjekt statt throw, damit die Regel in Tests bequem prüfbar bleibt.
export function validateMergePair(
  source: { id: string; kind: TaxonomyKind } | null | undefined,
  target: { id: string; kind: TaxonomyKind } | null | undefined,
): Error | null {
  if (!source || !target) return new Error("Eintrag nicht gefunden.");
  if (source.kind !== target.kind) {
    return new Error("Kategorien und Einheiten können nicht miteinander zusammengelegt werden.");
  }
  if (source.id === target.id) {
    return new Error("Quelle und Ziel dürfen nicht identisch sein.");
  }
  return null;
}

// ST1-B — Berechnet die „unbekannten Werte" (Artikel-Werte, die nicht in der
// kuratierten Liste stehen). Reine Funktion — der Server liefert nur die
// Rohdaten (paginierte Artikel + Taxonomy). Vergleich lower(trim(…)); bei
// unit werden order_unit UND inventory_unit gemeinsam ausgewertet.
export type UnknownValue = { name: string; count: number };
export function computeUnknownTaxonomyValues(
  articles: ReadonlyArray<{
    category: string | null;
    order_unit: string | null;
    inventory_unit: string | null;
  }>,
  taxonomy: ReadonlyArray<{ kind: TaxonomyKind; name: string }>,
): { categories: UnknownValue[]; units: UnknownValue[] } {
  const known = { category: new Set<string>(), unit: new Set<string>() };
  for (const t of taxonomy) known[t.kind].add(t.name.trim().toLowerCase());
  const catCounts = new Map<string, number>();
  const unitCounts = new Map<string, number>();
  const bumpUnknown = (counts: Map<string, number>, known: Set<string>, raw: string | null) => {
    if (!raw) return;
    const trimmed = raw.trim();
    if (trimmed === "") return;
    if (known.has(trimmed.toLowerCase())) return;
    counts.set(trimmed, (counts.get(trimmed) ?? 0) + 1);
  };
  for (const a of articles) {
    bumpUnknown(catCounts, known.category, a.category);
    bumpUnknown(unitCounts, known.unit, a.order_unit);
    bumpUnknown(unitCounts, known.unit, a.inventory_unit);
  }
  const toSorted = (m: Map<string, number>): UnknownValue[] =>
    Array.from(m, ([name, count]) => ({ name, count })).sort(
      (a, b) => b.count - a.count || a.name.localeCompare(b.name, "de"),
    );
  return { categories: toSorted(catCounts), units: toSorted(unitCounts) };
}
