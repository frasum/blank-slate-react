## Ziel

Pro Mitarbeiter und Tag maximal **eine** `roster_shifts`-Zeile — standort- UND bereichsübergreifend. Durchsetzung auf App-Ebene (Server-Pre-Check + UI-Lock), kein DB-Constraint, keine Migration. Altdaten bleiben unangetastet.

## Änderungen

### 1. `src/lib/roster/roster.functions.ts`

**`createRosterShift.handler`** — nach `assertShiftDateUnlocked(...)` und vor dem `upsert`:

```ts
const { data: existing, error: existErr } = await supabaseAdmin
  .from("roster_shifts")
  .select("location_id, area, locations(name)")
  .eq("organization_id", caller.organizationId)
  .eq("staff_id", data.staffId)
  .eq("shift_date", data.shiftDate)
  .limit(1)
  .maybeSingle();
if (existErr) throw existErr;
if (existing) {
  const locName = (existing.locations as { name: string } | null)?.name ?? "—";
  throw new Error(
    `Mitarbeiter ist an diesem Tag bereits eingeteilt (${locName} · ${existing.area}).`,
  );
}
```

Upsert-`onConflict` `(staff_id, location_id, shift_date, area)` bleibt unverändert. Create wird damit bewusst nicht mehr idempotent — durch den UI-Lock praktisch unkritisch.

**`moveRosterShift.handler`** — nach dem bestehenden Same-Area-Clash-Block zusätzlich:

```ts
const { data: elsewhere, error: elseErr } = await supabaseAdmin
  .from("roster_shifts")
  .select("location_id, area, locations(name)")
  .eq("organization_id", caller.organizationId)
  .eq("staff_id", data.staffId)
  .eq("shift_date", data.shiftDate)
  .neq("id", data.id)
  .limit(1)
  .maybeSingle();
if (elseErr) throw elseErr;
if (elsewhere) {
  const locName = (elsewhere.locations as { name: string } | null)?.name ?? "—";
  throw new Error(
    `Mitarbeiter ist an diesem Tag bereits eingeteilt (${locName} · ${elsewhere.area}).`,
  );
}
```

`locations(name)` ist to-one → Cast als `{ name: string } | null` (Hausstil, vgl. `getStaffCrossBookings`).

### 2. `src/routes/_authenticated/admin/dienstplan.tsx`

- Aus `crossBookings` eine Lock-Map `staffId|date → { locationName, area }` bauen (alle Einträge, nicht nur fremde Standorte/Areas).
- In `handleCreate(staffId, iso, …)` und `handleDragEnd` **vor** dem Server-Call prüfen: existiert ein Map-Eintrag für `(staffId, iso)`, der nicht die gerade verschobene Schicht ist → `toast.error("… ist bereits in {locationName} · {area} eingeteilt.")` + Abbruch (kein Server-Call).
- Map an `<RosterGrid>` durchreichen; gelockte Zellen optisch deaktiviert (`cursor-not-allowed`, gedimmt). Paint/Klick triggern dort keinen Create.
- Bestehender roter Cross-Booking-Marker bleibt; nur zusätzlich der Lock-Zustand.

### 3. Realtime

Keine Änderung. Bestehender Channel invalidiert bei jeder `roster_shifts`-Mutation auch `["roster-cross-bookings"]` → Lock-Map aktualisiert sich live. Nur verifizieren, dass die Map aus genau dieser Query gespeist wird.

## Nicht anfassen

- Kein DB-Unique-Constraint, keine Migration auf `(organization_id, staff_id, shift_date)`.
- Upsert-`onConflict`-Key unverändert.
- `setAbsenceRange`, Verfügbarkeit/Abwesenheit, Paint-Toolbar darüber hinaus, roter Marker.
- Keine Bereinigung bestehender Doppelbelegungen.

## Erfolgs-Gate

- `npx prettier --write` + `npx eslint --fix` über alle geänderten Dateien.
- `tsc --noEmit`, `eslint . --max-warnings=5`, `vitest run` grün; CI grün.
- Manueller E2E:
  (a) MA an Tag X Standort A einteilen → Einteilen an Standort B (gleicher Tag) schlägt mit deutscher Meldung fehl.
  (b) Drag derselben Schicht in anderen Bereich gleicher Tag funktioniert (kein Falsch-Clash, dank `.neq("id", data.id)`).
  (c) Zelle eines an Tag X bereits eingeteilten MA ist gedimmt/`cursor-not-allowed`; Paint/Klick löst nichts aus.
  (d) Nach Anlegen/Verschieben aktualisiert sich der Lock live ohne Refresh.