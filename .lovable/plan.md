## Ziel
Granulare Rechte für **M3 Dienstplan**: Schichten, Verfügbarkeit, Abwesenheit, Wunschfrei und Urlaubsanträge. Gleiche Mechanik wie M1/M2: Enum-Keys + Defaults + `has_permission(key, location?)` in RLS und Server-Funktionen, `runWithPermission` ersetzt `runGuarded(caller.role, …)`.

Betroffene Tabellen: `roster_shifts`, `roster_availability`, `roster_absence`, `day_off_wishes`, `leave_requests`.

## Permission-Keys (neu im Enum `app_permission`)
Modul **Dienstplan (`roster`)**:
- `roster.shift.view_self` — eigene Schichten sehen
- `roster.shift.view_all` — Schichten aller MA sehen (scopable Standort)
- `roster.shift.manage` — anlegen, verschieben, löschen, Skill ändern (scopable)
- `roster.shift.status` — Status setzen (anwesend/krank/abgesagt) (scopable)
- `roster.availability.manage_self` — eigene Verfügbarkeit/„Kann nicht" pflegen
- `roster.availability.manage_all` — Verfügbarkeit fremder MA pflegen (scopable)
- `roster.absence.view` — Abwesenheiten sehen
- `roster.absence.manage` — Abwesenheiten setzen/löschen (scopable)
- `roster.wish.create_self` — eigene Wunschfrei-Tage
- `roster.wish.view_all` — Wünsche aller MA sehen
- `roster.wish.manage_all` — Wünsche fremder MA löschen
- `roster.leave.request_self` — eigenen Urlaubsantrag stellen / zurückziehen
- `roster.leave.view_all` — alle Anträge sehen
- `roster.leave.decide` — Anträge genehmigen / ablehnen

### Default-Matrix (Vorschlag)
| Recht | admin | manager | staff | payroll |
|---|:-:|:-:|:-:|:-:|
| roster.shift.view_self | ✓ | ✓ | ✓ | – |
| roster.shift.view_all | ✓ | ✓ | – | – |
| roster.shift.manage | ✓ | ✓ | – | – |
| roster.shift.status | ✓ | ✓ | – | – |
| roster.availability.manage_self | ✓ | ✓ | ✓ | – |
| roster.availability.manage_all | ✓ | ✓ | – | – |
| roster.absence.view | ✓ | ✓ | – | ✓ |
| roster.absence.manage | ✓ | ✓ | – | – |
| roster.wish.create_self | ✓ | ✓ | ✓ | – |
| roster.wish.view_all | ✓ | ✓ | – | – |
| roster.wish.manage_all | ✓ | ✓ | – | – |
| roster.leave.request_self | ✓ | ✓ | ✓ | – |
| roster.leave.view_all | ✓ | ✓ | – | ✓ |
| roster.leave.decide | ✓ | ✓ | – | – |

Admins ignorieren Overrides (wie M1/M2).

## Migrationen (zwei Stück, drop-then-create)

### Migration 1 — Enum + Defaults
- 14 Werte zu `app_permission` ergänzen (`ALTER TYPE … ADD VALUE`).
- Seeds in `permission_role_defaults` gemäß Matrix.

### Migration 2 — Policy-Umbau
- **roster_shifts**
  - SELECT: `current_organization_id() AND (staff_id = current_staff_id() OR has_permission('roster.shift.view_all', location_id))`.
  - INSERT/UPDATE/DELETE: `roster.shift.manage` (Status-only-Updates via separate UPDATE-Policy mit `roster.shift.status`).
- **roster_availability**
  - SELECT: eigene oder `roster.availability.manage_all` (Manager sieht Team).
  - INSERT/UPDATE/DELETE: eigene → `roster.availability.manage_self`; fremde → `roster.availability.manage_all`.
- **roster_absence**
  - SELECT: `roster.absence.view`.
  - Write: `roster.absence.manage`.
- **day_off_wishes**
  - SELECT: eigene oder `roster.wish.view_all`.
  - INSERT eigener: `roster.wish.create_self`; DELETE eigener: `roster.wish.create_self`; DELETE fremder: `roster.wish.manage_all`.
- **leave_requests**
  - SELECT: eigene oder `roster.leave.view_all`.
  - INSERT: `roster.leave.request_self` (eigene staff_id) — wird im Server zusätzlich geprüft.
  - DELETE (zurückziehen): eigene + Status='offen'.
  - UPDATE (Entscheidung): `roster.leave.decide`.

Bestehende Policies werden vorher gedroppt (Drops vor Creates).

## Server-Funktionen
- `src/lib/roster/roster.functions.ts` (22 SFNs) — `runGuarded(role, 'manager', …)` → `runWithPermission(supabase, key, locationId, audit, op)`:
  - Reads (`getRosterShifts`, `getStaffForRoster`, `listSkills`, `getStaffCrossBookings`, `getAvailability`, `getAbsences`, `getDayOffWishes`) → kein Code-Gate, RLS reicht.
  - `getMyShifts`, `getMyDayOffWishes` → eigenes Staff-ID-Gate bleibt.
  - `createRosterShift`, `deleteRosterShift`, `updateRosterShiftSkill`, `moveRosterShift` → `roster.shift.manage` mit `location_id`.
  - `updateRosterShiftStatus` → `roster.shift.status`.
  - `setUnavailable`/`clearUnavailable` für eigene Staff → `roster.availability.manage_self`; für fremde → `roster.availability.manage_all`.
  - `setAbsence`, `clearAbsence`, `setAbsenceRange` → `roster.absence.manage`.
  - `createDayOffWish` (eigene) → `roster.wish.create_self`; `deleteDayOffWish` (eigene → create_self, fremde → manage_all).
- `src/lib/roster/leave.functions.ts`:
  - `requestLeave`, `cancelMyLeaveRequest` → `roster.leave.request_self`.
  - `listLeaveRequests` → `roster.leave.view_all`.
  - `decideLeaveRequest` → `roster.leave.decide`.

## UI
- `permissions-catalog.ts`: 14 neue Einträge im neuen Modul `dienstplan` (Label „Dienstplan & Urlaub"). Bestehender Tab in der Mitarbeiter-Detailseite zeigt die Gruppe automatisch.

## Tests
- DB-Tests `src/lib/roster/roster-permissions.db.test.ts`:
  - staff sieht nur eigene Schichten; mit `view_all`-Allow → alle (ggf. location-scoped).
  - manager ohne `roster.leave.decide` → `decideLeaveRequest` wirft Forbidden.
  - deny überstimmt allow (Regression).

## Schritte
1. Migration 1 (Enum + Defaults).
2. Migration 2 (Policy-Umbau).
3. `roster.functions.ts` + `leave.functions.ts` auf `runWithPermission` umstellen.
4. Katalog erweitern (Modul `dienstplan`).
5. DB-Test schreiben + manuell verifizieren.
6. Memory aktualisieren.

## Offene Punkte (bitte bestätigen)
1. **Schicht-Status separat** (`roster.shift.status`) von `roster.shift.manage`? Vorschlag: ja — Schichtleiter darf Status setzen, aber nicht Schichten anlegen.
2. **payroll-Rolle**: bekommt sie `roster.absence.view` + `roster.leave.view_all` (für Lohnabrechnung)? Vorschlag: ja, sonst keine Roster-Rechte.
3. **Scope `view_all` / `manage`**: standortspezifisch einschränkbar (wie M1)? Vorschlag: ja.
4. **Wunschfrei + Urlaub** in eigenem Modul „Urlaub" oder im Modul „Dienstplan"? Vorschlag: alles in **Dienstplan** (eine UI-Gruppe).
