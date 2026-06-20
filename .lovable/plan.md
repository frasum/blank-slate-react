## Ziel
PostgREST-Filter-Injection in der Artikel-Suche (`listArticles` in `src/lib/bestellung/articles.functions.ts`, Z. ~121) schließen. Anders als beim PIN-Login wird hier **nicht** allowlistet auf Buchstaben (SKU-Suche braucht Ziffern/Bindestrich), sondern der Suchbegriff wird per Zeichen-Allowlist auf harmlose Zeichen reduziert. Leerer Rest → Filter weglassen.

## Änderungen

### 1) `src/lib/bestellung/articles.functions.ts`
- Neue, exportierte Hilfsfunktion direkt in der Datei (klein, lokal zum Verbraucher):
  ```ts
  export function sanitizeArticleSearchTerm(value: string): string {
    // Allowlist: Unicode-Buchstaben, Ziffern, Leerzeichen, Bindestrich.
    // Entfernt alle PostgREST-DSL- und ilike-Wildcard-Zeichen (, . ( ) : * % _ \ etc.)
    return value.replace(/[^\p{L}\p{N} -]/gu, "").trim();
  }
  ```
- Im `listArticles`-Handler:
  ```ts
  if (data.search) {
    const term = sanitizeArticleSearchTerm(data.search);
    if (term) q = q.or(`name.ilike.%${term}%,sku.ilike.%${term}%`);
  }
  ```
- Zod-Validator (`search: z.string().trim().min(1).max(200).optional()`) bleibt unverändert — die Bereinigung erfolgt bewusst nach der Validierung, damit ungültige Zeichen schlicht ignoriert werden statt die Anfrage zu rejecten.

### 2) Neuer Test `src/lib/bestellung/articles-search.test.ts`
Testet ausschließlich die reine Hilfsfunktion (kein DB-Touch):
- `"Pad Thai"` → `"Pad Thai"`
- `"ART-12"` → `"ART-12"`
- `"Lara Müller"` → `"Lara Müller"` (Unicode-Buchstaben bleiben)
- `"a,b(c)*"` → `"abc"` (DSL-Zeichen entfernt, kein Rest mit Sonderbedeutung)
- `"%_"` → `""` (Caller lässt Filter weg)
- `"name.ilike.%x%"` → ohne `.`, `%`, kein DSL-Rest
- `"   "` → `""`
- `"\\\\"` → `""`

## Nicht angefasst
- `order-units.functions.ts` (UUID-Interpolation, separat — Wartungsnotiz im Prompt).
- Alle anderen `.or()`-Aufrufe / Routen / Tests.
- `validatePinLoginName` und PIN-Login-Pfad.

## Verifikation
- `bunx prettier --write` + `bunx eslint --fix` auf den geänderten/neuen Dateien.
- `tsc --noEmit`, `eslint .`, `prettier --check .`, `vitest run` alle grün.
- Manuell: `grep -n "data.search" src/lib/bestellung/articles.functions.ts` zeigt nur den bereinigten Pfad.

## Geänderte / neue Dateien
- `src/lib/bestellung/articles.functions.ts` (geändert)
- `src/lib/bestellung/articles-search.test.ts` (neu)
