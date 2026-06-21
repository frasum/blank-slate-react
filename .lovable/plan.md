## Tasks / Kanban — Phase 1 (Manager-Web)

Korrigierter 020-Plan: Architektur (RPC-State-Machine, Tenant-Modell) übernommen; korrigiert sind Migrations-Blocker (Enum-Erweiterung, `permission_role_defaults`-Shape, `has_permission`-Signatur), Grant-Schwäche (SELECT-only) und Scope (manager-facing only).

### Korrekturen ggü. eingereichtem 020
1. `app_permission` ist Enum → `ALTER TYPE … ADD VALUE` in **vorgelagerter** eigener Migration.
2. `permission_role_defaults` hat keine `effect`-Spalte (nur `role, permission`, PK beides).
3. `has_permission` nimmt Enum, nicht `text` → Casts `…::public.app_permission`.
4. **Nur `GRANT SELECT`** an `authenticated`. Alle Schreibvorgänge ausschließlich via RPCs (`service_role`). **Lesen** mit User-Client (RLS-SELECT greift) — niemals `supabaseAdmin` für Reads.
5. **Scope = manager-facing only.** Keine Staff-Defaults/-SELECT-Branch, kein `claim_task`, keine `tasks.maintenance.*`. Hausmeister-Selfservice = Phase 2.
6. **4 Kategorien:** `service, kitchen, maintenance, manager_admin` (kein `housekeeping`).
7. `create_task` weist **nicht** automatisch dem Ersteller zu; `NULL = unassigned`.
8. `sort_order numeric` (LexoRank-leicht): Client setzt Nachbar-Mittelwert beim Drop, RPC speichert nur. Sortierung `ORDER BY sort_order ASC`; Priorität/Due nur visuell.
9. **Archivieren statt Hard-Delete:** `archived_at` setzen; Board filtert `archived_at IS NULL`. Permission-Enum bleibt `tasks.delete` (kein Enum-Churn), governt jetzt Archivieren. `unarchive` + Archiv-Ansicht später.

### Migrationen (4 separate Dateien, in Reihenfolge)

**A — `app_permission` erweitern** (eigene TX, sonst scheitert Folge-INSERT):
`tasks.view`, `tasks.create`, `tasks.assign`, `tasks.change_status`, `tasks.delete` via `ALTER TYPE … ADD VALUE IF NOT EXISTS`.

**B — Schema + Grants + RLS:**
- Enums `task_category` (4 Werte), `task_status` (`open, in_progress, done, cancelled`).
- Tabelle `public.tasks` mit `organization_id`, `location_id`, `title (1..200)`, `description`, `category`, `status default open`, `priority 0..3`, `sort_order numeric`, `created_by_staff_id`, `assignee_staff_id` (NULL=unassigned), `due_at`, `started_at`, `completed_at`, `archived_at`, `escalate_at`/`escalated_at` (forward-compat), Timestamps + Consistency-CHECKs (done↔completed_at, in_progress↔started_at).
- Indizes: aktives Board (partial `archived_at IS NULL`), org/loc/category, org/assignee, org/due (partial).
- Trigger `tg_set_updated_at`.
- `GRANT SELECT ON public.tasks TO authenticated; GRANT ALL TO service_role;` — **kein** DML-Grant.
- RLS SELECT-Policy: Org-Scope + (Admin ODER Manager+ an eigenem Standort via `staff_locations`). Keine Staff-Branch.

**C — RPCs** (alle `SECURITY DEFINER`, `SET search_path TO 'public'`, `REVOKE … FROM PUBLIC,anon,authenticated; GRANT EXECUTE TO service_role`):
- `create_task(location, title, desc, category, priority, due_at, assignee)` — Tenant-/Location-Check, Staff darf kein `manager_admin`, Assignee (falls gesetzt) muss `staff_locations` am Ziel-Standort haben; neue Karte ans Spaltenende (`max(sort_order)+1` der Spalte `open`).
- `set_task_status(id, status, sort_order numeric default null)` — Permission: Admin > `tasks.change_status` > Assignee=self. State-Machine: `open↔in_progress`, `in_progress→done|cancelled`, alle Endzustände nur → `open`. Noop nur wenn Status **und** `sort_order` unverändert; reines Umsortieren erlaubt. Setzt `started_at`/`completed_at`.
- `reassign_task(id, new_assignee)` — Admin > `tasks.assign` > (Assignee=self UND neuer Assignee an gleicher Location). Neuer Assignee muss in `staff_locations` der Task-Location stehen.
- `update_task(id, title, desc, priority, due_at)` — Manager+ am Standort oder Admin. Nur diese Felder.
- `archive_task(id)` — Permission `tasks.delete` (Admin-Default), Location-Scope für Nicht-Admins. Setzt `archived_at = now()`; kein Hard-Delete.

