## Ziel

Wenn im Feld „Abzugebender Betrag" (`kassiertBrutto`) ein negativer Wert eingegeben wird, soll das UI eine klare Fehlermeldung anzeigen, statt das Feld nur stumm als ungültig zu markieren (`aria-invalid`) und den Absenden-Button zu deaktivieren.

## Änderungen

### 1. `src/lib/format.ts` (falls nötig prüfen)
Aktuell liefert `parseEuroToCents` bei negativen Zahlen vermutlich entweder `null` oder einen negativen Wert — Verhalten zuerst lesen. Keine Änderung an der Bibliothek, da sie an anderen Stellen verwendet wird; Validierung erfolgt im Aufrufer.

### 2. `src/routes/_authenticated/zeit/abrechnung.tsx`
- `parsed.kassiertBruttoCents` zusätzlich auf `< 0` prüfen und einen expliziten Fehlerzustand bauen:
  - `kassiertBruttoNegative = parsed.kassiertBruttoCents !== null && parsed.kassiertBruttoCents < 0`
- `allValid` zusätzlich um `!kassiertBruttoNegative` erweitern.
- `EuroField` für `kassiertBrutto`:
  - `error`-Prop bleibt für „kein Eurobetrag" (Parse-Fehler).
  - Neue Prop `errorMessage?: string` einführen, damit eine spezifische Meldung gezeigt werden kann („Der abzugebende Betrag darf nicht negativ sein."), die die Standard-Meldung „Bitte einen Eurobetrag eingeben." ersetzt.
- Übergabe: `errorMessage={kassiertBruttoNegative ? "Der abzugebende Betrag darf nicht negativ sein." : undefined}` und `error` entsprechend `parse-Fehler || kassiertBruttoNegative`.

### 3. `src/routes/_authenticated/admin/kasse.tsx`
Analoge Validierung an beiden Stellen (`correct.kassiertBrutto` und `createSettlement.kassiertBrutto`):
- Negativen Wert erkennen und Inline-Fehlermeldung neben dem Feld anzeigen (kleiner roter Hilfetext).
- Submit-Button deaktivieren, solange negativ.

### 4. Optional — Server-Defense bleibt bestehen
`calcWaiterSettlement` wirft bereits bei `< 0`. Keine Änderung; UI-Fehlermeldung verhindert nur, dass die Anfrage überhaupt rausgeht.

## Nicht angefasst

`waiter-settlement.ts` (Guard bleibt), Tests, `cash.functions.ts`, `SettlementsCard`, Pool-/PDF-Logik. Reine UI-Anpassung.

## Erfolg

- Eingabe `-5` im Feld „Abzugebender Betrag" → roter Hilfetext „Der abzugebende Betrag darf nicht negativ sein." direkt unter dem Feld, Absenden-Button bleibt deaktiviert.
- Leeres Feld → weiter Fallback auf Leistung (POS), kein Fehler.
- Prettier 3.7.3, tsc, eslint grün.
