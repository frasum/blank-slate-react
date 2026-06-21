## Kellner-Abrechnung: Trinkgeld-Summary + finaler Pool-Anteil

In `src/routes/_authenticated/zeit/abrechnung.tsx` (Read-only-Ansicht nach Abgabe) drei neue Zeilen unterhalb des bestehenden Blocks:

### 1. Mein Trinkgeld (sofort sichtbar)
**Bereits abzüglich Küchen-Anteil (2 %):**
`tipNet = max(0, differenz_cents)`
(Der Küchenanteil ist separat als „Trinkgeld Küche" ausgewiesen und hier bereits abgezogen — es bleibt der Überschuss, der in den Mitarbeiter-Pool fließt.)

### 2. Trinkgeld-Quote (sofort sichtbar)
`tipPct = tipNet / pos_sales_cents × 100` (1 Nachkommastelle, Komma; `–` wenn POS ≤ 0).
Basiert auf demselben Netto-Trinkgeld (Küche bereits raus).

### 3. Mein Pool-Anteil (nur final)
- Nur anzeigen, wenn `session.status === "locked"`.
- Vorher: kleiner Hinweis „Dein Anteil steht nach Tagesabschluss fest."
- Wert: floor auf vollen Euro (Vielfache von 100 Cent) — exakt die bestehende Logik aus `tip-pool.ts` (`Math.floor((pool * hours / totalHours) / 100) * 100`). Angezeigt wird nur der endgültige Eurobetrag (z. B. `42,00 €`).

### Server-Erweiterung (`src/lib/cash/cash.functions.ts`)
`getMySettlementCore` liefert zusätzlich:
- `myPoolShareCents: number | null` — `null`, solange Session nicht locked; sonst der Floor-Anteil des Aufrufers aus Küchen- oder Service-Pool (Department bestimmt Pool-Zuordnung wie in `tip-pool.ts`).
- Berechnung: bestehende Pool-Engine `computeTipPool` mit denselben Inputs wie `computeSessionTipPoolCore` aufrufen, dann `shares.find(s => s.staffId === caller.staffId)?.shareCents ?? 0`. Department/`participates_in_pool` wird wie dort aus `staff_locations` + `staff` geladen.
- Keine Änderung an Pool-Logik oder Persistenz.

### Frontend
- Drei neue `ReadOnlyRow`-Zeilen (gleiches Format wie bisher), eingefügt nach der Küchen-Trinkgeld-Zeile.
- „Mein Pool-Anteil" als eigener, hervorgehobener Block (etwas größerer Font, fett) — der finale Betrag ist das wichtigste Ergebnis.

Reine Anzeige-Funktion, keine Migration, keine Änderung an `waiter-settlement.ts`/`tip-pool.ts`.

### Hinweis zur Admin-Spalte
Die Admin-Spalte „Tip" in `SettlementsCard` bleibt wie zuletzt vereinbart auf Brutto (`kitchen_tip + max(0, differenz)`) inklusive Küchenanteil — das ist der Gesamt-Tipp, den der Kellner an dem Abend erwirtschaftet hat. Hier in der Kellner-Ansicht ist die 2 % Küche dagegen schon abgezogen, weil der Kellner den Netto-Anteil sehen will.