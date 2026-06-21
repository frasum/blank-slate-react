## Ziel

Matrix in `/admin/staff` vervollständigen: pro Standort Abteilungs-Pills (S/K/GL), Skill-Chips nach Abteilung sperren, Server-Functions härten. Keine Migration.

## 1) Neues Modul `src/lib/admin/skill-eligibility.ts`

Reine Funktionen (keine DB/React-Imports):
- Typen `StaffDepartment` (`kitchen|service|gl`), `SkillCategory` (`+ other`).
- `isSkillCategoryEligible(category, departments)` — `other` immer eligible, sonst Mitgliedschaft.
- `ineligibleSkills<T extends {category}>(held, departments)` — filtert nicht-eligible (generisch).
- `distinctDepartments(rows)` — Set-basiert, Reihenfolge stabil via `Array.from(new Set(...))`.

Tests `skill-eligibility.test.ts`: alle im Prompt aufgeführten Fälle.

## 2) `staff.functions.ts` — neue/geänderte Server-Functions

**Helfer (lokal):** `assertStaffInOrg(staffId, orgId)`, `assertLocationInOrg(locationId, orgId)` (Pattern wie `easyorder-admin.functions.ts`, via `supabaseAdmin` + `maybeSingle`).

**Neue Function `setStaffLocationDepartment`** (admin, `runGuarded`, audit):
- Input: `{ staffId, locationId, department: enum(kitchen|service|gl), enabled: boolean }`.
- `assertStaffInOrg` + `assertLocationInOrg` mit `caller.organizationId`.
- **enabled=true:** `upsert({...}, { onConflict: "staff_id,location_id,department", ignoreDuplicates: true })`.
- **enabled=false (Regel a):**
  1. Aktuelle `staff_locations(location_id, department)` für Staff+Org laden.
  2. `rowsAfter` = ohne das Paar; `departmentsAfter = distinctDepartments(rowsAfter)`.
  3. Held-Skills inkl. Kategorie/Name laden (`staff_skills join skills`).
  4. `blocking = ineligibleSkills(held, departmentsAfter)` → wenn nicht leer, **throw** mit Label und Skill-Namen-Liste; kein DELETE/Audit.
  5. sonst DELETE `(staff_id, location_id, department, organization_id)`.
- Audit action `"staff.set_location_department"`, meta `{ locationId, department, enabled }`.

**`assignStaffSkills` härten:** vor DELETE+INSERT Abteilungen + gewünschte Skill-Kategorien laden, `ineligibleSkills` prüfen, ggf. throw mit Skill-Namen. Nutzt das geteilte Modul.

**`setStaffRole` härten:** nach Last-Admin-Check, vor Schreiben: `assertStaffInOrg(staffId, caller.organizationId)`.

**`listStaff` erweitern:** Select `staff_locations(location_id, department)`. Rückgabe ergänzt um `locationDepartments: {locationId, department}[]` und `departments: StaffDepartment[]` (distinct). `locationIds` bleibt (distinct location_ids).

## 3) UI `staff.index.tsx`

**Neue Spalte „Abteilungen":** für jeden Standort aus `s.locationIds` einen kleinen Block mit Standort-Label + 3 Toggle-Pills (S/K/GL). Aktiv wenn `(locationId, department) ∈ s.locationDepartments`. Look angelehnt an `pill-select`-Stil (Custom-Buttons, da `PillSelect` einzelne Auswahl ist, nicht Toggle-Set). Klick → `setStaffLocationDepartment`-Mutation, optimistic via `queryClient.setQueryData(["admin","staff"], ...)`.
- **onError:** Cache zurückrollen (vorherigen Snapshot aus `onMutate`) **und** `toast.error(err instanceof Error ? err.message : "Fehler")` zeigen — damit serverseitige Ablehnungen (z. B. Regel a bei veraltetem Client-Stand, fehlende Org-Mitgliedschaft) nicht stumm bleiben.
- **onSuccess:** kein Toast, nur `invalidateQueries(["admin","staff"])` zur Sync.

Vor dem Deaktivieren clientseitig: `rowsAfter` ohne Paar, `held = s.skillIds.map(id => skillsQ.data.find(...))` (gefiltert), `ineligibleSkills(held, distinctDepartments(rowsAfter))` — wenn nicht leer: Pill `disabled` + Tooltip mit Skill-Namen. Server lehnt zusätzlich ab (Toast greift im Race).

**`SkillsCell` sperren:** Prop `departments: StaffDepartment[]` ergänzen. Pro Chip:
- nicht eligible UND aktuell nicht gehalten → `disabled` mit Tooltip „Erst Abteilung … zuweisen".
- nicht eligible UND gehalten (Altbestand) → sichtbar markiert (blass/Border-Warn) als „blockiert", nicht still abwählen.
- eligible → wie bisher.
Nutzt Radix `Tooltip` (bereits vorhanden) bzw. `title`-Attribut als Fallback.

## 4) Gate

- `bun add` nicht nötig.
- `prettier --write src/`, `eslint --fix src/`.
- `tsc --noEmit`, `vitest run` (inkl. neuer Tests) grün.
- Wenn Build/Tooling Migration anlegen will oder Eligibility-Regel nicht umsetzbar → stoppen & melden.

## Nicht angefasst

- Keine Migration, keine RLS.
- `assignStaffLocations`-Logik (nur die Interaktion notiert: setzt auf `service` zurück — separate Entscheidung).
- Andere Routen, Cash-/Geld-/Kanban-Module.
- `staff.$staffId.tsx` Detailseite.
