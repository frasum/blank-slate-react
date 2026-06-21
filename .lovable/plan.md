## Phase 2 — Staff-Sichtbarkeit + `claim_task`

Ziel: Mitarbeiter (Rolle `staff`) sehen Aufgaben der Standorte, an denen sie arbeiten, und können sich offene Aufgaben per "Übernehmen" selbst zuweisen. Manager/Admin-Verhalten bleibt unverändert.

### 1. DB-Migration (eine Migration)

**RLS auf `tasks` erweitern** (zusätzlich zur bestehenden Admin/Manager-Policy):
- Neue SELECT-Policy `tasks_select_staff_for_location`: staff darf Zeilen lesen, wenn `archived_at IS NULL`, `organization_id = current_organization_id()` **und** `location_id` in den Standorten der aufrufenden Person liegt (`staff_locations` join `current_staff_id()`).
- Keine direkten DML-Policies — Schreiben bleibt RPC-only.

**Neue RPC `public.claim_task(p_task_id uuid)`** (`SECURITY DEFINER`, search_path public):
- Lädt Task `FOR UPDATE`, prüft Organisation = `current_organization_id()`.
- Prüft Standort-Zugehörigkeit: Aufrufer-`staff_id` muss in `staff_locations` für `task.location_id` stehen.
- Bedingungen: `assignee_staff_id IS NULL` **und** `status = 'open'` **und** `archived_at IS NULL`. Sonst klare Fehler („Aufgabe bereits zugewiesen / nicht offen / archiviert").
- Setzt `assignee_staff_id = current_staff_id()`. Status bleibt `open` (Phase 2 — kein Auto-Übergang nach `in_progress`).
- Return: `public.tasks` (gesamte Zeile, konsistent zu den anderen RPCs).
- `REVOKE ALL FROM public; GRANT EXECUTE TO authenticated;`

**Hinweis zu `set_task_status` / `reassign_task`**: bereits Phase-2-tauglich — `set_task_status` erlaubt der Person, der die Aufgabe zugewiesen ist, Status zu ändern; `reassign_task` erlaubt Self-Reassign innerhalb des eigenen Standorts. Kein Eingriff nötig.

### 2. Server-Function `claimTask`

Neue Funktion in `src/lib/aufgaben/tasks.functions.ts`:
- `createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])`.
- ALLOWED-Rollen für Phase 2 erweitern: `["admin", "manager", "staff"]` für `claimTask` und für `setTaskStatus` (Status durch Assignee). `createTask` / `updateTask` / `archiveTask` / `reassignTask` bleiben Admin/Manager-only (`loadAdminCaller` mit eigener Whitelist je Funktion, nicht das modulweite ALLOWED).
- Aktuell ist `ALLOWED` eine Modul-Konstante — **wird aufgeteilt**: `ALLOWED_MANAGE` (admin/manager) für create/update/archive/reassign, `ALLOWED_ALL` (admin/manager/staff) für claim und setStatus.
- RPC-Aufruf via `supabaseAdmin.rpc("claim_task", { p_task_id })`.
- Audit-Eintrag `task.claimed` mit `{ taskId, locationId }`.

### 3. Lese-Layer für Staff

`useBoardTasks` in `src/lib/aufgaben/tasks.queries.ts` funktioniert dank RLS für Staff ohne Änderung — die neue SELECT-Policy filtert automatisch.

Neue Query `useStaffLocations()` (oder Wiederverwendung vorhandener) — wir brauchen für Staff die Liste der eigenen Standorte, um den Standort-Selector zu füllen, ohne `listLocations()` aufzurufen (das ist Admin-only).

→ Neue Server-Function `listMyTaskLocations` (in `tasks.functions.ts`, ohne `loadAdminCaller`-Rollencheck, nur `requireSupabaseAuth`): liest mit `context.supabase` (RLS) aus `staff_locations` join `locations` die Standorte des aufrufenden Users. Liefert `{ id, name }[]`.

### 4. Frontend: Staff-Route + UI-Anpassungen

**Neue Route `src/routes/_authenticated/zeit/aufgaben.tsx`** (Staff-Einstieg unter `/zeit/aufgaben`):
- Lädt `listMyTaskLocations` + nutzt bestehendes `KanbanBoard`.
- Standort-Selector wie in der Admin-Variante.
- `canCreate={false}` (Staff erstellt in Phase 2 keine eigenen Tasks — out of scope laut Phase-1-Plan).

**Kachel auf `/zeit` (`src/routes/_authenticated/zeit/index.tsx`)**: neue Tile „Aufgaben" → `/zeit/aufgaben`, Icon `ListChecks`.

**`KanbanCard` / `KanbanBoard`**:
- Neuer Prop `currentStaffId: string | null`, `canManage: boolean` (admin/manager).
- Wenn `assignee_staff_id === null` und `status === 'open'`: Button „Übernehmen" auf der Karte → ruft `useClaimTask`.
- Drag & Drop für Spalten-Wechsel:
  - Manager: wie bisher (alle Karten).
  - Staff: nur eigene Karten (`assignee_staff_id === currentStaffId`) sind ziehbar; fremde Karten sind read-only + zeigen Assignee-Namen.
- Karten-Detail-Dialog (`TaskDetailDialog`): für Staff ohne Edit/Archive-Aktionen, nur Anzeige + (falls eigene Karte) Status-Buttons.

**Neue Hook `useClaimTask(locationId)`** in `tasks.queries.ts` analog zu den anderen Mutationen, invalidiert Board-Query.

**Routing-Schutz** in `_authenticated/zeit/aufgaben.tsx`: `beforeLoad` → Payroll umleiten (analog zur Admin-Route).

### 5. Identity / Staff-ID im Frontend

Das `KanbanBoard` braucht die aktuelle `staff_id` des eingeloggten Users für die „Eigene Karte?"-Logik. `useAuth()` / `identity` enthält die Rolle; ich prüfe ob `staff_id` dort verfügbar ist — falls nicht, lese ich sie einmal per kleiner Server-Fn `getMyStaffId` (RLS-basiert auf `user_links`).

### 6. Tests

- `src/lib/aufgaben/claim-task.test.ts` (Logik-Vorbedingungen, falls reine Funktionen herausziehbar — sonst Integration via RPC-Doku im Migrations-Header).
- Manuelle Verifikation: als Staff einloggen → /zeit/aufgaben → Standort wählen → fremde Karte: kein Übernehmen-Button; nicht zugewiesene Karte: „Übernehmen" → Karte trägt jetzt eigenen Namen → Drag in `in_progress` möglich.

### Bewusst NICHT in Phase 2 (kommt in Phase 3+)
Staff legt eigene Tasks an, `unarchive_task` / Archiv-Ansicht, Realtime, Telegram-Eskalation, Recurrence/Templates, Kommentare, Foto-Upload, Cross-Entity-Links.

### Konflikt-Hinweis (Ehrlichkeitsregel)
Im Phase-1-Plan stand „Staff darf eigene Karten ziehen" als Phase-2-Item, aber „Staff darf eigene Tasks anlegen" wurde als Phase 3 markiert. Ich folge dieser Phasen-Trennung — wenn du Anlegen schon jetzt willst, sag Bescheid, dann nehme ich es mit auf.
