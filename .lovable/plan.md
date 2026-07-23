## Ziel

Die Kontrast-Erhöhung des Zebra-Streifens (`bg-muted/30` → `bg-muted/60`) regulär auf main anwenden. Aktueller Stand auf main: beide Zeilen stehen noch auf `/30`.

## Änderungen

1. **`src/components/zeit/PayrollTab.tsx` Zeile 390** (PayrollRow Zebra):
   - `${zebra ? "bg-muted/30" : ""}` → `${zebra ? "bg-muted/60" : ""}`
   - Zeile 498 (Rate-Notiz-Kasten `bg-muted/30`) bleibt **unangetastet**.

2. **`src/routes/_authenticated/admin/zeit-uebersicht.tsx` Zeile 1523** (Zusammenfassung-Zebra):
   - `idx % 2 === 1 ? "bg-muted/30" : ""` → `idx % 2 === 1 ? "bg-muted/60" : ""`

## Gates (wie üblich)

- `tsgo --noEmit` — 0 Fehler
- `vitest run` — grün
- `eslint . --max-warnings=0` — 0 Warnungen
- `prettier --check .` — clean

## Nicht Teil des Auftrags

Branch-Löschung (`lovable-sync-1784799297`, `fix/migrationskette`) erledigt der Bauherr selbst über die GitHub-Branches-UI — Git-State-Operationen sind für den Baumeister gesperrt.
