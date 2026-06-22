## Ziel
PIN-Setzen atomar und org-scharf machen. Reine TypeScript-Änderung in 3 Dateien, keine Migration.

## Änderungen

### 1. Neue Datei `src/lib/admin/org-guards.ts`
Enthält `assertStaffInOrg(staffId, organizationId)` — 1:1 aus `staff.functions.ts` übernommen, lädt `supabaseAdmin` lazy, wirft „Mitarbeiter nicht in dieser Organisation." wenn kein Treffer.

### 2. `src/lib/admin/staff.functions.ts`
- Lokale `assertStaffInOrg`-Definition entfernen.
- `import { assertStaffInOrg } from "./org-guards";` ergänzen.
- Bestehende Aufrufe bleiben unverändert.
- `assertLocationInOrg` bleibt unangetastet.

### 3. `src/lib/admin/pin.functions.ts`
- `import { assertStaffInOrg } from "./org-guards";` ergänzen.
- **`setPin`**: innerhalb `runGuarded` zuerst `await assertStaffInOrg(data.staffId, caller.organizationId);`. Danach Delete+Insert durch **ein** atomares Upsert ersetzen:
  ```ts
  supabaseAdmin.from("staff_pins").upsert(
    { staff_id, organization_id, pin_hash, updated_at: new Date().toISOString() },
    { onConflict: "staff_id" },
  );
  ```
  Audit-Block unverändert (kein Hash, kein PIN ins Log).
- **`clearPin`**: zusätzlich `await assertStaffInOrg(...)` vor dem (bereits org-gescopten) Delete, damit Cross-Org klar abgewiesen wird statt stillem No-op.

## Nicht angefasst
`assertLocationInOrg`, `assertValidPinFormat`, `runGuarded`, `makeAuditWriter`, Funktions-Signaturen/Rückgaben, andere Atomaritäts-Pfade (Rollen/Skills/Standorte/Account).

## Vorab-Check
Vor dem Patchen prüfe ich, dass `staff_pins` tatsächlich `UNIQUE(staff_id)` hat (Voraussetzung fürs `onConflict: "staff_id"`-Upsert). Falls nicht, melde ich den Konflikt zwischen Spec und DB-Realität statt still ein anderes Conflict-Target zu wählen.

## Verifikation
- `tsc --noEmit`, `eslint`, `prettier --check`, `vitest run` grün.
- Empfehlung: zwei DB-Integrationstests (`pin.db.test.ts`, non-blocking): doppeltes `setPin` → genau eine Zeile mit neuem Hash; `setPin` mit fremder Org → wirft, schreibt nichts. Sage Bescheid, wenn ich die mitschreiben soll.
- Manueller E2E durch dich: setzen → ändern → Login mit neuem PIN; löschen → Login schlägt fehl; `audit_log` enthält `staff.set_pin` ohne Hash.
