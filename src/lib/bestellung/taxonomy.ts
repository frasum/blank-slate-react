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
