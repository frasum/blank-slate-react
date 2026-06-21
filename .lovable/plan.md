## Ziel
Fix für `kein aktiver Aufrufer/Organisation` bei Task-Schreibvorgängen. RPCs bleiben service_role-only; Identität wird als Parameter durchgereicht und Rolle autoritativ aus `role_assignments` ermittelt.

## Änderungen

### 1. Neue Migration `…_task_rpcs_caller_params.sql`
DROP + CREATE der 6 Task-RPCs mit neuer Signatur `(p_caller_staff_id uuid, p_organization_id uuid, ...)`:
- `create_task` — Rolle aus role_assignments; Staff darf keine `manager_admin`-Kategorie.
- `set_task_status` — admin/manager oder Assignee.
- `reassign_task` — admin/manager oder Assignee (auf gemeinsamen Standort).
- `update_task` — admin oder manager am Standort.
- `archive_task` — admin-only (konsistent zu Migration D, kein `tasks.delete` für Manager).
- `claim_task` — Self-Service, prüft Standortzugehörigkeit.

Alle: `REVOKE ALL ... FROM PUBLIC, anon, authenticated; GRANT EXECUTE ... TO service_role;`

Entfernt vollständig aus diesen 6 RPCs: `auth.uid()`, `current_staff_id()`, `current_organization_id()`, `current_role()`, `is_admin()`, `has_permission()`, `has_min_permission()`.

### 2. `src/lib/aufgaben/tasks.functions.ts`
In jedem der 6 `supabaseAdmin.rpc(...)`-Aufrufe `p_caller_staff_id: caller.staffId` und `p_organization_id: caller.organizationId` ergänzen. Sonst keine Änderung.

### 3. Gate
`prettier --write` / `eslint --fix` über die geänderten Dateien; `tsc --noEmit`, `eslint .`, `prettier --check .`, `vitest run` müssen grün sein. Falls ein Test die alte RPC-Signatur mockt, anpassen.

## Nicht angefasst
RLS-Policies auf `tasks`, Realtime-Publication, Permission-Defaults (Migration D), `tasks.queries.ts`, andere Module. Keine neuen Features, keine `authenticated`-Grants auf Task-RPCs.

## Stop-Bedingung
Wenn nach den Edits mehr im Diff steht als die neue Migration + `tasks.functions.ts` (+ ggf. ein Test-Mock), stoppen und melden statt weiterbauen.