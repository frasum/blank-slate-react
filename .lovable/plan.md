
## Ziel

Das neue Feld **„Abzugebender Betrag"** (`kassiert_brutto`) soll:
1. **leer = OK** → automatisch den Wert aus **„Leistung (POS)"** übernehmen (Standardfall ohne Tisch-Transfer).
2. **bei Eingabe** als Eurobetrag parsebar und **≥ 0** sein, sonst Fehlerzustand am Feld.
3. **serverseitig** zusätzlich abgesichert (Schema + reine Logik), damit auch andere Aufrufer nicht negativ einliefern können.

Außerhalb des Scopes: Berechnungsformeln, Pool-Verteilung, PDF, Settlement-Warnings, Migration — alles bereits umgesetzt und bleibt unverändert.

## Änderungen

### 1. Kellner-Selbstabrechnung — `src/routes/_authenticated/zeit/abrechnung.tsx`

- `parsed.kassiertBruttoCents`:
  - wenn `form.kassiertBrutto.trim() === ""` → Fallback `parsed.posSalesCents`
  - sonst `parseEuroToCents(form.kassiertBrutto)` (liefert `null` bei Müll → Feld-Error)
- `allValid`: Feld nicht mehr „pflicht", nur valid wenn `kassiertBruttoCents !== null && kassiertBruttoCents >= 0`.
- `EuroField` für „Abzugebender Betrag":
  - `placeholder` = der aktuell eingegebene POS-Wert (oder „wie Leistung"), als optischer Hinweis auf den Fallback
  - `error` nur, wenn der User aktiv etwas Ungültiges eingetippt hat (also Eingabe vorhanden, aber nicht parsebar oder < 0)
- Kleiner Hinweistext unter dem Feld: „Leer lassen, wenn der abzugebende Betrag der Leistung entspricht."

### 2. Admin-Dialoge — `src/routes/_authenticated/admin/kasse.tsx`

Gleicher Fallback und gleiche Validierung in den beiden Dialogen **„Korrektur"** und **„Abrechnung manuell anlegen"**:

- Beim Aufbau der Server-Payload: `kassiertBruttoCents = kassiert ?? pos` (leer → POS übernehmen).
- Negative Eingabe → Eurobetrag-Fehler-Toast wie bei anderen Feldern.
- Beim Öffnen des Korrektur-Dialogs den vorhandenen DB-Wert vorbelegen (bleibt wie heute), beim Anlegen-Dialog Feld leer lassen (= Fallback auf POS).

### 3. Server-Schemas — `src/lib/cash/cash.functions.ts`

`kassiertBruttoCents` bleibt `z.number().int().min(0).optional()` (≥ 0 ist bereits enthalten). Zusätzlich beim Verarbeiten **explizit den Fallback auf `posSalesCents` zentralisieren** und kommentieren — in `submitWaiterSettlementCore`, `correctWaiterSettlementCore` und `adminCreateWaiterSettlementCore` einheitlich:

```ts
const kassiertBruttoCents = data.kassiertBruttoCents ?? data.posSalesCents;
```

Wert dann sowohl an `calcWaiterSettlement` als auch an den INSERT/UPDATE weiterreichen (statt heute zweimal `?? data.posSalesCents` zu schreiben).

### 4. Reine Logik — `src/lib/cash/waiter-settlement.ts`

In `calcWaiterSettlement` zusätzlich zur bestehenden Integer-Prüfung explizit:

```ts
if (kassiertBruttoCents < 0) throw new Error("kassiertBruttoCents must be >= 0");
```

Damit ist die Invariante in der reinen Funktion verankert — falls jemand am Server-Schema vorbei aufruft.

### 5. Tests — `src/lib/cash/waiter-settlement.test.ts`

Zwei kleine Tests ergänzen:

- `calcWaiterSettlement` wirft bei `kassiertBruttoCents = -1`.
- `calcWaiterSettlement` ohne `kassiertBruttoCents` und ohne explizite Übergabe verhält sich wie mit `kassiertBruttoCents = posSalesCents` (bereits da — bleibt grün als Regression-Anker für den Fallback).

## Erfolgs-Gate

- `tsgo --noEmit` grün
- `vitest run src/lib/cash` grün (inkl. neuer Negativ-Test)
- `prettier --write` auf geänderten Dateien
- Manuell: Feld leer lassen → Differenz/POS-Abgleich wie vorher (Fallback wirkt); negative Eingabe → Feld zeigt Fehler, Submit blockiert; positiver Wert ≠ POS → Differenz rechnet auf dem abzugebenden Betrag (unverändert zur vorherigen Stufe).
