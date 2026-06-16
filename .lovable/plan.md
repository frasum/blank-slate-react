## Ziel

Tote Manager-Korrektur-Server-Functions aus `src/lib/time/time-admin.functions.ts` entfernen (UI ist bereits weg). Reine Code-Bereinigung, keine Migration, keine Schema-Änderung.

## Datei-Änderungen (nur `src/lib/time/time-admin.functions.ts`)

### Entfernen — exportierte Functions
- `listEntriesForCorrection`
- `getTimeLockSettings`
- `createManualEntry`
- `updateTimeEntry`
- `deleteTimeEntry`
- `setTimeLock`

### Entfernen — private Helfer
- `entryWriteSchema`
- `assertOrder`
- `computeArbzgMeta`
- ggf. jetzt leerer Abschnitts-Kommentar „Schreiben — Manager (Korrektur) / Admin (Wasserlinie)"

### Imports
- `import { arbzgMinimumBreak, isArbzgShort, grossMinutesBetween } from "./break-rules";` → komplett raus.
- `import { assertBusinessDateUnlocked, loadTimeLock } from "./time-lock";` → reduzieren auf `import { assertBusinessDateUnlocked } from "./time-lock";` (wird von `setTimeEntryShift`/`createTimeEntryShift` weiterhin gebraucht).

### Bonus-Fix (mit der Bereinigung mitgenommen)
- `src/lib/migration/migration.functions.ts:14`: Kommentar-Anspielung auf `setTimeLock` neutralisieren („separater audit_log-Eintrag — hier inline"), damit nach dem Schnitt keine Doku-Drift ins Leere zeigt. Reine Kommentar-Änderung, kein Verhaltens-Effekt.

## Nicht anfassen
- Alle übrigen Functions in `time-admin.functions.ts` (`getTimeOverview`, `listPayrollNotes`, `upsertPayrollNote`, `getWeeklyTimeEntries`, `setTimeEntryShift`, `createTimeEntryShift`, `listPeriods`, `createPeriod`, `togglePeriodLock`, `deletePeriod`).
- `src/lib/time/break-rules.ts`, `src/lib/time/time-lock.ts`, Tests, Routen, Migrationen, Schema, Audit-Log-Logik der bleibenden Functions.

## Verifikation
- `bunx prettier --write` + `bun run lint` über die geänderte Datei.
- `bun run typecheck` → 0 Fehler.
- `bun run lint` → keine neuen Errors/Warnings.
- `bunx vitest run` → unverändert grün.
- `rg -n "listEntriesForCorrection|getTimeLockSettings|createManualEntry|updateTimeEntry|deleteTimeEntry|setTimeLock" src` → keine Treffer mehr.
