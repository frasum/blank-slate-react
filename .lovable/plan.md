# COCO Fix #2b — Atomare Mengen-Ersetzung via SECURITY DEFINER-RPC

## Ziel
Drei nicht-transaktionale Delete+Insert-Blöcke ersetzen durch transaktionale RPCs mit Org-Scoping. Bei Insert-Fehler erfolgt automatischer Rollback (kein stiller Datenverlust). Org-Lücke in `assignStaffSkills` / `assignStaffLocations` wird durch das hart auf `p_organization_id` gescopte SQL gleich mitgeschlossen.

## Schritt 1 — Migration (über `supabase--migration`)

Drei neue `SECURITY DEFINER` plpgsql-Funktionen anlegen:
- `public.replace_staff_skills(p_staff_id uuid, p_organization_id uuid, p_skill_ids uuid[])`
- `public.replace_staff_role(p_staff_id uuid, p_organization_id uuid, p_role public.app_role)`
- `public.replace_staff_locations(p_staff_id uuid, p_organization_id uuid, p_location_ids uuid[])`

Jede Funktion:
1. Guard: `staff` gehört zu `p_organization_id`, sonst `RAISE EXCEPTION`.
2. `DELETE` aller alten Zeilen unter `(staff_id, organization_id)`.
3. `INSERT` der neuen Menge per `SELECT … FROM <ref> WHERE organization_id = p_organization_id AND id = ANY(p_*_ids)` — Fremd-Org-IDs werden so verworfen, nicht eingefügt.

Berechtigungen:
- `REVOKE ALL … FROM PUBLIC, anon, authenticated` für alle drei Funktionen.
- `GRANT EXECUTE … TO service_role` für alle drei Funktionen.

SQL wie in der Anweisung (1:1).

## Schritt 2 — Server-Functions umstellen

Nach erfolgreicher Migration und Types-Regenerierung:

**`src/lib/admin/skills.functions.ts` → `assignStaffSkills`**
Eligibility-Check unverändert lassen. Den Block (`delete` aus `staff_skills` + bedingter `insert`) ersetzen durch einen einzigen `supabaseAdmin.rpc("replace_staff_skills", { p_staff_id, p_organization_id, p_skill_ids })`-Aufruf mit Fehler-Throw.

**`src/lib/admin/staff.functions.ts` → `setStaffRole`**
`wouldRemoveLastActiveAdmin` und `assertStaffInOrg` davor unverändert. Den gesamten `if (data.role === null) { delete } else { delete; insert }`-Block (Z. 371–392) ersetzen durch einen `rpc("replace_staff_role", { p_staff_id, p_organization_id, p_role: data.role })`-Aufruf (null = Rolle entfernen).

**`src/lib/admin/staff.functions.ts` → `assignStaffLocations`**
Den `delete`/`insert`-Block (Z. 419–435) ersetzen durch einen `rpc("replace_staff_locations", { p_staff_id, p_organization_id, p_location_ids })`-Aufruf.

**Nicht angefasst:** `setStaffLocationDepartment` (bereits atomar), alle Guards/Validierungen/Audit-Inhalte/Signaturen/Rückgaben, andere Server-Functions, UI, RLS-Policies.

## Schritt 3 — Pre-Commit
`bunx prettier --write` + `bunx eslint --fix` über die geänderten Dateien (inkl. Leerzeile am Dateiende).

## Erfolgs-Gate
- `bunx tsgo --noEmit` grün (Supabase-Types regeneriert)
- `bunx eslint . --max-warnings=5` grün
- `bunx prettier --check .` grün
- `bunx vitest run` — 738 Tests, keine wegfallenden Tests
- Drei neuen RPCs: 0 Rechte für `anon`/`authenticated`, nur `service_role`

## Hinweise zur Reihenfolge
Migration kommt zuerst und blockiert auf Approval. Erst nach Approval+Regeneration der `types.ts` werden die TS-Files angefasst (sonst sind die `rpc("replace_staff_*")`-Aufrufe nicht typsicher und `tsc` rot).

## Nicht im Scope
Cart-Drafts (#2c), Account-Flows (#2d), andere Tabellen/Policies, Tests in `*.db.test.ts` (empfohlen, aber non-blocking — kein neuer Test in diesem PR, sofern nicht ausdrücklich angefordert).