**D — Defaults** (Shape ohne `effect`):
`admin`: view, create, assign, change_status, delete. `manager`: view, create, assign, change_status. Keine `staff`-Zeilen.

### Permission-Catalog
`src/lib/admin/permissions-catalog.ts` erweitern:
- `AppPermission`-Union um die 5 Keys.
- `PermissionModule` um `"aufgaben"`; `MODULE_LABEL.aufgaben = "Aufgaben / Tagesbetrieb"`.
- 5 Einträge in `PERMISSION_CATALOG` (alle `scopable: true`); `tasks.delete`-Beschreibung als „archivieren (Audit bleibt, Admin)".

### Frontend
Neue Dateien:
```
src/lib/aufgaben/types.ts
src/lib/aufgaben/tasks.functions.ts   # SCHREIBEN via RPC, mirror skills.functions.ts (loadAdminCaller + audit_log)
src/lib/aufgaben/tasks.queries.ts     # TanStack-Query Hooks, Keys ['tasks', filters]
src/components/aufgaben/KanbanBoard.tsx | KanbanColumn.tsx | KanbanCard.tsx
src/components/aufgaben/TaskCreateDialog.tsx | TaskDetailDialog.tsx | CategoryBadge.tsx | PriorityChip.tsx
src/routes/_authenticated/admin/aufgaben.tsx
```

**Lese-/Schreib-Trennung:**
- **Lesen**: User-Client (`supabase`), RLS-SELECT greift. Board filtert `archived_at IS NULL`, `ORDER BY sort_order ASC` je Status. **Nicht** `supabaseAdmin`.
- **Schreiben**: Server-Fns rufen nach `loadAdminCaller([manager,admin])` die RPCs via `supabaseAdmin.rpc(...)` und schreiben danach `audit_log` (actions: `task.created/status_changed/reassigned/updated/archived`, entity `task`).

Route `/admin/aufgaben` unter bestehendem `_authenticated/admin` (manager+) plus `tasks.view`-Check.
Spalten: offen / läuft / erledigt; `cancelled` eingeklappte Sektion unter „offen". Filter: Kategorie (Multi), Standort (Single), Priorität.
DnD via `@dnd-kit/core` (vorhanden): Client berechnet `sortOrder` als Nachbar-Mittelwert (Rand: erster−1, letzter+1), ruft `setTaskStatus(id, ziel, sortOrder)`. Gleicher Status = reines Umsortieren. Optimistic UI mit Rollback (Pattern aus Roster).

### Nav
Eintrag „Aufgaben" in `src/routes/_authenticated/admin/route.tsx` (eigene Top-Level-Gruppe oder unter Personal — Vorschlag: eigene Gruppe `aufgaben` mit Default `/admin/aufgaben`, roles default = admin+manager). Lohnbüro bleibt ausgesperrt (bestehende Payroll-Branch).

### Tests (Gate)
- `bunx tsc --noEmit` 0, `eslint .` 0, `prettier --check .` sauber, `vitest run` grün.
- `src/lib/aufgaben/tasks.test.ts`: Transition-Matrix, Noop nur bei `status=alt && sortOrder=null`, Umsortieren ist kein Noop, `midpoint(a,b)`-Helper inkl. Rand-Fälle.
- `src/components/aufgaben/KanbanBoard.test.tsx`: 3 Spalten bei 0 Tasks; Drag open→in_progress ruft `setTaskStatus(id,'in_progress', sortOrder)`; Kategorie-Filter blendet aus.
- Vor Commit: `prettier --write` + `eslint --fix` über geänderte Dateien.

### Manuelle Verifikation
- Manager A (nur Standort 1) sieht keine Standort-2-Tasks.
- Direkter `INSERT/UPDATE` auf `tasks` als `authenticated` schlägt fehl.
- `set_task_status(open→done)` wirft.
- `create_task(category='manager_admin')` als Staff wirft.

### Out of Scope (Phase 2/3)
Staff-Sichtbarkeit + `claim_task` + `tasks.maintenance.*` + Staff-PWA (P2); `unarchive`/Archiv-Ansicht, Realtime, Foto-Upload, Telegram-Eskalation, Recurrence/Templates, `housekeeping`, Bulk, Kommentare/Activity, Cross-Entity-Links zu Schicht/Order (P3+).

### Abweichungen
Wenn beim Bau eine Konvention/Alternative besser passt → vor Umsetzung melden, nicht still anders machen.
