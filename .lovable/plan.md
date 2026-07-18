## Ursache
`listStaff` (src/lib/admin/staff.functions.ts) verlangt `manager+` via `loadAdminCaller(..., "manager")`. Payroll ist Seitenrolle und erfüllt keine Mindesthierarchie → `ForbiddenError`, die Liste im Mitarbeiter-Tab bleibt leer. Auch alle schreibenden Staff-Funktionen (`updateStaff`, `replaceRole`, `replaceSkills`, `setActive`, `resetPassword`, `linkAccount` etc.) laufen über `manager+` bzw. `admin` und sperren Payroll aus.

## Fix (ein Commit)
- In `src/lib/admin/staff.functions.ts` alle Rollenchecks für Staff-CRUD von Hierarchie auf Allow-List umstellen:
  - Lesen (`listStaff`, `getStaff`): `admin | manager | planer | payroll`.
  - Bearbeiten der Stammdaten und Personal-Details (`updateStaff`, `upsertPersonalDetails`, `replaceSkills`, `setActive`, evtl. Notizen): `admin | manager | payroll`.
  - Reserviert bleiben admin-only: Anlegen/Löschen von Accounts, Passwort-Reset, Rollenwechsel, PIN-Reset (Core-Regel „Account-Anlage & Passwort-Reset nur Admin").
- Umsetzung: statt `loadAdminCaller(..., "manager")` neutral laden und danach `assertRoleAllowed(caller.role, [...])` mit der jeweiligen Liste.
- Keine Schema-/Grants-/RLS-Änderung. `staff` und Kindtabellen laufen weiterhin über `supabaseAdmin` im Server-Fn nach Rollencheck.

## Sichtbarkeit
- Portal-Nav und `admin/route.tsx` bleiben unverändert (Payroll sieht Backoffice → Mitarbeiter). Keine UI-Änderung am Mitarbeiter-Tab.

## Doku
- `docs/arbeitsweise.md` §104: Payroll-Rechte auf Mitarbeitern — Lesen + Bearbeiten der Stammdaten/Personaldetails; Account/Passwort/Rolle/PIN bleiben admin-only.

## Nicht enthalten
- Keine Änderungen an anderen Modulen, keine Rechte-Matrix-Umbauten, kein Umschalten auf `permission_role_defaults`.