## Formatierung nach Standort-Refactor (Gate grün)

Reiner Formatierungs-Lauf, keine Logikänderungen.

### Schritte
1. `npx prettier --write src/`
2. `npx eslint . --fix`
3. Verifizieren:
   - `npx prettier --check .`
   - `npx eslint .`
   - `npx tsc --noEmit`
   - `npx vitest run`
4. `git status` / `git diff --stat` prüfen: ausschließlich Whitespace-/Quote-/Komma-Diffs. Sobald eine inhaltliche Änderung sichtbar wird → stoppen und melden.

### Abbruchkriterium
Wenn `eslint --fix` Auto-Fixes außerhalb reiner Formatierung vornimmt (z. B. Imports umsortiert in einer Weise, die TS-Verhalten ändert, oder Regeln wie `prefer-const` greifen), Schritt stoppen und Diff zur Freigabe vorlegen — nicht eigenmächtig committen.

### Nicht angefasst
Keine Komponenten, keine Migrationen, keine Logik.