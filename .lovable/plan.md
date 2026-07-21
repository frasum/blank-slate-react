## AP1-A — Artikel-Massenpflege, Runde A (Revision)

Read-only Liste aller Bestellartikel unter Einstellungen → „Artikel", nach Lieferant gruppiert (Akkordeon), pro Zeile ein „geprüft"-Häkchen. Runde B ergänzt später Inline-Edits.

### 1. Schema (Frank führt aus)
```sql
ALTER TABLE public.articles
  ADD COLUMN reviewed_at timestamptz NULL,
  ADD COLUMN reviewed_by_staff_id uuid NULL
    REFERENCES public.staff(id) ON DELETE SET NULL;
NOTIFY pgrst, 'reload schema';
```
Danach `src/integrations/supabase/types.ts` regenerieren. Keine RLS-/GRANT-Änderung (Client-Writes auf `articles` weiterhin verboten).

### 2. Server — `src/lib/bestellung/articles.functions.ts`
- **`listArticles`**: SELECT additiv um `reviewed_at` erweitern; Rückgabe-Shape nur ergänzt, bestehende Aufrufer unverändert.
- **Neu: `setArticleReviewed`** (POST, admin-only):
  - Input (Zod): `{ articleId: uuid, reviewed: boolean }`.
  - `loadAdminCaller(..., "admin")` + `runGuarded(caller.role, "admin", makeAuditWriter(caller), …)`.
  - Update: `.update({...}).eq("id", articleId).eq("organization_id", caller.organizationId).select("id")`.
    - `reviewed: true` → `reviewed_at = now()`, `reviewed_by_staff_id = caller.staffId`.
    - `reviewed: false` → beides `NULL`.
  - **Trefferzahl prüfen**: 0 Zeilen ⇒ `throw new Error("Artikel nicht gefunden.")` VOR dem Audit-Write, damit Cross-Org- oder Tippfehler-Aufrufe nicht still mit Erfolg quittieren und **kein** `article.reviewed_set` im Audit landet.
  - Audit erst bei ≥ 1 aktualisierter Zeile: `article.reviewed_set` mit `{ articleId, reviewed }`.

Andere Artikel-Fns (`createArticle`, `updateArticle`, `setArticleActive`, `setArticleLocations`) bleiben unangetastet.

### 3. Sub-Tab-Registrierung — Single-Source-Fix
Die Nav wird in `src/routes/_authenticated/admin/route.tsx` (~Zeile 214) aus dem in `einstellungen.index.tsx` exportierten `SUB_TABS` abgeleitet und in `AdminLayout` (~Zeile 418) gerendert. Reines Content-Filtern reicht deshalb nicht — sonst sähe der Manager den Tab in der Leiste.

- `einstellungen.index.tsx`: `SUB_TABS`-Typ um optionales `adminOnly?: boolean` erweitern, neuer Eintrag `{ key: "artikel", label: "Artikel", adminOnly: true }`. `TabKey` bleibt strukturell gleich (union bekommt `"artikel"` dazu).
- `route.tsx`: `EINSTELLUNGEN_ALLGEMEIN_SUB` mappt `adminOnly` mit durch; im Render-Block generischer Filter: `.filter((s) => !s.adminOnly || identity.role === "admin")`. `identity` ist in `AdminLayout` bereits verfügbar. Kein Hardcoding auf `"artikel"`.
- Content-Gate + Fallback in `einstellungen.index.tsx`: Wenn `tab === "artikel"` und Rolle ≠ admin, effektiv auf `"trinkgeldpool"` zurückfallen (Render-Auswahl; kein Redirect nötig). `validateSearch` bleibt strukturell wie gehabt.

