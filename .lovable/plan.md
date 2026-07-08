## Ziel

Regel „Reservierungsname nur nötig, wenn Betrag > 0" systemweit konsistent verankern:
1. Admin-Formular an Kellner-UI angleichen (Zeile ohne Betrag > 0 wird ignoriert, auch mit Name).
2. Regel als Header-Kommentar in `src/lib/cash/open-invoices.ts` dokumentieren — das ist das zentrale Modul, das Server, Trigger, UI und Anzeige-Filter teilen.

## Änderungen

### 1. `src/lib/cash/open-invoices.ts` — Header-Kommentar erweitern

Am Dateikopf einen kurzen Regel-Block ergänzen, der die einzige Wahrheit festhält:

```
Regel (systemweit):
- Ein Reservierungsname ist genau dann Pflicht, wenn ein Betrag > 0 eingegeben
  wurde. Zeilen ohne Betrag > 0 werden verworfen (auch mit Name).
- Erzwungen an vier Stellen mit identischer Semantik:
  1) Kellner-UI (abrechnung.tsx) — blockt Absende-Button.
  2) Admin-Dialoge (admin/kasse.tsx, toOpenInvoiceEntries) — wirft Fehler.
  3) Server (cash.functions.ts, resolveOpenInvoicesInput) — wirft Fehler,
     Summe wird immer server-seitig aus den Einträgen berechnet.
  4) DB-Trigger tg_waiter_settlements_validate_open_invoices — letzte
     Verteidigungslinie.
- Anzeige (Print/PDF) filtert leere Namen defensiv aus; bei neuen Zeilen
  kann das durch die Trigger-Regel gar nicht mehr auftreten (Altdaten-Schutz).
```

Keine Verhaltensänderung am Modul selbst.

### 2. `src/routes/_authenticated/admin/kasse.tsx` — `toOpenInvoiceEntries` angleichen

Aktuell (Zeilen 66–83): Zeile mit Name + leerem/0-Betrag landet als `{name, cents: 0}` in der Liste. Kellner-UI verwirft solche Zeilen.

Angleichung: Zeile wird nur aufgenommen, wenn `cents > 0`. Ein Name ohne Betrag > 0 wird still ignoriert (analog Kellner-Filter `.filter(r => r.cents > 0)`).

Fehlerpfad bleibt: Betrag > 0 ohne Name wirft weiterhin die bekannte Meldung. Ungültiger Eurobetrag (parse-Fehler) wirft weiterhin.

Kommentar am Helper wird auf die neue Regel aktualisiert.

### 3. Tests

- `src/lib/cash/open-invoices.test.ts` bleibt unverändert (testet nur die reinen Helper).
- Ein neuer Kurztest wird nicht angelegt; `toOpenInvoiceEntries` ist eine kleine lokale Helferfunktion in einer Route-Datei ohne bestehenden Test-Rahmen — Testen würde das Muster im Projekt ändern. Falls du das trotzdem willst, sag Bescheid; dann ziehe ich den Helper in ein eigenes Modul mit Test.

## Nicht enthalten

- Keine DB-Migration (Trigger-Verhalten bleibt).
- Keine Änderung an Print/PDF (Anzeige-Filter bleibt als Altdaten-Defensive).
- Keine Änderung an Server-Funktionen oder Schema.
- Kein Eintrag in `docs/gruendungsdokument.md` (auf deinen Wunsch nur Code-Kommentar).