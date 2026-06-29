## M-Statistik Schritt 2 — Server-Fn + Perioden-Anbindung

Zwei neue Dateien (plus ein Test). Keine UI, keine Migration, keine Änderung an `revenue-core.ts`.

### Datei 1 — `src/lib/statistics/revenue-map.ts`

Reine Mapping-Funktion ohne DB-Zugriffe.

- Typen `SessionRow` und `ChannelAmountRow` wie spezifiziert.
- `mapToSessionInputs(sessions, channelAmounts)`:
  - Channel-Amounts per `Map<sessionId, ChannelAmount[]>` gruppieren.
  - Über `sessions` iterieren (Reihenfolge = Eingabe), für jede Session `{ sessionId, businessDate, locationId, vectronCents, channels: map.get(id) ?? [] }` bauen.
  - Channel-Amounts mit unbekannter `sessionId` werden implizit ignoriert (kein passender Bucket).

### Datei 1-Test — `src/lib/statistics/revenue-map.test.ts`

- Session mit zwei Kanälen (1× takeaway, 1× nicht) → korrekte `channels[]`.
- Session ohne Kanäle → `channels: []`.
- ChannelAmount mit unbekannter `sessionId` → wird ignoriert, alle anderen Sessions unverändert.
- Reihenfolge: Output-Reihenfolge gleich Sessions-Eingabereihenfolge.

### Datei 2 — `src/lib/statistics/revenue-stats.functions.ts`

Dünne Read-Server-Fn nach Muster der bestehenden `lohn`-Server-Fns:

```ts
export const getRevenueStats = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: {
    periodId?: string;
    startDate?: string;
    endDate?: string;
    locationId?: string;
  }) => d)
  .handler(async ({ data, context }) => { … });
```

Handler-Ablauf:

1. `caller = await loadAdminCaller(context.supabase, context.userId, ["manager","admin","payroll"])`; `org = caller.organizationId`.
2. `supabaseAdmin` per `await import("@/integrations/supabase/client.server")` laden (in der Handler-Funktion, nicht top-level).
3. Zeitraum auflösen:
   - `periodId` gesetzt → `periods` lesen (`id=periodId AND organization_id=org`); fehlend → Error „Periode nicht gefunden". Label aus DB.
   - Sonst: `startDate` und `endDate` Pflicht, sonst Error. `label = null`.
4. Vorperiode auflösen:
   - `periodId` → größte Periode mit `start_date < current.start_date AND organization_id=org` (`order start_date desc limit 1`). Keine → `previous = null`.
   - Sonst: gleich langes Fenster direkt davor: `prevEnd = startDate − 1 Tag`, `prevStart = prevEnd − (endDate − startDate)` (Tagesdifferenz in Tagen).
5. Reine Hilfsfunktion `loadWindow(start, end)`:
   - `sessions` lesen: `select id, business_date, location_id, vectron_daily_total_cents` where `organization_id=org AND business_date between start and end [AND location_id=locationId]`. Alle Status (kein Filter — S-6-Begründung als Kommentar).
   - `session_channel_amounts` lesen mit Join: `.select("session_id, amount_cents, revenue_channels!inner(is_takeaway)")` where `organization_id=org AND session_id in (...)`. Wenn keine Sessions → leeres Array, kein Query.
   - Beide Rows in `SessionRow[]` / `ChannelAmountRow[]` mappen (mit minimalem expliziten Typ für die Join-Zeile, kein `any`).
   - `mapToSessionInputs` → `aggregateByBusinessDate` → `summarize`. Rückgabe `{ daily, summary }`.
6. `current = loadWindow(currentStart, currentEnd)`; wenn `previous`-Fenster existiert: `prev = loadWindow(prevStart, prevEnd)` (nur `summary` verwendet), sonst `null`.
7. Trend: wenn `prev` null → `trend = null`. Sonst `{ total, house, takeaway }` mit `computeTrend(current.summary.X, prev.summary.X)`.

Rückgabe-Shape exakt wie in der Spezifikation.

### Hinweise

- TSB-Verifikationspunkt (vectron + „Kasse"-pos-Kanal evtl. doppelt) als Code-Kommentar an der Fetch-/Map-Stelle vermerken — keine Sonderlogik.
- `locationId` (optional) wird ungeprüft in den `eq`-Filter genommen; Org-Scope der `sessions`-Query stellt sicher, dass keine Fremd-Org sichtbar wird.
- Keine Änderungen an `revenue-core.ts`.

### Erfolgs-Gate

`tsc --noEmit`, `eslint src/ --max-warnings=5`, `vitest run` grün. `revenue-map.test.ts` grün. Keine `any`. Vor dem Commit `prettier --write src/` + `eslint --fix`.
