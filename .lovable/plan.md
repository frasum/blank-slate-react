## Ziel

Auf `/admin/staff/:staffId` einen neuen Tab **„Skills"** ergänzen, in dem Admins die Skills eines Mitarbeiters per Checkbox-Liste setzen können (analog zum bestehenden „Standorte"-Tab). Schreibt in `staff_skills`.

## Änderungen

### 1. Server-Functions — `src/lib/admin/staff.functions.ts`

- **`listSkills`** (manager+, GET): liest alle `skills` der Organisation (`id, name, category, color, sort_order`), sortiert nach `sort_order, name`.
  - Existiert noch nicht als eigene Function — wird hier ergänzt (klein, organisationscoped, read-only). Alternative: neue Datei `src/lib/admin/skills.functions.ts`. Ich wähle eigene Datei, um `staff.functions.ts` nicht weiter anschwellen zu lassen.
- **`getStaffSkills`** (manager+, GET, input: `{ staffId }`): liest `skill_id`s zum Mitarbeiter.
- **`assignStaffSkills`** (admin, POST, input: `{ staffId, skillIds: uuid[] }`):
  - via `runGuarded` + `makeAuditWriter`
  - DELETE alle `staff_skills` für `(staff_id, organization_id)`
  - INSERT der neuen Liste (falls nicht leer)
  - Audit: `staff.assign_skills`, meta `{ skillIds }`
  - Muster exakt analog zu `assignStaffLocations`.

### 2. UI — `src/routes/_authenticated/admin/staff.$staffId.tsx`

- Neuer Tab-Eintrag `skills` zwischen `locations` und `role`.
- Neue Komponente `SkillsTab({ staffId })`:
  - Lädt parallel `listSkills()` und `getStaffSkills({ staffId })`.
  - Gruppiert nach `category` (Küche / Service / GL / Sonstiges) mit Überschrift.
  - Pro Skill: Checkbox + Name; kleiner Farbpunkt aus `skill.color`.
  - Speichern-Button → `assignStaffSkills`; invalidiert `["admin","staff",staffId]` und neuen Key `["admin","staff-skills",staffId]`.
  - Statusmeldung („Gespeichert." / Fehler) analog `LocationsTab`.

### 3. Keine DB-Migration

`staff_skills` und Policies existieren bereits (1 Policy). Schema-Inventur unverändert.

## Nicht angefasst

- Skills-Stammdaten-Pflege (Anlegen/Löschen von Skills selbst) — out of scope.
- Import-Pfad (`importStaffAssignments`, `skillsMode`) bleibt wie er ist; UI-Pflege und CSV-Import nutzen denselben Endspeicher (`staff_skills`).
- Dienstplan-Popover-Filter funktioniert ab dann automatisch korrekt, sobald Skills gepflegt sind.
- time_entries, cash-*, Roster-Logik unverändert.

## Erfolgs-Gate

- [ ] Neuer Tab „Skills" sichtbar auf `/admin/staff/:staffId`
- [ ] Checkboxen vorausgewählt entsprechend aktuellem `staff_skills`-Stand
- [ ] Speichern persistiert; Reload zeigt gleichen Zustand
- [ ] Audit-Log-Eintrag `staff.assign_skills`
- [ ] Dienstplan-Popover zeigt danach nur noch gepflegte Skills
- [ ] `tsc` + `eslint --max-warnings=0` grün
