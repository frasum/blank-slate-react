# Fix: Tip-Berechnung in Kellner-Abrechnungen

## Problem

Aktuell (in `SettlementsCard.tsx` Z. 67, `pdfExport.ts` Z. 415, `DailyPrintView.tsx` Z. 301) wird der Tip berechnet als:

```
tip = kitchen_tip_cents + max(0, differenz_cents)
```

Das ist inkonsistent zur kanonischen Pool-Formel in `tip-pool.ts` (`computeTipTotalCents`) und zählt den Küchen-Anteil de facto doppelt. Beispiel Screenshot: Bargeld 720 € → angezeigter Tip 478,67 €, real dürfte der Tip < Bargeld sein.

## Zielformel (Spicery-Abrechnung, vom User bestätigt)

Pro Settlement:
```
tipCents = cardTotalCents + cashHandedInCents + openInvoicesCents
         − kassiertBruttoCents (Fallback posSalesCents) − hilfMahlCents
```

Identisch mit `computeTipTotalCents` — eine Zeile, dieselbe Summe.

## Änderungen (nur Präsentationsschicht)

1. **`src/components/cash/SettlementsCard.tsx`**
   - `const tipTotal = …` (Z. 67) auf obige Formel umstellen. `kassiertBrutto`-Fallback beibehalten.
   - `tipPct` unverändert (`tipTotal / pos_sales`).

2. **`src/components/cash/DailyPrintView.tsx`** (Z. 293–305)
   - Pro-Zeilen-Ausgabe: neue `td` „Tip" mit der Pool-Formel pro Settlement (aktuell wird dort nur `kitchen_tip_cents` gezeigt — bleibt zusätzlich als Küchen-Anteil).
   - `sumTipAll` = Σ Pool-Formel über aktive Settlements (statt `sumKitchenTip + max(0, sumDiff)`).
   - Fußzeile „Mitarbeiter-Pool"/„Küchen-Pool" bleibt inhaltlich korrekt (`sumKitchenTip` und `sumTipAll − sumKitchenTip`).

3. **`src/lib/cash/pdfExport.ts`** (Z. 386, 413–430)
   - Analoge Umstellung: Tip pro Zeile via Pool-Formel; `sumTipAll` = Σ Pool-Formel.
   - Aufteilung „Mitarbeiter-Pool = sumTipAll − sumKitchenTip", „Küchen-Pool = sumKitchenTip".

## Nicht angefasst

- `waiter-settlement.ts`, `tip-pool.ts`, DB-Spalten, Migrations, `differenz_cents` bleiben unverändert (differenz ist weiterhin Kontroll-/Warnwert für Settlement-Warnings).
- Kein Refactor der Server-Funktionen; kein neuer Endpunkt.

## Technische Details

- `computeTipTotalCents` in `src/lib/cash/tip-pool.ts` bereits vorhanden — wird in SettlementsCard direkt pro Row-Objekt aufgerufen (Array mit einem Element), um Duplikation zu vermeiden.
- Fallback `kassiertBrutto ?? posSales` bleibt konsistent zur bestehenden `kassiertBrutto`-Semantik in der Row.
- Tests: `tip-pool` ist bereits getestet; die UI-Karten sind Präsentations-only, keine neuen Tests nötig. `vitest`, `tsc`, `eslint`, `prettier` laufen als Gate.

## Erfolgs-Gate

1. `bunx tsc --noEmit`, `bunx eslint . --max-warnings=0`, `bunx prettier --check .`, `bunx vitest run` grün.
2. Manuell (Screenshot-Fall): Bargeld 720 → Tip << 720 (Pool-Formel), Tip% konsistent.
3. Tages-PDF/Print zeigt Tip pro Kellner + gleiche Gesamtsumme wie SettlementsCard-Aggregation.
