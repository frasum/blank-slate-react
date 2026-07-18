## Ziel
In `/admin/urlaub` (Tab „Urlaubsanträge") die Anträge den Standorten des jeweiligen Mitarbeiters zuordnen: sichtbar als Badges am Antrag und filterbar per LocationPills. Keine Änderung am Antragsformular für Mitarbeiter, keine neue DB-Spalte.

Grundlage: Ein Mitarbeiter kann mehreren Standorten zugewiesen sein (`staff_locations` — bereits vorhanden). Der Antrag selbst hat keinen Standort; die Zuordnung ergibt sich aus dem Mitarbeiter.

## Änderungen

### 1) `src/lib/roster/leave.functions.ts`
- `LeaveRequestRow` um `locationIds: string[]` erweitern.
- In `listLeaveRequests`-Handler:
  - Nach dem bestehenden Select zusätzlich per `supabaseAdmin` `staff_locations` für die betroffenen `staff_id`s laden (org-scoped): `select("staff_id, location_id").in("staff_id", staffIds).eq("organization_id", ...)`.
  - Map `staffId → Set<location_id>` bauen, `locationIds` je Zeile ergänzen. Kein neuer RLS-Bezug, keine Migration.
- `getMyLeaveRequests` bleibt unverändert (Mitarbeiter-Sicht braucht die Info nicht).

### 2) Neue Server-Fn `listOrgLocationsForAdmin` in `src/lib/admin/staff.functions.ts`
- Kleine `createServerFn({ method: "GET" })` mit `requireSupabaseAuth` + Rolle ≥ `manager` (Muster wie andere Admin-Fns in der Datei), liefert `{ id, name }[]` der **aktiven** Standorte der Org, sortiert wie in vergleichbaren Panels.
- Grund: `/admin/urlaub` hat aktuell keine Standort-Liste; diese Fn wird auch anderswo im Admin-Bereich wiederverwendbar sein.

### 3) `src/routes/_authenticated/admin/urlaub.tsx`
- Import `LocationPills` und die neue `listOrgLocationsForAdmin`.
- Zusätzliche Query `["admin", "locations"]` für die Standort-Liste.
- Über dem Status-Filter (`FILTERS`) eine Zeile mit `LocationPills` einfügen: `includeAll`, Default „Alle".
- State `locationFilter` (String, `"__all__"` = alle).
- Client-seitig `rows` zusätzlich filtern: `locationFilter === "__all__" || r.locationIds.includes(locationFilter)`.
- Pro Antrag rechts neben Name/Status kleine Standort-Badges rendern (`Badge variant="outline"`, Name aus Locations-Map). Bei mehreren Standorten mehrere Badges; bei keinem („—") nichts.
- Der offen-Zähler (`openLeaveQ`) bleibt unverändert (globaler Hinweis über alle Standorte); der Filter wirkt nur auf die sichtbare Liste.

### 4) Tests
- `leave.functions.ts`: bestehende Reihen-Mapping-Tests bleiben grün. Kein neuer DB-Test nötig (rein additive Ableitung aus `staff_locations`).
- Kein UI-Test-Zwang; TS/eslint/prettier über die drei geänderten Dateien.

## Nicht Teil dieses Schritts
- Keine Migration, keine neue Spalte `leave_requests.location_id`.
- Kein Filter/Badges auf der Mitarbeiter-Seite (`/zeit/urlaub`).
- Kein Schichttausch-Tab (bleibt wie ist).
- Keine Änderung am Vacation-Planner darunter.

## Erfolgs-Gate
- Filter „Alle / spicery / TSB / YUM" oben im Urlaub-Tab funktioniert und färbt den Header via bestehendem Location-Theme.
- Jeder Antrag zeigt die Standort-Zugehörigkeit(en) des Mitarbeiters als Badge.
- `tsc`, `eslint --max-warnings=0`, `vitest run`, `prettier --check` grün.
