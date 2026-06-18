## Ziel
Granulare, prüfbare Rechte für **M2 Kasse/Tagesabrechnung**. Rolle bringt Defaults, pro Mitarbeiter sind feingranulare Allow/Deny-Overrides möglich, jedes Recht ist optional auf bestimmte **Standorte** scopebar. Bestehende RLS-Policies werden auf einen neuen Helfer `has_permission(key, location_id?)` umgestellt, ohne ihre Semantik zu ändern.

## Rechte-Modell

### Daten
- `app_permission` (Enum, modulweise erweiterbar) – für M2 Kasse:
  - `cash.session.view` – Sessions/Übersicht sehen
  - `cash.session.open` – Session öffnen (`getOrCreateOpenSession`)
  - `cash.session.edit` – Session-Felder ändern (`updateSession`, Satelliten)
  - `cash.session.finalize` – Tag abschließen (`finalizeSession`)
  - `cash.session.lock` – Tagessperre setzen/lösen (`setCashLock`, `lockSession`)
  - `cash.settlement.submit_self` – eigene Kellnerabrechnung abgeben
  - `cash.settlement.view_all` – alle Kellnerabrechnungen sehen
  - `cash.settlement.correct` – fremde Abrechnung korrigieren (`correctWaiterSettlement`)
  - `cash.settlement.admin_create` – nachträglich anlegen (`adminCreateWaiterSettlement`)
  - `cash.tippool.manage` – Trinkgeldpool-Einträge pflegen
  - `cash.channel.manage` – Erlöskanäle/Terminals pflegen
  - `cash.export.pdf` – PDF/Bargeld-Export

- `permission_role_defaults(role, permission)` – Default-Matrix pro Rolle (admin = alles, manager = alles außer admin-only, staff = nur self/view).
- `permission_overrides(staff_id, permission, effect 'allow'|'deny', location_id NULL = global)` – pro Mitarbeiter feinjustiert; `location_id` optional → Standort-Scope.

### Helfer (alle SECURITY DEFINER, search_path = pg_catalog, public)
- `public.has_permission(_perm app_permission, _location uuid default null) returns boolean`
  Reihenfolge: (1) explizites DENY für (perm, location ∈ {gewählt, NULL}) → false; (2) explizites ALLOW → true; (3) Rollen-Default → true/false. Nutzt `_effective_user_id()` → Impersonate funktioniert ohne Änderung.
- `public.effective_permissions(_staff uuid) returns table(permission, location_id, source)` – für Admin-UI (read-only).

`is_admin()`/`has_min_permission()` bleiben für nicht-Kasse-Policies erhalten; werden in M2 ersetzt.

## Migration (Reihenfolge, drop-then-create)
1. Enum `app_permission` (nur Kasse-Keys, später per Migration erweiterbar).
2. Tabelle `permission_role_defaults` (PK = role+permission) + Grants + RLS (`SELECT TO authenticated`, Schreiben nur service_role).
3. Tabelle `permission_overrides` (org-scoped, mit `tg_set_updated_at`) + Grants + RLS (`SELECT`: eigene + admin; Schreiben: nur `is_real_admin()` über Server-Funktion).
4. Seed Default-Matrix für alle Kasse-Keys.
5. Helfer `has_permission` + `effective_permissions`.
6. **Policy-Umbau M2** (Tabellen: `sessions`, `session_channel_amounts`, `session_terminal_amounts`, `session_expenses`, `session_advances`, `session_card_transactions`, `session_bank_deposits`, `session_register_transfers`, `session_tip_pool_entries`, `cash_locks`, `waiter_settlements`, `revenue_channels`, `payment_terminals`):
   - `SELECT`: `organization_id = current_organization_id() AND (eigene Zeile ODER has_permission('cash.session.view', location_id))` – Kellnerabrechnung behält Self-Sicht (`staff_id = current_staff_id() OR has_permission('cash.settlement.view_all', location_id)`).
   - `INSERT/UPDATE/DELETE`: jeweils auf passenden Permission-Key umstellen (siehe Mapping unten).
   - Drops vor Creates, gleiche Policy-Namen wiederverwenden.
7. Audit-Log-Eintrag pro Schreibvorgang auf `permission_overrides` (über Server-Funktion).

