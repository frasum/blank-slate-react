# PL1 — Planer-Scope auf Urlaub/Tausch/Jahresplaner

## Ziel
Planer-Seitenrolle (heute nur Dienstplan, gescoped auf (Standort, Bereich) via `permission_overrides`) bekommt im **gleichen Scope** zusätzlich:
- Urlaubsanträge sehen + entscheiden
- Schichttausch-Anfragen sehen + entscheiden
- Jahresplaner sehen (nur freigegebene Bereichs-Blöcke, nur freigegebene Standorte)

Manager/Admin bleiben unverändert (globaler Scope via `permission_role_defaults`).

## 1) Migration (additiv)
Zwei neue Enum-Werte + Manager-/Admin-Defaults:
```sql
ALTER TYPE public.app_permission ADD VALUE IF NOT EXISTS 'roster.swap.view_pending';
ALTER TYPE public.app_permission ADD VALUE IF NOT EXISTS 'roster.swap.decide';

INSERT INTO public.permission_role_defaults (role, permission) VALUES
  ('manager','roster.swap.view_pending'),
  ('manager','roster.swap.decide'),
  ('admin','roster.swap.view_pending'),
  ('admin','roster.swap.decide')
ON CONFLICT DO NOTHING;
```
Kein Planer-Default — Zugriff nur über `permission_overrides` (locationId + area). Keine RLS-Änderungen. Types werden nach Freigabe regeneriert.

## 2) Neuer gemeinsamer Helfer: `resolvePlanerScope`
Datei: `src/lib/roster/scope-util.ts` (dort lebt schon `allowedLocations`/`canEditScope`).

Neu:
```ts
export type ResolvedScope =
  | { all: true }
  | { all: false; combos: Array<{ locationId: string; area: "kitchen" | "service" }> };

export async function resolvePlanerScope(
  supabase, supabaseAdmin, organizationId, permission
): Promise<ResolvedScope>
```
Vorgehen (spiegelt heutiges `getMyRosterScopes`, aber parametrisiert auf beliebiges Recht):
1. `has_permission(_perm=permission, _location=null, _area=null)` → true ⇒ `{all:true}` (admin/manager mit Default).
2. Sonst: alle Standorte der Org laden × {kitchen, service}, jede Kombination per `has_permission(_perm, loc, area)` prüfen, positive einsammeln.

`roster.functions.ts::getMyRosterScopes` auf den neuen Helfer umbauen (Verhalten unverändert; deckt bestehende Charakterisierungstests `roster-scope-p2.db.test.ts` ab). Kein Verhaltens-Delta zulässig.

Neue Unit-Tests (`scope-util.test.ts` erweitern): manager → `{all:true}`, planer mit einem allow-Override → nur diese Kombi, deny schlägt allow.