### 4. Neue Section `src/components/settings/ArtikelPflegeSection.tsx`
- Queries: `listArticles({ includeInactive: true })`, `listSuppliers()`, `listLocations()`.
- **Query-Key konsistent**: In der Section einmal als Konstante definiert, z. B. `const ARTIKEL_KEY = ["settings","artikel-pflege","articles", { includeInactive: true }] as const;`. Derselbe Key wird für Snapshot, optimistischen Patch und Invalidate genutzt — nicht raten, nicht mit dem Key aus `bestellung.lieferanten.tsx` koppeln.
- Toggle `showInactive` (Default false), filtert vor Gruppierung. Lieferanten nach `is_active` gefiltert.
- Gruppierung: Map `supplierId → Article[]`, Lieferanten alphabetisch (`localeCompare("de")`), Artikel innerhalb per Name.
- Akkordeon: nur einer offen; Header zeigt `Lieferantenname · X Artikel · Y geprüft`.
- Tabelle (nur offener Block) mit Spalten:
  1. Checkbox „geprüft" (checked = `reviewed_at != null`)
  2. Name (read-only)
  3. Kategorie
  4. € pro BE — **Formatierung via `fmtCents(price_cents)` aus `@/lib/format`** (nicht die lokale `fmtEuro` aus `bestellung.lieferanten.tsx`; die Route bleibt „nicht anfassen"). Suffix ` €` in der Zelle.
  5. Bestelleinheit (`order_unit`)
  6. Inventureinheit (`inventory_unit`)
  7. 1 BE = X IE (`order_to_inventory_factor`)
  8. Mindestmenge (`min_order_quantity`)
  9. Bestellschritt (`quantity_step`)
  10. Dezimal (`allow_decimal_order_quantity` → ✓/–)
  11. Standorte (Kurzlabels der zugeordneten `article_locations`)
- Inaktive Artikel visuell gedimmt.
- Zellen als kleine `<td>`-Komponenten strukturieren, damit Runde B je Zelle einen Inline-Editor einsetzen kann.

### 5. Häkchen-Mutation (optimistisch)
- `useMutation({ mutationFn: setArticleReviewed })`.
- `onMutate`:
  - `await queryClient.cancelQueries({ queryKey: ARTIKEL_KEY })`.
  - `previous = queryClient.getQueryData(ARTIKEL_KEY)`.
  - `queryClient.setQueryData(ARTIKEL_KEY, patch)` — betroffene Zeile: `reviewed_at` auf `new Date().toISOString()` bzw. `null`.
  - Return `{ previous }`.
- `onError (_e, _v, ctx)`: `queryClient.setQueryData(ARTIKEL_KEY, ctx.previous)` + Fehler-Toast/Zeilenhinweis.
- `onSettled`: `queryClient.invalidateQueries({ queryKey: ARTIKEL_KEY })`.
- Header-Zähler `Y geprüft` leitet sich aus den Query-Daten ab.

### 6. Reine Logik + Tests
Neu `src/lib/bestellung/artikel-pflege.ts`:
- `groupArticlesBySupplier(articles, suppliers, { showInactive })` → `Array<{ supplierId, supplierName, articles, reviewedCount }>`, alphabetisch sortiert.
- `countReviewed(articles)`.

Neu `src/lib/bestellung/artikel-pflege.test.ts`:
- leerer Lieferant (0/0).
- gemischt: 3 Artikel, 1 mit `reviewed_at` → `1 geprüft`.
- Inaktiv-Toggle: inaktive Artikel ein-/ausgeschlossen inkl. Zähler.
- Sortierung: Lieferanten und Artikel alphabetisch.

### 7. Nicht anfassen
`bestellung.lieferanten.tsx` (inkl. lokaler `fmtEuro`, `ArticleForm`, BL1-Chips), die anderen Einstellungen-Sektionen, `updateOrgSettings`-Mutation, `verkaufsartikel.tsx`/`PriceCell`, sämtliche Client-Writes auf `articles`.

### 8. Erfolgs-Gate
1. `tsgo` 0 Fehler.
2. `eslint --max-warnings=5` sauber.
3. `prettier --check` clean.
4. `vitest run` grün inkl. neuer `artikel-pflege`-Tests.
5. Manuell:
   - Admin: Tab „Artikel" in Nav + Inhalt sichtbar; Häkchen persistiert nach Reload; `article.reviewed_set` im Audit; Aufruf mit unbekannter/foreign `articleId` → Fehler und **kein** Audit-Eintrag.
   - Manager: Tab weder in Nav noch via `?tab=artikel` (Content-Fallback auf Trinkgeldpool); `setArticleReviewed` als Manager → Forbidden, kein Audit.

Vor Commit: `npx prettier --write` + `npx eslint --fix` auf geänderte Dateien.

### Reihenfolge
1. Franks SQL + Types-Regeneration abwarten.
2. `listArticles`-Erweiterung + `setArticleReviewed` inkl. 0-Rows-Guard.
3. `artikel-pflege.ts` + Tests.
4. `ArtikelPflegeSection.tsx` mit konsistentem Query-Key und `fmtCents`.
5. `adminOnly`-Feld in `einstellungen.index.tsx` + generischer Nav-Filter in `route.tsx` + Content-Fallback.
6. Gates + Formatter/Linter.
