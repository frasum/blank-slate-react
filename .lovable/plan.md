# COCO Fix #2d — Account-Erstellung cross-system absichern

## Ziel
DB-Teil von `createStaffAccount` (user_links-Insert + staff-Update) in einer `SECURITY DEFINER`-RPC atomar machen. Bei Fehler nach erfolgreichem `auth.admin.createUser` den Auth-User per Saga-Kompensation wieder entfernen — keine verwaisten Auth-User, keine dauerhaft blockierten E-Mails.

`resetStaffPassword` bleibt bewusst unverändert (harmloser Failure-Mode; Kompensation wäre schlechter als Ist-Zustand).

## Schritt 1 — Migration (`supabase--migration`)

Neue plpgsql-Funktion 1:1 wie in der Anweisung:
- `public.link_account_to_staff(p_staff_id, p_organization_id, p_user_id, p_email)` → `void`
  - Guards: `staff` gehört zu `organization`; noch kein Link auf `staff_id`.
  - `INSERT user_links` + `UPDATE staff SET must_change_password=true, email=p_email` in einer Transaktion.

Berechtigungen: `REVOKE ALL … FROM PUBLIC, anon, authenticated`, `GRANT EXECUTE … TO service_role`.

Migration kommt zuerst und blockiert auf Approval. Erst nach Approval + Types-Regenerierung wird die TS-Datei angefasst (sonst `rpc("link_account_to_staff")` nicht typsicher).

## Schritt 2 — Server-Function umstellen (`src/lib/admin/account.functions.ts`)

In `createStaffAccount`:

**Unverändert:** `loadAdminCaller`, `runGuarded`, staff-in-org-Read, existing-link-Read, `generateStandardPassword()`, der `supabaseAdmin.auth.admin.createUser(...)`-Aufruf inkl. dessen Fehlerbehandlung, der `return`-Block (Passwort+E-Mail an UI, Audit `staff.account_created`).

**Ersetzt:** Den `user_links`-Insert und das anschließende `staff`-Update durch:

```ts
const { error: linkErr } = await supabaseAdmin.rpc("link_account_to_staff", {
  p_staff_id: data.staffId,
  p_organization_id: staff.organization_id,
  p_user_id: created.user.id,
  p_email: data.email,
});
if (linkErr) {
  await supabaseAdmin.auth.admin.deleteUser(created.user.id).catch(() => {});
  throw linkErr;
}
```

**Nicht angefasst:** `getStaffAccountStatus`, `resetStaffPassword`, `generateStandardPassword`, alle Guards/Validierungen/Middleware, Signaturen/Rückgaben.

## Schritt 3 — Pre-Commit
`bunx prettier --write` + `bunx eslint --fix` über die geänderte Datei (inkl. Leerzeile am Dateiende).

## Erfolgs-Gate
- `bunx tsgo --noEmit` grün (Types regeneriert)
- `bunx eslint . --max-warnings=5` grün
- `bunx prettier --check .` grün
- `bunx vitest run` — 738 Tests, keine wegfallenden
- Neue RPC: 0 Rechte für `anon`/`authenticated`, nur `service_role`

## Nicht im Scope
`resetStaffPassword` (begründet unverändert), andere Tabellen/Policies/UI/Functions, neue DB-Integrationstests (empfohlen, aber non-blocking).
