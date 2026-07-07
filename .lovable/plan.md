
## TG1 — Umfang

Ziel: Trinkgeld-Parameter (Küchen-Rate, Mindeststunden, kitchen-manual-only, **neu:** Service-Pool an/aus) pro Standort überschreibbar, sonst Org-Standard. Plus: Warndialog beim Abschluss, wenn Pool > 0 € bei 0 anrechenbaren Minuten.

## Rückfragen an dich (vor Umsetzung)

1. **Rate-Snapshot beim Erfassen einer Kellner-Abrechnung**: `submitWaiterSettlementCore` / `adminCreateWaiterSettlementCore` snapshotten heute `settings.kitchenTipRate` in `waiter_settlements.kitchen_tip_rate`. TG1 lässt die Erfassung ansonsten unangetastet — nur die **Quelle** der Rate wechselt auf `loadTipSettings(orgId, session.location_id)`. So kommt der Standort-Override tatsächlich zum Tragen. Bestätigst du das? (Ohne diesen Wechsel wäre der Override wirkungslos.)
2. **Warndialog auf `finalizeSession`** (nicht `lockSession`) — TG1 sagt „beim Finalisieren". Session-Endpunkt liefert Zusatz-Payload `poolWarning?: { serviceCents; kitchenCents; eligibleMinutes }` und ein neuer `confirm: true` bricht die Warnung durch. Alternative: separater Preview-Aufruf vor `finalizeSession`. **Vorschlag: gleicher Endpunkt mit `confirm`-Flag** (weniger Round-Trips).
3. **`serviceRemainder` bei Pool=aus**: Anweisung sagt `serviceRemainder = 0` (kein Phantom-Rest). Bestätigt — d. h. bei `tip_service_pool_enabled=false` fließt individuelles Trinkgeld nirgendwo mehr in Aggregate/Statistik als „Rest" ein.

Wenn (1)–(3) so passen, baue ich ohne weitere Zwischenfragen.

## Migration (separate Datei, kein Merge-Konflikt mit RT1/SP1)

```sql
ALTER TABLE public.locations
  ADD COLUMN tip_service_pool_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN kitchen_tip_rate_override numeric(5,4)
    CHECK (kitchen_tip_rate_override IS NULL
           OR (kitchen_tip_rate_override >= 0 AND kitchen_tip_rate_override <= 0.2)),
  ADD COLUMN tip_pool_min_hours_override numeric(4,1)
    CHECK (tip_pool_min_hours_override IS NULL OR tip_pool_min_hours_override >= 0),
  ADD COLUMN kitchen_manual_only_override boolean;
```

Default `true` für `tip_service_pool_enabled` → bitgenau altes Verhalten für Bestand.

## Neuer Loader (Vererbung)

`loadTipSettings(orgId, locationId)` in `src/lib/cash/tip-settings.ts` (neu):

```ts
type TipSettings = {
  servicePoolEnabled: boolean;    // default true
  kitchenTipRate: number;         // COALESCE(loc.override, org, 0.02)
  tipPoolMinHours: number;        // COALESCE(loc.override, org, 2.5)
  kitchenManualOnly: boolean;     // COALESCE(loc.override, org, false)
};
```

`loadOrgSettings` bleibt bestehen und unangetastet (Wasserlinie & Co lesen es weiter).

## Backend-Verkabelung

`computeSessionTipPoolCore` bekommt neben `LoadedOrgSettings` optional `tipSettings: TipSettings` und benutzt intern die Overrides. Alle heutigen Aufrufer laden künftig `loadTipSettings(org, session.location_id)`:

* `getTipPoolOverviewCore`
* `getMySettlementCore` (Rate-Anzeige + Pool-Anteil)
* `getTipRemainderByPeriod` (pro-Standort → pro-Standort-Settings)
* `tip-stats.functions.ts` — je Session `loadTipSettings(org, s.location_id)` (Cache per locationId im Loop)
* `submitWaiterSettlementCore` / `adminCreateWaiterSettlementCore` — Rate-Quelle wechseln (siehe Rückfrage 1)

