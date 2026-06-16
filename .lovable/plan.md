
## Ziel

`/admin/bestellung/lieferanten` wird die alleinige Katalogansicht: Lieferanten als Header, darunter aufklappbar deren Artikel — inkl. „letzte Bestellung" und Warenkorb-Buttons. Die separate Seite `/admin/bestellung/artikel` entfällt.

Vorbild: bestellung.pro (`SupplierTable` + `useLastOrderByArticle`). In Coco bewusst schlanker, kein Multi-Select/Print/Wein-Tab/Merge — die kommen erst, wenn explizit beauftragt.

## Was gebaut wird

### 1. Neue Server-Function `getLastOrderByArticle`
Datei: `src/lib/bestellung/orders.functions.ts` (vorhandene Datei, neuer Export).

- Liest `order_items` JOIN `orders` (status ≠ 'cancelled'), org-scoped.
- Reduziert pro `article_id` auf den jüngsten Treffer (nach `orders.created_at`).
- Auflösung „wer bestellt hat": `orders.user_id` → `staff` (über `user_links`) oder direkt `staff.full_name`, je nach Datenlage. Wenn nicht auflösbar → „—".
- Rückgabe: `Record<articleId, { quantity, date, orderedBy }>`.
- Middleware `requireSupabaseAuth`, Rolle `staff` reicht (Lesen).

### 2. Lieferanten-Seite umbauen
Datei: `src/routes/_authenticated/admin/bestellung.lieferanten.tsx` (komplett überarbeiten).

- Suchfeld (filtert Lieferanten *und* Artikel; expandiert automatisch bei Artikel-Treffer).
- Liste der Lieferanten: Zeile mit Name, Telefon, Liefertage/Deadline, Artikelzahl als Badge, Toggle „Aufklappen", „Bearbeiten" (bestehender Dialog).
- Aufgeklappt: kleine Tabelle der Artikel mit Spalten **Bestellen · Artikel · Beschreibung · Einheit · Stück/BE · Preis · Aktionen**.
  - „Bestellen": Warenkorb-Icon-Button → `addCartItem({ articleId, quantity: 1 })`. Mengen-Inkrement: erneuter Klick bzw. kleines `+/−` neben Badge mit aktueller Menge im aktiven Cart.
  - Unter dem Artikelnamen: „letzte Bestellung am DD.MM.YYYY · Menge × Einheit · Name" — Daten aus `getLastOrderByArticle`.
  - „Bearbeiten" / „Löschen" pro Artikel (nutzt bestehende `updateArticle` / `setArticleActive`).
  - Zeile „+ Neuer Artikel" unten in jedem Block (öffnet inline Artikel-Form, Lieferant vorausgewählt).
- Inline-Bearbeitung des Lieferanten bleibt wie heute (`SupplierForm`).
- Manager+ für Schreibrechte; reine Anzeige (inkl. Add-to-cart) auch für `staff`, falls Bestellung von Mitarbeitern gewünscht — falls nicht, schalten wir Add-to-cart später auf Manager+. **Default jetzt: staff darf in eigenen Warenkorb legen** (entspricht heutigem Verhalten von `addCartItem`).

### 3. Alte Artikel-Seite entfernen
- Route-Datei `src/routes/_authenticated/admin/bestellung.artikel.tsx` löschen.
- Navigation/Tab in `bestellung.tsx` (Layout) entsprechend bereinigen.
- Funktionen aus `articles.functions.ts` bleiben — werden weiterhin von Lieferanten- und Warenkorb-Seite genutzt.

### 4. Cart-Anzeige in der Lieferanten-Seite
- `getActiveCart()` per `useQuery` holen, Map `articleId → quantity` bauen.
- Pro Artikel-Zeile: Badge mit aktueller Menge im Cart (klein, neben dem Warenkorb-Button), `−`-Button daneben falls > 0.
- Nach Mutationen `invalidateQueries(["bestellung","cart"])` + `["bestellung","last-order-by-article"]` (Letzte-Bestellung ändert sich erst nach Order-Anlage, daher nur invalidieren wenn aus Cart-Seite bestellt wird — hier nur Cart).

## Technisches

- Query-Keys: `["bestellung","last-order-by-article"]` mit `staleTime: 5*60_000`.
- Performance: `listArticles` einmal (ohne `supplierId`-Filter) holen und client-seitig nach `supplier_id` gruppieren — vermeidet N+1 bei vielen Lieferanten. Bei sehr großen Katalogen später paginieren.
- Audit-Log: bestehende Audit-Writes in `addCartItem`/`updateArticle` bleiben unverändert.
- TS strict, keine `any`. Tables<>-Typen aus `@/integrations/supabase/types`.
- Keine RLS-Änderungen nötig — alle benötigten Tabellen sind schon org-scoped.

## Nicht im Umfang (bewusst ausgeschlossen)

- Tabs „Weine" / „Vorschläge", Lieferanten-Zusammenführung, Multi-Select + Sammel-PDF, Realtime-Subs, Bild-Upload/Foto-Erfassung.
- Diese können später als eigene Bauschritte beauftragt werden — Begründung steht in der Arbeitsweise (Punkt: nichts außerhalb des Auftrags nebenher).

## Verifikation

- `tsc` muss grün bleiben (strict).
- Browser-Smoke: Lieferant aufklappen → Artikel sichtbar mit Letzte-Bestellung-Zeile → Warenkorb-Button erhöht Cart-Badge → Mengen-Minus reduziert.
- DB-Check: `getLastOrderByArticle` liefert pro Artikel exakt den jüngsten nicht-stornierten Order-Eintrag (manueller `psql`-Cross-Check gegen `order_items` JOIN `orders`).
