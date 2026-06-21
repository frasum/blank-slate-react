Einzige Änderung: `getStaffForRoster` in `src/lib/roster/roster.functions.ts` filtert Mitarbeiter mit Rolle `payroll` raus.

## Schritte

1. Nach `caller` zusätzlich `role_assignments` laden:
   ```ts
   const { data: payrollRows, error: payrollErr } = await supabaseAdmin
     .from("role_assignments")
     .select("staff_id")
     .eq("organization_id", caller.organizationId)
     .eq("role", "payroll");
   if (payrollErr) throw payrollErr;
   const payrollIds = new Set((payrollRows ?? []).map((r) => r.staff_id as string));
   ```
2. `const visibleRows = (rows ?? []).filter((r) => !payrollIds.has(r.staff_id as string));` einführen.
3. Beide bestehenden Vorkommen von `(rows ?? [])` (Block `staffIds`-Aufbau Zeile 235-246 und finaler `.filter/.map/.filter/.sort`-Block ab Zeile 273) durch `visibleRows` ersetzen. Logik sonst unverändert.

## Bewusst nicht angefasst
- `time-admin.functions.ts` (Zeiterfassung / Lohn) — Begründung: tatsächlich gestempelte Stunden dürfen nicht versteckt werden.
- Alle anderen Roster-Funktionen, Schreibpfade, RLS, Migrationen.

## Verifikation
- Keine weitere Quelle für Grid-Zeilen: `getStaffForRoster` ist die einzige Server-Function, die Roster-Zeilen liefert (kein separater Picker im `RosterGrid`/`PaintToolbar`). Falls beim Bauen Gegenteiliges auffällt → stoppen und melden.
- `prettier --write`, `eslint --fix`, `tsc --noEmit`, `vitest run`.
- Ein Commit: `Dienstplan: payroll/Büro-Mitarbeiter aus dem Grid ausschließen`.
