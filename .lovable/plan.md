# AP1-B — Artikel-Massenpflege Runde B

Inline-Editing der Zellen in `ArtikelPflegeSection.tsx` über bestehende Server-Funktionen (`updateArticle`, `setArticleLocations`). Keine Migration, keine neuen Server-Wege.

## 1. Shared Parser
- Neu: `src/lib/bestellung/parse-de.ts` — `parseNumberDe` 1:1 aus `bestellung.lieferanten.tsx` (~Z.138) verschoben.
- Neu: `src/lib/bestellung/parse-de.test.ts` — Fälle `"12,90" → 12.9`, `"1.234,5"` (Bestandsverhalten), Müll → `null`.
- `bestellung.lieferanten.tsx`: lokale Definition entfernen, Import aus neuem Modul.

## 2. rowToArticleInput + Tests
- In `src/lib/bestellung/artikel-pflege.ts` neue reine Funktion `rowToArticleInput(row)`:
  - Snake → camelCase, `locationIds` aus `row.locationIds`.
  - `packagingUnit` bleibt `undefined` (AK3: DB-Wert nicht plätten).
  - Alle übrigen Felder 1:1 (inkl. `sku`, `description`, `imageUrl`, Wein-Felder, `targetStock*`, `sortOrder`).
- Test in `artikel-pflege.test.ts`: vollbesetzte Beispielzeile → Roundtrip; Assertion, dass `packagingUnit` nicht im Ergebnis liegt.

## 3. Editierbare Zellen (`ArtikelPflegeSection.tsx`)
Click-to-edit-Muster (Enter/Blur commit, Escape revert, ungültig → Toast + Revert, kein Commit bei unverändertem Wert):

| Zelle | Input | Regel |
|---|---|---|
| Kategorie | Text + Datalist (uniq geladen) | `trim`; leer → `null` |
| € pro BE | Text `inputMode="decimal"` | `parseNumberDe` → `Math.round(x*100)`; ≤0/null → Revert |
| Bestell-/Inventureinheit | Text + Datalist (uniq order/inventory) | `trim`; leer → Revert (Pflicht) |
| 1 BE = X IE | Text decimal | `parseNumberDe`; >0 sonst Revert |
| Min / Schritt | Text decimal | `parseNumberDe`; >0 sonst Revert |
| Dez. | Checkbox | direkter Toggle |

Commit-Weg: `rowToArticleInput(row)` + Feld überschreiben → `updateArticle`. Eine gemeinsame Mutation mit Feld-Parameter. Optimistisches Patchen auf `ARTIKEL_KEY` nach Muster der Häkchen-Mutation (cancel → snapshot → patch → onError-Rollback → onSettled-Invalidate).

## 4. Standort-Chips-Spalte
- Read-only-Kurzlabels ersetzen durch klickbare Chips (BL1-Verhalten).
- Toggle → optimistisches Update mit Rollback, `setArticleLocations` mit vollständiger neuer Liste.
- Letzter aktiver Chip: UI-Toast „Mindestens ein Standort", kein Server-Call (Server validiert zusätzlich).
- Chips lokal in der Section bauen — keine Extraktion aus `bestellung.lieferanten.tsx`.

## 5. Sternchen-Nachzug (UI1-Rest)
- `bestellung.lieferanten.tsx` `ArticleForm` (~Z.1365): Label `"Name *"` → `"Name"`.
- `SupplierForm`-Label bleibt unverändert.

## Nicht anfassen
- `updateArticle`, `setArticleLocations`, `setArticleReviewed`, `replaceArticleLocations` und Server-Guards.
- `bestellung.lieferanten.tsx` nur: Parser-Import + ein Label.
- Kein Auto-`recalcAllLinkedEk` aus dem Grid.
- Name-Spalte bleibt read-only (Dialog-Shortcut = AP1-C).
- Runde-A-Verhalten unverändert.

## Erfolgs-Gate
- `tsc --noEmit` 0, `eslint --max-warnings=5`, `prettier --check` clean, `vitest run` grün (inkl. neuer Tests).
- Manuell (Admin): Preis inline → persistiert; SKU/Beschreibung/Zielbestände unverändert; leere Einheit → Revert + Toast (kein Audit); Dezimal-Toggle wirkt; Chip-Toggle persistiert; letzter Chip nicht abwählbar; Escape ohne Call.
- Artikel-Dialog: „Name" ohne Sternchen; Lieferanten-Dialog unverändert.
- Vor Commit: `prettier --write` + `eslint --fix` über geänderte Dateien.

## Betroffene Dateien
- Neu: `src/lib/bestellung/parse-de.ts`, `src/lib/bestellung/parse-de.test.ts`
- Erweitert: `src/lib/bestellung/artikel-pflege.ts`, `src/lib/bestellung/artikel-pflege.test.ts`
- Editor + Chips: `src/components/settings/ArtikelPflegeSection.tsx`
- Minimal-Edits: `src/routes/_authenticated/admin/bestellung.lieferanten.tsx` (Parser-Import + Label)
