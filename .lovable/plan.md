## Ziel
Formatierungs-Cleanup für die zwei zuletzt geänderten Bestellung-Dateien, ohne Logik zu ändern.

## Schritte

1. **Prettier** auf genau die zwei Dateien:
   ```
   bunx prettier --write \
     src/lib/bestellung/orders.functions.ts \
     src/routes/_authenticated/admin/bestellung.lieferanten.tsx
   ```

2. **ESLint --fix** auf dieselben zwei Dateien (nicht projektweit, um den Diff lokal zu halten):
   ```
   bunx eslint --fix \
     src/lib/bestellung/orders.functions.ts \
     src/routes/_authenticated/admin/bestellung.lieferanten.tsx
   ```

3. **Gate-Checks** (alle müssen grün sein, sonst Rollback):
   - `bunx eslint . --max-warnings 5` → 0 Errors, ≤ 5 Warnings
   - `bunx tsc --noEmit` → 0 Errors
   - `bunx vitest run` → grün

4. **Diff sichten**: `git diff --stat` — es dürfen nur die zwei Zieldateien auftauchen. Falls ESLint andere Dateien angefasst hat (sollte bei file-scope nicht passieren): melden statt commiten.

## Nicht-Ziele
- Keine Logik-Änderungen.
- Kein Aufräumen der 5 bestehenden `react-hooks/exhaustive-deps`-Warnings (separater Bauschritt laut ARBEITSWEISE).
- Keine weiteren Dateien formatieren.
