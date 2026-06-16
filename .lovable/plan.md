## Ziel
Trinkgeld-Pool-Formel in COCO an Tagesabrechnung angleichen, sodass offene Rechnungen den Pool nicht künstlich ins Minus drücken und Hilfsmahlzeiten korrekt abgezogen werden.

## Änderung (eine Datei: `src/lib/cash/tip-pool.ts`)

`computeTipTotalCents` von

```ts
return Σ (card + cash − pos − open)
```

auf

```ts
return Σ (card + cash + open − pos − hilf)
```

umstellen. Eingangstyp bekommt zusätzlich `hilfMahlCents: number`.

**Konsequenz**:
- `servicePoolCents = tipTotal − kitchenPoolCents` bleibt strukturell gleich; nur die Basis ändert sich.
- `kitchenPoolCents` (Summe der `kitchen_tip_cents` aus Settlements) bleibt **unverändert** — Küchen-Trinkgeld weiterhin `POS × Rate`.
- `differenz_cents` der Kellner-Abrechnung bleibt **unverändert** — die Bargeld-Soll-Logik ist davon nicht betroffen.
- `safe-balance`, `cash-ledger`, `waiter-settlement` werden **nicht** angefasst.

## Caller-Anpassung
`computeSessionTipPoolCore` (`src/lib/cash/cash.functions.ts`, ~Z. 499/556) ergänzt `hilf_mahl_cents` im Settlement-SELECT und reicht die Summe an `computeTipTotalCents`/`computeTipPool` weiter. Sonst nichts.

## Tests
- `src/lib/cash/tip-pool.test.ts`: Bestehende Fälle anpassen (Vorzeichen `open` / neue `hilf`-Variable), einen Charakterisierungstest mit Spot-Check 06.03 YUM hinzufügen (Drei-Wege-Vergleich aus dem `arbeitsweise.md`-Eintrag) und einen neuen Negativ-Test: Tag mit großer offener Rechnung (z. B. 12.05. PON spicery, open = 850,63 €) → Pool **nicht** mehr negativ.
- `src/lib/cash/cash.functions` betreffende DB-Tests grün halten.

## Wirkung auf bestehende Anzeige
- `/admin/trinkgeld-rest`: Tage mit hohen offenen Rechnungen (11.05./12.05./20.05. etc.) zeigen künftig realistische, positive Restcents.
- Pool-Overview in `/admin/kasse` rechnet rückwirkend mit neuer Formel — historische Auszahlungen sind längst durch, es geht nur um die Anzeige.

## Explizit NICHT enthalten
- Keine Schema-Migration.
- Keine Änderung an `calcWaiterSettlement` / `differenz_cents`.
- Keine UI-Änderung außerhalb der automatisch neu berechneten Zahlen.
- Keine Backfill-/Nachzahlungs-Logik.
- Keine Übernahme der Tagesabrechnung-„gleichmäßig pro Kopf"-Verteilung — COCO bleibt bei „nach Stunden" (war bewusste Entscheidung, siehe `arbeitsweise.md`-Eintrag).

## Offene Frage vor Umsetzung
Tagesabrechnung zieht `hilf_mahl` vom Trinkgeld ab — du hast in deiner Frage nur `open` erwähnt. Soll ich `hilf_mahl` mitziehen (volle 1:1-Angleichung) oder nur `open` umdrehen?