### Policy-Mapping (Auszug)
| Tabelle | bisher | neu |
|---|---|---|
| sessions INSERT/UPDATE | `has_min_permission('manager')` | `has_permission('cash.session.open'|'cash.session.edit', location_id)` |
| sessions Finalize-Update (status) | – (im Code) | `cash.session.finalize` |
| cash_locks INSERT/UPDATE/DELETE | `is_admin()` | `has_permission('cash.session.lock', location_id)` |
| waiter_settlements UPDATE (manager) | `has_min_permission('manager')` | `has_permission('cash.settlement.correct', location_id)` |
| waiter_settlements INSERT (admin) | `is_admin()` | `has_permission('cash.settlement.admin_create', location_id)` |
| revenue_channels / payment_terminals CUD | `has_min_permission('manager')`/`is_admin` | `cash.channel.manage` |
| session_tip_pool_entries CUD | manager | `cash.tippool.manage` |

## Server-Funktionen
Neue Datei `src/lib/admin/permissions.functions.ts`:
- `listPermissionDefaults()` – Matrix für Admin-UI.
- `getStaffPermissions({ staffId })` – Overrides + effektive Matrix.
- `setPermissionOverride({ staffId, permission, locationId|null, effect: 'allow'|'deny' })` – Upsert + Audit.
- `clearPermissionOverride({ staffId, permission, locationId|null })` – Delete + Audit.

Gate: `is_real_admin()` (nicht `is_admin()`), damit ein impersonierter Admin keine Rechte ändert.

### Code-seitige Checks (defense-in-depth)
In `src/lib/cash/cash.functions.ts` vor Mutationen einen leichtgewichtigen RPC-Check (`supabase.rpc('has_permission', ...)`) ergänzen, damit der UI-Fehlertext sauber kommt – RLS bleibt die echte Grenze.

## UI
1. **Staff-Detail (`/admin/staff/:id`)** – neuer Tab/Block „Rechte – Kasse":
   - Tabelle: Permission-Key (Klartext + Beschreibung) × Spalten [Rollen-Default, Override (global), Override pro Standort].
   - Tri-State pro Zelle: `Default` / `Erlauben` / `Verbieten`.
   - Speichern ruft `setPermissionOverride` / `clearPermissionOverride`, optimistisch invalidieren.
2. **`/admin` Karte „Rechte"** (optional klein) – Link auf neue Übersicht `/admin/rechte` mit Default-Matrix (read-only, später editierbar).

UI-Texte deutsch, Beschreibungen aus zentralem `PERMISSION_LABELS`-Modul (`src/lib/admin/permissions-catalog.ts`), damit Default-Matrix + Tooltips eine Quelle haben.

## Tests
- DB-Tests `src/lib/cash/cash-permissions.db.test.ts`:
  - staff ohne Override darf nicht finalisieren; mit `allow` ja.
  - location-scoped allow erlaubt nur in Standort A, in Standort B 403.
  - Deny überstimmt Allow.
  - Korrektur fremder Abrechnung nur mit `cash.settlement.correct`.
- Unit-Test `has_permission`-Reihenfolge (deny → allow → default).
- Charakterisierungstest: Vor/Nach-Policy-Umbau identische Sichtbarkeit für Standard-Rollen (admin/manager/staff) → Regressionsschutz.

## Schritte
1. Migration 1: Enum + Tabellen + Defaults-Seed + Helfer.
2. Migration 2: Policy-Umbau M2 (drop-then-create), Smoke-Query gegen `pg_policies` zählt Policies vor/nach.
3. Server-Funktionen + Audit-Einträge.
4. UI Staff-Detail Rechte-Tab.
5. Tests + Policy-Inventur (CI-Check: keine `using (true)` neu eingeführt).
6. Doku-Update in `docs/gruendungsdokument.md` Anhang „Rechte M2".

## Offene Punkte (vor Bau bestätigen)
1. **Standort-Scope verpflichtend?** Vorschlag: optional – Default-Override = global; standortspezifisch nur, wenn Admin gezielt setzt. Ok?
2. **Self-Service-Recht „eigene Abrechnung abgeben"**: pro Rolle staff per Default `allow` (global). Reicht das oder soll auch das pro Standort einschränkbar sein? Vorschlag: ja, einschränkbar.
3. **Default-Matrix admin = alles**: Soll der Admin überhaupt per Override eingeschränkt werden können? Vorschlag: **nein** – Admin ignoriert Overrides (sonst kann sich ein Admin selbst aussperren). Ok?
4. **Tipp**: Lohn/Dienstplan-Keys (M4/M3) in derselben Tabelle, aber als spätere Migration. Enum `app_permission` jetzt nur mit `cash.*` starten – sauber erweiterbar.
