## Ziel

Org-weiter Schalter „Küchentrinkgeld manuell verteilen". Wenn aktiv, werden für Küche ausschließlich manuell eingegebene Start/Ende-Schichten als Stundenbasis verwendet; Service bleibt auf Stempelstunden. Geld- und Snapshot-Logik (`kitchen_tip_cents`, Pool-Verteilung) bleibt unverändert.

## Schritte

### 1) Migration (per supabase--migration)
```sql
alter table public.organization_settings
  add column if not exists kitchen_manual_only boolean not null default false;

alter table public.session_tip_pool_entries
  add column if not exists shift_start time,
  add column if not exists shift_end   time;
```
Keine neuen Policies/Grants (Tabellen existieren, RLS gilt fort).

### 2) Neue reine Funktion + Tests
- `src/lib/cash/kitchen-shift-hours.ts` mit `kitchenShiftMinutes(start, end)`:
  - Parse `HH:MM`, sonst `throw`.
  - `end > start` → Differenz; `end < start` → +1440 (Mitternachts-Wrap); `end === start` → 0 (Kommentar: bewusste Abweichung vom Legacy „=24h").
- `src/lib/cash/kitchen-shift-hours.test.ts`: 10:00–18:00=480, 22:00–02:00=240, 17:00–01:00=480, 12:00–12:00=0, ungültig wirft.

### 3) Stunden-Auflösung extrahieren
- In `src/lib/cash/tip-pool.ts` neue reine Funktion `resolvePoolTimeEntries({ rawTimeEntries, manualEntries, staffDepartments, settlementOnly, kitchenManualOnly })`.
- Regeln:
  - `settlementOnly` → keine Roh-Entries.
  - Mitarbeiter mit manuellem Eintrag: Stempel verworfen, synthetischer Entry aus `hoursMinutes`.
  - `kitchenManualOnly`: alle Roh-Entries von `department==='kitchen'` verwerfen (auch ohne manuellen Eintrag).
  - Service-Stempel unberührt.
- Tests in `src/lib/cash/tip-pool.test.ts` (sofern vorhanden; sonst in passender Testdatei) für die Matrix.

### 4) `computeSessionTipPoolCore` (in `src/lib/cash/cash.functions.ts`)
- `loadOrgSettings` lädt zusätzlich `kitchen_manual_only` → `kitchenManualOnly`.
- `staffDepartments`-Ladung **vor** den Stunden-Bau ziehen (Vereinigung der staffIds aus settlements + time_entries + manual).
- Stunden-Bau über `resolvePoolTimeEntries`. Pool- und Verteillogik bleiben.

### 5) Settings
- `src/lib/admin/org-settings.functions.ts`: `OrgSettings` + `updateSchema` um `kitchenManualOnly: boolean`; in `getOrgSettings`/`updateOrgSettings` lesen/schreiben; audit-meta erweitern.
- `loadOrgSettings` in `cash.functions.ts` analog.

### 6) `upsertSessionTipPoolEntry`
- Input optional `shiftStart?: string`, `shiftEnd?: string` (`HH:MM`).
- Wenn beide gesetzt: `hoursMinutes = kitchenShiftMinutes(...)` und `shift_start/shift_end` persistieren.
- Sonst Bestand (`shift_start/shift_end = null`).
- Lock-/Waterline-/Bind-Checks und `onConflict` unverändert; audit-meta um Shift-Werte ergänzen.

### 7) UI `src/components/cash/TipPoolCard.tsx`
- `kitchenManualOnly` über erweitertes `getTipPoolOverview` (oder zusätzliche Settings-Query) verfügbar.
- Wenn aktiv: Küchen-Block hat zwei `type="time"`-Felder (Von/Bis), Live-Vorschau via `kitchenShiftMinutes`. Beim Speichern Shift-Werte mitgeben.
- Service-Block: unverändert (Std:Min).
- Badge am Küchen-Pool: „Manuell — Stempelzeiten der Küche werden ignoriert".

### 8) UI `src/routes/_authenticated/admin/einstellungen.tsx`
- Switch „Küchentrinkgeld manuell verteilen (Stempelzeiten der Küche ignorieren)" neben `kitchen_tip_rate`. Admin-gated wie bestehend.

## Nicht anfassen
Service-Pool, `computeTipTotalCents`, `kitchen_tip_cents` (waiter-settlement), Snapshot `kitchen_tip_rate`, `tip_pool_settlement_only`-Pfad, `tip-aggregate.ts`, RLS-Policies, Sperr-/Geschäftstag-Logik.

## Erfolgs-Gate
- `tsgo` 0 Fehler, ESLint ≤5 Warnungen, Vitest grün inkl. neuer Tests.
- Manueller E2E: Schalter an → Küchen-Stempel ignoriert; manuelle Schicht 17:00–23:30 → 6,5 h im Küchen-Pool; Service unverändert; Schalter aus → Altverhalten.
- Prettier + ESLint --fix vor Commit.

## Offene Annahme
Schalter org-weit (konsistent mit `kitchen_tip_rate`). Falls pro Standort gewünscht: Bescheid geben, dann auf Location-Scope umstellen — nicht auf Verdacht.