`computeSessionTipPoolCore` bei `servicePoolEnabled = false`:
* Küchen-Berechnung unverändert.
* `computeTipPool` wird mit `servicePoolCents: 0` gerufen; Service-Zeilen werden aus `result.shares` gefiltert; `serviceRemainder = 0` (statt Pool-Rest); `servicePoolCents` im Rückgabe-Objekt = 0.
* `poolEntries` behält Service-MA (für Anzeige „Eigenes Trinkgeld"), aber `shareCents` bleibt 0.

**`tip-pool.ts` selbst wird NICHT verändert. Die bestehenden `tip-pool.test.ts`-Fälle bleiben grün.**

## Warndialog (Pool ohne Stunden)

Neuer reiner Helfer in `tip-pool.ts`:
```ts
export function poolNeedsHoursWarning(poolCents: number, totalEligibleMinutes: number): boolean {
  return poolCents > 0 && totalEligibleMinutes <= 0;
}
```

`finalizeSessionCore` erweitert:
* Vor der Statusänderung `computeSessionTipPoolCore` laufen lassen und `totalEligibleMinutes` (Summe aller `poolEntries.hoursMinutes` von teilnehmenden MA) ermitteln.
* Wenn `poolNeedsHoursWarning(kitchenPoolCents, min) || poolNeedsHoursWarning(servicePoolCents, min)` und **nicht** `data.confirmPoolWarning === true` → strukturierte Warnung werfen (neue Fehlerklasse `PoolHoursWarning` mit `serviceCents/kitchenCents/eligibleMinutes`).
* UI in `kasse.tsx` fängt Fehler, zeigt Bestätigungsdialog, ruft mit `confirmPoolWarning: true` erneut auf.
* Audit-Log-Meta bei Bestätigung: `poolHoursWarningConfirmed: true, poolCents, eligibleMinutes`.

## UI

### Standort-Editor (`src/components/admin/LocationTipPoolPanel.tsx`, neu)
Sektion „Trinkgeld" unter „Betriebskalender":
* Schalter „Service-Pool aktiv (Trinkgeld wird geteilt)"
* Drei Override-Felder (Placeholder = geerbter Org-Standard): Küchen-Abgabe %, Mindeststunden, Küche-manuell
* Leerlassen = geerbt. Save → neue Server-Fn `updateLocationTipSettings` (manager+, Audit-Log).

### Kellner-Tagesansicht (`components/cash/*` / `getMySettlementCore` UI)
Wenn `servicePoolEnabled=false`: „Dein Pool-Anteil" ersetzt durch „Eigenes Trinkgeld verbleibt bei dir · Küchen-Abgabe X %".

### Trinkgeld-Rest (`trinkgeld-rest.tsx`)
Service-Spalte für solche Standorte „—" mit Tooltip „kein Service-Pool an diesem Standort".

### Statistik (`statistik.tsx` Trinkgeld-Karte)
Für Sessions ohne Service-Pool wird `serviceCents=0` beigetragen und in der Fußzeile „N Sessions ohne Service-Pool" ausgewiesen (kein Trend-Verlust — Küche zählt normal).

### Finalize-Dialog (`kasse.tsx`)
Fangt `PoolHoursWarning`, zeigt Confirm-Modal mit den Beträgen.

## Neue Tests

* `tip-pool.test.ts` (nur **ergänzt**, bestehende Fälle unangetastet): `poolNeedsHoursWarning` Matrix.
* `tip-settings.test.ts`: COALESCE-Vererbung (Override gesetzt / NULL / Org-Fallback).
* `tip-pool-service-disabled.test.ts` (integration-nah, mit Fake-Loader): `servicePoolEnabled=false` → `serviceShares` leer, `serviceRemainder=0`, Küche unverändert.

## Nicht angefasst

* `computeTipPool`-Formel & Bestandstests
* Ledger/Bargeld-Export, Kassen-Finalize-Ablauf jenseits des Warndialogs
* `organization_settings`-Bestandsfelder
* `pap-2026/**`, Lohn, Bestellwesen, RT1/SP1-Bereiche

## Erfolgs-Gate

`tsc`, `eslint --max-warnings=0`, `prettier --check`, `vitest run` (alle Bestandstests + neue).

---

**Antworte kurz mit „ok" oder Änderungen zu (1)/(2)/(3), dann baue ich in einem Zug durch.**
