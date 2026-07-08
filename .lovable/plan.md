## Ziel

Kellner erfassen offene Rechnungen künftig als **Liste einzelner Positionen** — jede Position hat einen Betrag **und** einen Reservierungs-/Gästenamen. Ohne Name(n) ist keine Abgabe möglich. Auf der Tagesabrechnung erscheinen die Namen bei „Offen".

## UI-Änderung Kellner-Abrechnung (`src/routes/_authenticated/zeit/abrechnung.tsx`)

Das bisherige einzelne Euro-Feld „Offene Rechnungen" wird ersetzt durch eine Liste `openInvoices: Array<{ name: string; amount: string }>` mit:

- „+ weitere offene Rechnung" (Button, standardmäßig 0 Einträge)
- Pro Zeile: Name-Input (Reservierungs-/Gästename) + Euro-Input + „Entfernen"
- Summe live berechnet und als Hilfstext angezeigt („Summe: XX,XX €")
- Validierung: Jede Zeile mit `amount > 0` benötigt einen nicht-leeren Namen (trim). Sonst: `allValid = false` + rote Meldung an der betroffenen Zeile, Absende-Button bleibt disabled.
- Read-only-Ansicht (bereits abgegeben): Namen + Beträge als Aufzählung unter „Offene Rechnungen"; Gesamtsumme wie bisher.

## Datenmodell (Migration)

Neue Spalte auf `waiter_settlements`:

```
open_invoices_details jsonb not null default '[]'::jsonb
```

Format: `[{ "name": "Meier", "cents": 4500 }, ...]`. Reihenfolge = Eingabereihenfolge des Kellners. `open_invoices_cents` bleibt bestehen und wird serverseitig **immer** als Summe der Details gesetzt (Single Source: Details).

Check-Constraint per Trigger (keine CHECK auf Ausdrücken, siehe Projektregel): Beim `INSERT`/`UPDATE` sicherstellen, dass jeder Eintrag `name` (nicht leer) und `cents ≥ 0` hat und Summe = `open_invoices_cents`.

## Server-Functions (`src/lib/cash/cash.functions.ts`)

Alle drei Schemas (`settlementInputSchema`, `correctSchema`, `adminCreateSettlementSchema`) bekommen ein neues Feld:

```ts
openInvoiceEntries: z.array(z.object({
  name: z.string().trim().min(1).max(120),
  cents: z.number().int().min(0),
})).default([])
```

Server-Regeln:
- `openInvoicesCents` wird **serverseitig** aus `openInvoiceEntries.reduce(sum)` neu berechnet (nicht mehr vom Client vertraut).
- Wenn Summe > 0 und `openInvoiceEntries` leer → Fehler „Bitte für jede offene Rechnung einen Namen eintragen."
- Insert/Update schreibt `open_invoices_details` mit den Einträgen.
- `getMySettlement` und `getCashOverview` liefern `open_invoices_details` mit aus (Read-Selects um Spalte ergänzen).

## Anzeige „Offen" auf Tagesabrechnung

**`src/components/cash/DailyPrintView.tsx`** — Zeile „Offen" im linken Block bleibt erhalten (Summe). Zusätzlich: Unter dem Betrag ein kleiner, dezenter Text mit den Namen aller aktiven Settlements, kommagetrennt (z. B. „Meier · Schmidt · Tisch 12"), Doppelname wenn zwei Einträge denselben Namen tragen bleibt bewusst — es sind separate Rechnungen.

**`src/routes/_authenticated/admin/kasse.tsx`** (Admin-Detailansicht) und **`SettlementsCard`**: In der Zeile eines Kellners den Wert „Offen" um einen Tooltip/Untertext mit den Namen ergänzen (kleine, muted Schrift unter dem Betrag).

**Optional in Reichweite**: Telegram-Report (`telegram-report.server.ts`) und `daily-summary-data.ts` bleiben unverändert (Summen), damit der Umfang klein bleibt.

## Admin-Pfade (Korrektur + Neuanlage)

`SettlementCorrectionDialog` und der Admin-„Neue Abrechnung"-Dialog erhalten dieselbe Listen-UI wie die Kellner-Seite und senden `openInvoiceEntries`. Beim Öffnen der Korrektur werden vorhandene Einträge aus `open_invoices_details` vorbelegt.

## Tests

- `waiter-settlement.test.ts` bleibt (rechnet nur mit Cents-Summe).
- Neuer Test `cash-open-invoices.db.test.ts`:
  - Kellner-Submit ohne Namen aber mit Betrag > 0 → Fehler.
  - Submit mit zwei Einträgen → Summe in `open_invoices_cents`, JSONB korrekt persistiert.
  - Korrektur ersetzt Einträge vollständig.
- UI-Snapshot/Interaktionstest für die neue Liste (nur wenn schon Vitest-DOM-Setups bestehen — sonst weglassen).

## Nicht enthalten (bewusst)

- Keine Migration bestehender Zeilen: alte Settlements haben `open_invoices_details = []`; die Zahl in `open_invoices_cents` bleibt sichtbar, nur ohne Namen. Keine Rückwirkung auf abgeschlossene Geschäftstage.
- Kein Rebuild von Telegram/PDF-Bargeld-Export (Betrag reicht dort).
- Keine Änderung an Pool-/Tip-/Bargeld-Berechnung.
