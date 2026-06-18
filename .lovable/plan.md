## Ziel
Granulare Rechte für **M1 Zeiterfassung** (`time_entries`, `periods`, `payroll_notes`). Roster/Urlaub gehören zu M3 und werden später separat umgestellt.

Das M1-Modul schreibt fast alles über service-role-Server-Funktionen (`time.functions.ts`, `time-admin.functions.ts`), die Client-RLS deckt aktuell nur Reads ab. Der Umbau verschiebt deshalb den Hauptcheck von „Rolle ≥ manager/admin" (`runGuarded`/`has_min_permission`) auf `has_permission(key, location?)` – sowohl in den Server-Funktionen als auch in den Read-Policies.

## Permission-Keys (neu im Enum `app_permission`)
- `time.entry.view_self` – eigene Zeiten sehen
- `time.entry.view_all` – Zeiten aller Mitarbeiter sehen (scopable: Standort)
- `time.entry.clock` – Stempeln (`clockIn`/`clockOut`, scopable: Standort)
- `time.entry.edit` – fremde Zeiten ändern/anlegen (scopable: Standort)
- `time.period.view` – Lohn-Perioden sehen
- `time.period.manage` – Perioden anlegen/ändern/löschen
- `time.period.lock` – Periode sperren/entsperren
- `time.payroll_note.view` – Lohnbüro-Notizen sehen
- `time.payroll_note.edit` – Notizen pflegen
- `time.export` – Wochen-/Lohn-Export erzeugen

### Default-Matrix
| Recht | admin | manager | staff | payroll |
|---|---|---|---|---|
| time.entry.view_self | ✓ (auto) | ✓ | ✓ | ✓ |
| time.entry.view_all | ✓ | ✓ | – | ✓ |
| time.entry.clock | ✓ | ✓ | ✓ | – |
| time.entry.edit | ✓ | ✓ | – | – |
| time.period.view | ✓ | ✓ | – | ✓ |
| time.period.manage | ✓ | – | – | – |
| time.period.lock | ✓ | – | – | ✓ |
| time.payroll_note.view | ✓ | ✓ | – | ✓ |
| time.payroll_note.edit | ✓ | ✓ | – | ✓ |
| time.export | ✓ | ✓ | – | ✓ |

Admins ignorieren Overrides wie in M2.

## Migrationen (zwei Stück, drop-then-create)

### Migration 1 – Enum + Defaults
- Enum-Werte ergänzen (`ALTER TYPE … ADD VALUE`).
- Seed in `permission_role_defaults` für die Tabelle oben.

### Migration 2 – Policy-Umbau
- `periods`
  - `periods_select_manager` (Manager-Sicht) → neu `periods_select_view`: `current_organization_id() AND has_permission('time.period.view')`. Die separate `periods_select_payroll` wird gedropt (im neuen Helfer abgedeckt).
  - `periods_insert_admin` → `time.period.manage`.
  - `periods_update_admin` → bei Status-Übergängen (`status = 'locked'` ↔ `'open'`) braucht es `time.period.lock`; alle anderen Updates `time.period.manage`. Umsetzung als zwei UPDATE-Policies („manage" und „lock") mit OR-Verknüpfung.
  - `periods_delete_admin` → `time.period.manage`.
- `time_entries`
  - Bestehende `time_entries_select_payroll` durch breitere Policy ersetzen: `current_organization_id() AND (staff_id = current_staff_id() OR has_permission('time.entry.view_all', location_id))`. Die `view_self`-Default-Allow im Code reicht; im SQL ist das eigene Tupel die strengere Bedingung.
  - Falls weitere Read/Write-Policies existieren: prüfen, bei `manager`-Gates auf `time.entry.edit` umstellen (Drops vor Creates, gleiche Namen).
- `payroll_notes`
  - `payroll_notes_select_payroll` ersetzen durch `has_permission('time.payroll_note.view')`.

`roster_*` und `leave_requests` bleiben unverändert; werden mit M3 angefasst.

## Server-Funktionen (`src/lib/time/`)
Statt `runGuarded(caller.role, 'manager'|'admin', …)` einen neuen Helper `runWithPermission(supabaseClient, perm, location?, writeAudit, op)` einführen, der via `rpc('has_permission', { _perm, _location })` prüft und bei `false` `ForbiddenError` wirft. Damit:
- `clockIn` / `clockOut` → `time.entry.clock` mit `location_id` aus dem Aufruf.
- `setTimeEntryShift`, `createTimeEntryShift` → `time.entry.edit` mit Location der Schicht.
- `getWeeklyTimeEntries` (Read) → keine extra-Server-Prüfung, RLS reicht; UI verbirgt die Spalte fremder Mitarbeiter falls leer.
- `listPeriods` → RLS reicht; `createPeriod` / `deletePeriod` → `time.period.manage`; `togglePeriodLock` → `time.period.lock`.
- `upsertPayrollNote` → `time.payroll_note.edit`.
- `weekly-export`-Funktion (falls Server-Funktion) → `time.export`.

`runGuarded` bleibt für Module ohne Permission-Umbau bestehen; M1-Aufrufstellen werden migriert.

## UI
- **Katalog** (`src/lib/admin/permissions-catalog.ts`) um die neuen Keys erweitern (Label/Beschreibung/`scopable`). Der bestehende „Rechte"-Tab im Staff-Detail zeigt sie automatisch.
- Klein im Katalog: Module-Gruppe (`module: 'kasse' | 'zeit'`); im Tab nach Modul-Überschriften gruppieren.

## Tests
- DB-Tests `src/lib/time/time-permissions.db.test.ts`:
  - staff darf nur eigene `time_entries` sehen; mit `time.entry.view_all`-Allow ja, location-scoped nur im Standort.
  - manager ohne `time.period.lock` kann `togglePeriodLock` nicht aufrufen (Forbidden).
  - deny überstimmt allow (Regressionstest analog zu M2).
- Unit-Test `runWithPermission`: ForbiddenError → Audit wird nicht geschrieben.

## Schritte
1. Migration 1 (Enum + Defaults).
2. Migration 2 (Policy-Umbau für `periods`, `time_entries`, `payroll_notes`).
3. `src/lib/admin/admin-call.ts`: `runWithPermission` ergänzen (Rolle-Wrapper bleibt).
4. `time.functions.ts` + `time-admin.functions.ts`: Aufrufstellen umstellen.
5. `permissions-catalog.ts` erweitern (+ Modul-Gruppierung im Tab).
6. Tests + kurze Smoke-Probe (Impersonate als manager ohne `time.period.lock` → Aktion blockiert).
7. Memory aktualisieren.

## Offene Punkte (vor Bau bestätigen)
1. **payroll-Rolle bekommt `time.period.lock` per Default** – damit das Lohnbüro Perioden festschreiben kann. Ok? (Alternativ: nein, bleibt Admin.)
2. **`time.entry.clock`-Scope**: pro Standort einschränkbar (z. B. ein Mitarbeiter darf nur in Standort A stempeln). Default Allow auf alle Standorte, Admin kann gezielt einschränken. Ok?
3. **Manager-Reads auf eigene Org**: Mit `time.entry.view_all` _ohne_ Override sieht ein Manager alle Standorte. Falls Manager nur seine zugeordneten Standorte sehen sollen, müsste der Default rolle=manager auf `view_all` _entzogen_ und stattdessen per Allow pro Standort vergeben werden. Vorschlag: jetzt offen lassen (Default = alle), gezielte Einschränkung über Deny-Overrides.
