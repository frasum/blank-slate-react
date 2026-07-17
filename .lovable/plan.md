## Ziel

In der Verkaufsartikel-Liste (`/admin/verkaufsartikel`, Tab „Verkaufsartikel") **Preis**, **Mitnahme** und **EK** direkt inline pflegen. Preis + Mitnahme sind über `PriceCell` bereits inline editierbar; dieser Plan schließt die EK-Spalte konsistent an — mit **drei sich fachlich ausschließenden Rechenwegen** (DB-CHECK erzwingt XOR zwischen `recipe_id` und `ek_source_article_id`).

## Drei EK-Wege (fachlich)

1. **Direkt eingeben** — 1:1-Verkauf einer Einheit (Flasche Bier, Softdrink).
2. **Aus Einkaufsartikel + Portion** — automatisch (EKZ1, `computeEkFromLink`). Typisch: 2 cl Gin aus 0,7-l-Flasche.
3. **Rezept** — Schorlen, Cocktails, gemischte Teller.

## Umfang (nur Frontend)

Nur `src/routes/_authenticated/admin/verkaufsartikel.tsx` + neue kleine Component-Dateien unter `src/components/verkaufsartikel/`. **Keine** Änderung an Server-Fns, DB-Schema, EK-Zuordnungs- oder Rezept-Kalkulation. `searchPurchaseArticlesForEk`, `linkSalesArticleEk`, `unlinkSalesArticleEk`, `linkSalesArticleRecipe`, `unlinkSalesArticleRecipe` existieren eigenständig — es wird **keine** neue Server-Fn gebaut.

## Verhalten der EK-Zelle (Admin-Spalte)

### Anzeige

`ekPriceCents` als Euro. Chip unter dem Wert zeigt die aktive Quelle:
- `recipeId != null` → „Rezept: {name}"
- `ekSourceArticleId != null` → „EK aus {Einkaufsartikel} · {portion} ml / {source} ml"
- sonst → nichts.

### Klick auf die Zelle → Popover mit drei Buttons

Auswahl-Logik hängt vom aktuellen Zustand der Zeile ab. **Kein stilles Überschreiben.** Der DB-XOR wird nicht dem Server als Fehler überlassen — der UI-Flow erzwingt vorab einen Unlink.

**Wenn die Zeile KEINE Verknüpfung hat** (weder Rezept noch EK-Zuordnung):
- **Direkt eingeben** → Inline-Editor (`PriceCell`-Muster), Enter speichert `ekPriceCents` via `updateSalesArticle`.
- **Aus Einkaufsartikel** → `EkLinkDialog`.
- **Rezept** → `RecipeEditorDialog`.

**Wenn die Zeile eine Verknüpfung hat** (Rezept ODER EK-Zuordnung) und der Nutzer einen **anderen** Weg wählt (inkl. „Direkt eingeben"):
1. Bestätigungsdialog: „Bestehende Verknüpfung zu **{Name der aktuellen Quelle}** lösen und durch **{gewählte Methode}** ersetzen?"
2. Bei Bestätigung: passende Unlink-Fn (`unlinkSalesArticleRecipe` oder `unlinkSalesArticleEk`) aufrufen. Danach:
   - „Direkt eingeben" → Inline-Editor öffnen.
   - „Aus Einkaufsartikel" → `EkLinkDialog` öffnen.
   - „Rezept" → `RecipeEditorDialog` öffnen.
3. Bei Abbruch: nichts ändern.

**Wenn die Zeile eine Verknüpfung hat** und der Nutzer **dieselbe** Methode wählt: direkt in den jeweiligen Editor / Dialog (Bearbeiten der bestehenden Verknüpfung), kein Bestätigungsdialog, kein Unlink.

### Nach jedem Save

`invalidateQueries(["sales-articles", locationId])`; Zeile inkl. Chip und WE-%-Badge aktualisiert sich ohne Full-Reload.

## Neue Komponenten

- `src/components/verkaufsartikel/EkCell.tsx` — Wrapper: Anzeige, Popover, Dispatch in Inline-Edit / Link-Dialog / Rezept-Dialog inkl. Bestätigungs-/Unlink-Pfad.
- `src/components/verkaufsartikel/EkLinkDialog.tsx` — Modal für „Aus Einkaufsartikel + Portion"; ruft `searchPurchaseArticlesForEk` + `linkSalesArticleEk` direkt auf, Vorbelegung aus `parsePortionMlFromName`/`parseVolumeMlFromName`, Live-Vorschau des berechneten EK.
- `src/components/verkaufsartikel/RecipeEditorDialog.tsx` — dünner Dialog-Wrapper um den bestehenden Rezept-Editor aus `RezepteTab`. Falls die Extraktion mehr als eine kleine Umstellung erfordert, stoppe ich und melde das, statt einen zweiten Rezept-Editor zu bauen.

## Preis / Mitnahme

Bereits inline editierbar über `PriceCell`. Ich verifiziere per Playwright, dass Klick → Enter speichert; bei Bedarf dezente Hover-Affordance (Rahmen). Keine Logik-Änderung.

## Nicht enthalten

- Keine Änderung an Server-Fns, RLS, Audit, EK-Zuordnungs- oder Rezept-Kalkulation.
- Keine Löschung der Tabs „EK-Zuordnung" und „Rezepte".
- Kein Preis für POS-Modifikatoren.

## Erfolgs-Gate

Vier Gates (Hausstandard):
- `npx tsc --noEmit` — 0 Fehler
- `npx eslint src/ --max-warnings=0`
- `npx vitest run` — alle Tests grün
- Vor dem Commit: `npx prettier --write` über alle geänderten Dateien

Fachliche Gate-Punkte:
- Preis / Mitnahme / EK je Zeile per Klick editierbar (Enter speichert, Escape verwirft).
- EK-Popover zeigt drei Wege; Speichern läuft über die bestehenden Server-Fns.
- Zeile inkl. Chip und WE-Badge aktualisiert sich sofort.
- Methodenwechsel **und** „Direkt eingeben" auf verknüpften Zeilen laufen über den Bestätigungs-/Unlink-Pfad — verifiziert per Klicktest an je einem rezept- und einem EK-verknüpften Artikel.