## 3) Katalog + Labels
`src/lib/admin/permissions-catalog.ts`: zwei neue Einträge ergänzen (Modul „dienstplan", `scopable: true`):
- `roster.swap.view_pending` — „Tauschanfragen sehen"
- `roster.swap.decide` — „Tauschanfragen entscheiden"

Bestehende Katalog-Keys `roster.leave.view_all` / `roster.leave.decide` bleiben; Flag `scopable` auf `true` setzen, damit `PermissionsTab` sie mit Standort+Bereich vergeben lässt. (Der Tab liest `scopable`; keine weitere UI-Änderung.)

## 4) Durchsetzung (drei Bereiche)

### a) `src/lib/roster/leave.functions.ts`
- `WRITE_ROLES` = `["manager", "admin", "planer"]` (Rollen-Whitelist; Rechte prüft `has_permission`).
- `listLeaveRequests`: `assertPermission("roster.leave.view_all", null)` bleibt. **Anschliessend** Scope mit `resolvePlanerScope(...,"roster.leave.view_all")` auflösen; bei `all:false` das Ergebnis auf Anträge einschränken, deren Antragsteller-`staff_id` mindestens eine `staff_locations`-Zeile mit einer freigegebenen `(location, department)`-Kombination hat. Ein einziger Batch-Query (`staff_locations WHERE staff_id in (…)`), Filter in Node.
- `decideLeaveRequest`: `runWithPermission("roster.leave.decide", null, …)` bleibt. Vor Schreibaktion Scope-Validierung des Antragstellers (gleicher Helfer + `staff_locations`-Lookup); außerhalb ⇒ `ForbiddenError("Antrag liegt ausserhalb deines Bereichs.")`. Audit unverändert (Aktor = Planer).

### b) `src/lib/roster/swap.functions.ts`
- `listPendingSwaps`: `loadAdminCaller(..., ["manager","admin","planer"])`. Neu: `assertPermission("roster.swap.view_pending", null)`. Nach Fetch Scope auflösen; bei `all:false` Zeilen filtern, deren `requesterShift.(locationId, area)` NICHT in `combos` liegt.
- `decideSwapRequest`: `loadAdminCaller(..., ["manager","admin","planer"])`. Wrapper von `runGuarded(..., "manager", …)` auf `runWithPermission("roster.swap.decide", null, …)` umstellen. Innen VOR TA4-Re-Validierung Scope der `reqShift.(location_id, area)` prüfen; außerhalb ⇒ ForbiddenError.

### c) `src/lib/roster/vacation-planner.functions.ts`
- `READ_ROLES` = `["manager","admin","planer"]`. `assertPermission("roster.leave.view_all", null)` ergänzen. Nach Scope-Auflösung:
  - Standort-Check: gewählter `locationId` muss im Scope liegen (irgendein Bereich); sonst ForbiddenError.
  - Bereichs-Block-Filter: für planer nur Bereiche (`kitchen`/`service`) zurückgeben, die im Scope für dieses Standort-`locationId` liegen — der andere Block kommt leer.
- `VacationPlannerSection.tsx`: Standort-Pills schon über `listLocations` (aktive Standorte). Zusätzlich per neuer Server-Fn `getMyLeavePlannerLocations` auf freigegebene Standorte des Planers reduzieren (admin/manager: alle). Alternative & einfacher: `listLocations` liefert weiter alle → Backend wirft ForbiddenError, wir verwenden `getMyRosterScopes` bereits im Frontend. Wir nutzen den vorhandenen `getMyRosterScopes` als Filterquelle (spart neue Fn) und mappen Standort-IDs im Client.

## 5) UI & Nav (`src/routes/_authenticated/admin/route.tsx`)
- Redirect-Regel für planer erweitern: erlaubt sind `/admin/dienstplan` **und** `/admin/urlaub`; andere Pfade → `/admin/dienstplan`.
- Neue Planer-Nav zeigt beide Tabs (Dienstplan aktiv, Urlaubsantrag/Schichttausch).
- Roter Personal-Anträge-Punkt: `getReviewPendingCounts` derzeit `admin`-only und liefert org-globale Counts. Planer sieht `pendingLeaveRequests`/`swapPending` heute nicht. Lösung: `getReviewPendingCounts` in `admin`+`manager`+`planer` freigeben, für planer die Counts server-seitig auf Scope reduzieren (gleiche gefilterte Listen-Fns wiederverwenden; `pendingRequests`/`pendingDocuments` bleiben 0 für Nicht-Admin). Auth-Layout-`enabled` von `role === "admin"` auf `admin|manager|planer` erweitern.

## 6) Tests (blockierend)
Alle unter `src/lib/roster/`:
- `scope-util.test.ts`: `resolvePlanerScope` — manager all, planer mit einem allow, planer mit allow+deny.
- `leave-scope.db.test.ts` (neu): planer mit Küche@Loc1 sieht nur Küchen-Antrag; Service-Antrag unsichtbar; decide Fremdscope → Forbidden; decide Scope → ok.
- `swap-scope.db.test.ts` (neu): analog auf `listPendingSwaps` + `decideSwapRequest` (reqShift.area+location).
- `vacation-planner.db.test.ts` erweitern: planer sieht nur seinen Bereichs-Block; Standort außerhalb → Forbidden.
- `roster-scope-p2.db.test.ts` bleibt grün (Charakterisierung Dienstplan).

## 7) Doku
`docs/arbeitsweise.md` §25/§26 ergänzen: **PL1** (Datum: heute) — Enum-Werte `roster.swap.view_pending/decide`, gemeinsamer `resolvePlanerScope`, Scope-Anker (Antragsteller-`staff_locations` bzw. Schicht-`(location,area)`), manager/admin unverändert via role_defaults, Nav/Route erlauben planer jetzt zusätzlich `/admin/urlaub`.

## 8) Nicht anfassen
- `role-guard.ts` (planer bleibt RANK 0).
- Dienstplan-Verhalten (nur Helfer-Extraktion aus `getMyRosterScopes`).
- TA4-Regeln, `execute_shift_swap`-RPC, `approve_leave_request`-RPC.
- Portal-Seiten der Mitarbeiter.
- `permission_overrides`-Schema.

## 9) Erfolgs-Gate
`bunx tsgo --noEmit` 0 · `bunx eslint . --max-warnings=0` 0 · `bunx prettier --check .` sauber · `bunx vitest run` grün (Tests aus §6 blockierend).

## Umsetzungs-Reihenfolge
1. Migration (Enum + Defaults) — separater Approval-Schritt.
2. Nach Types-Regen: Helfer + Katalog + Server-Fn-Umbauten + UI/Nav + Tests + Doku in einem Rutsch.
