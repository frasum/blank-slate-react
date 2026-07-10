# STAT-U2 — Umsatzentwicklung (3 Serien) + Take-Away-Kanäle-Donut

Erweitert die bestehende Statistik-Seite (Umsatz-Tab) um zwei aus der Alt-App `tagesabrechnung` bewährte Auswertungen — rein aus COCO-Daten (Sessions, Channel-Amounts, Waiter-Settlements). Kein Schema-Change.

## Umfang

1. **Server + reine Logik**
   - `revenue-core.ts` erweitern:
     - `DailyRevenue` bekommt Feld `cardCents: number`.
     - `sessionRevenue`/`aggregateByBusinessDate` bleiben rückwärts­kompatibel; Kreditkarten fließen als separater Aggregations-Parameter (Map `sessionId → cardCents`) über `aggregateByBusinessDate(sessions, cardBySession?)` ein — Default 0.
     - Neue reine Helfer:
       - `groupTakeawayByChannel(rows: { name: string; amountCents: number }[]) → { name, amountCents }[]` (Summe pro Name, absteigend sortiert).
       - `computeChannelPercents(items) → { name, amountCents, pct }[]` mit Largest-Remainder-Runden, sodass Σ pct = 100 (bzw. 0 bei leerer Liste).
   - `revenue-stats.functions.ts` erweitern:
     - Zusätzliche Query `waiter_settlements` (org + Zeitraum + optional `location_id`, `card_total_cents` je `business_date`/`session_id`) → in `aggregateByBusinessDate` einspeisen.
     - Zusätzliche Query `session_channel_amounts` mit Join `revenue_channels(name, is_takeaway)` filtert `is_takeaway=true` und liefert pro Kanalname die Summe. Ergebnis `takeawayByChannel` (sortiert abst.) im Response ergänzen.
     - Vorperiode: Nur Basis-Summary (kein Kanal-Split, keine Card-Serie) — wie bisher.
   - `revenue-map.ts` ggf. minimal anpassen, falls Card-Merge dort besser aufgehoben ist (bevorzugt reine Aggregation in `revenue-core`).

2. **UI — `/admin/statistik` Umsatz-Tab (`statistik.tsx`)**
   - **Karte „Umsatzverlauf"**: bestehendes `BarChart` durch `ComposedChart` mit drei Serien ersetzen:
     - `Area` Tagesumsatz (blau, gefüllt)
     - `Line` Kreditkarten (orange, gestrichelt)
     - `Line` Takeaway (grün)
     - Gemeinsame `Tooltip` in € (de-DE via bestehende `fmtCents`), Legende unter dem Chart.
     - Vergleich/Trend-Kopfteil der Karte unverändert.
   - **Neue Karte „Take Away Kanäle"** direkt darunter:
     - `PieChart` (Donut, `innerRadius`) aus `takeawayByChannel` + `computeChannelPercents`.
     - Segment-Labels mit Prozent, Legende `Name — X,XX € (yy %)`, Fußzeile `Gesamt Takeaway: … €` = bereits vorhandene `summary.takeawayCents`.
     - Leerer Zeitraum / keine Takeaway-Umsätze → dezenter Leer-Zustand (Text), kein leerer Donut.

3. **Tests (Vitest)** — `revenue-core.test.ts` erweitern:
   - `aggregateByBusinessDate` mergt `cardCents` korrekt (mit/ohne Map).
   - `groupTakeawayByChannel` summiert, sortiert.
   - `computeChannelPercents` Σ = 100 bei Rundungskanten (z. B. drei Kanäle mit 1/3), leere Liste → [].

## Nicht anfassen

- Trinkgeld-/Personal-Tabs, `tip-stats.functions.ts`, `personnel-stats.functions.ts`.
- Keine Migrationen / RLS-Änderungen.
- `revenue-core.ts` Bestandslogik (Haus/Takeaway, vectron/pos-Sonderfälle) — nur erweitern.
- Keine hartkodierten Kanalnamen — alles aus `channels.name`.

## Vor dem Commit

`npx prettier --write .` und `npx eslint --fix` auf die geänderten Dateien; Erfolgs-Gate: `tsc --noEmit`, `eslint .`, `prettier --check .`, `vitest run` alle grün.

## Technische Notizen

- `waiter_settlements` liefert card-Beträge pro Session; Zuordnung Session → `business_date` bereits über die Sessions-Query. Card-Map wird als `Record<sessionId, number>` an `aggregateByBusinessDate` gereicht, damit `revenue-core` rein bleibt.
- `takeawayByChannel` wird über denselben `session_channel_amounts`-Read gewonnen, den `loadWindow` schon macht — nur mit zusätzlichem `revenue_channels(name)` im Select und einer zweiten Gruppierung; keine zweite Roundtrip-Query nötig.
- `ComposedChart` ist Teil von `recharts` und benötigt keinen neuen Import auf Package-Ebene.
