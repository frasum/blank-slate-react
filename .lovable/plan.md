## Ziel
KRISS nachträglich als Partner zur ANDI-Abrechnung in Session 2026-06-10 (Standort YUM) eintragen.

## Schritt
Einzelnes Daten-Update über das Insert-Tool:

```sql
UPDATE public.waiter_settlements
SET partner_staff_id = '82a2b8ec-5cbb-4790-ba6a-b7baa3af7f59' -- KRISS
WHERE id = '3708e107-ee47-425c-88fc-190b4db72b6b'              -- ANDI / Session 2026-06-10
  AND partner_staff_id IS NULL;
```

Erfüllt automatisch die bestehenden DB-Constraints:
- CHECK: `partner_staff_id <> staff_id` ✓ (KRISS ≠ ANDI)
- Partial UNIQUE `(session_id, partner_staff_id)`: keine andere Zeile in dieser Session hat KRISS als Partner ✓
- KRISS hat in dieser Session keine eigene Zeile, also keine Kollision mit `assertPartnerFree`-Logik ✓

## Wirkung im UI
In `SettlementsCard` erscheint die ANDI-Zeile künftig mit Badge **„Paar"** und (sofern aktiviert) Hinweis auf KRISS. Es entsteht **keine** zusätzliche eigene Zeile für KRISS — paarweise Abrechnungen werden bewusst als eine Zeile geführt (Entscheidung „a/a").

## Nicht enthalten
- Keine Schemaänderung.
- Keine neue eigenständige KRISS-Settlement-Zeile.
- Keine Änderung an Trinkgeld-Pool / Korrektur-Historie.
- Keine UI-Änderung.

## Folge-Frage
Falls KRISS für weitere vergangene Sessions ebenfalls als Partner fehlt, bitte separat melden — wir machen das pro Session gezielt, kein Massen-Backfill ohne Liste.