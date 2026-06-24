## Sicherheits-Fix #3: Permission-Overrides org-scharf

Eine Datei, reine TypeScript-Änderung. Keine Migration.

### `src/lib/admin/permissions.functions.ts`

1. Import ergänzen: `import { assertStaffInOrg } from "./org-guards";`
2. In **`setPermissionOverride`** direkt nach `assertRealAdmin(...)` und vor dem `staffRow`-Load:
   ```ts
   const { data: orgRow, error: orgErr } = await context.supabase.rpc("current_organization_id");
   if (orgErr) throw new Error(`org lookup failed: ${orgErr.message}`);
   const callerOrgId = orgRow as string | null;
   if (!callerOrgId) throw new Error("Keine Organisation für den Aufrufer.");
   await assertStaffInOrg(data.staffId, callerOrgId);
   ```
3. In **`clearPermissionOverride`** denselben Block an gleicher Stelle einfügen.

Bestehender `staffRow`-Load, Delete/Insert, Audit-Aufrufe bleiben unverändert — nach dem Guard gilt `staffRow.organization_id === callerOrgId`.

### Nicht anfassen
`getStaffPermissions`, `assertRealAdmin`, `org-guards.ts`, Signaturen, Audit-Inhalte, andere Dateien.

### Vor dem Commit
`bunx prettier --write` + `bunx eslint --fix` auf die Datei.

### Erfolgs-Gate
`tsgo --noEmit`, `bunx eslint . --max-warnings=5`, `bunx prettier --check .`, `bunx vitest run` (738) grün — keine Test-Drift.
