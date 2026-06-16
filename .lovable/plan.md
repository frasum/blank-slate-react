## Ursache
Die roten CI-Runs (#158–#161) scheitern alle am `eslint`-Step. Lokal reproduziert: **5 Prettier-Formatierungsfehler**, alle aus den letzten zwei Commits:

- `src/components/brand-lockup.tsx` — 4 Stellen (mein letzter Logo-Umbau, JSX zu breit / fehlender Newline am Dateiende)
- `src/routes/_authenticated/admin/index.tsx` — 1 Stelle (System-Card-Objekt nicht mehrzeilig formatiert)

`tsc --noEmit` und `vitest run` (571 Tests) sind grün. Die 5 ESLint-Warnings sind unter dem Schwellwert (`--max-warnings=5`) und nicht das Problem.

## Fix
Einmal `bun run eslint . --fix` ausführen — alle 5 Errors sind als „fixable" markiert. Danach beide Dateien gegenlesen, dass sich keine Logik geändert hat, und CI lokal trockenprüfen (`tsc --noEmit`, `eslint . --max-warnings=5`).

## Nicht im Scope
- Die 5 bestehenden React-Hook-Warnings (`exhaustive-deps`) — die liegen unter dem Schwellwert, kein CI-Blocker.
- `db-integration`-Job — der ist als `continue-on-error: true` markiert und beeinflusst den Run-Status nicht.
