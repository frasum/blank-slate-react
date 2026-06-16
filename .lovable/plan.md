## Problem
`.github/workflows/ci.yml` ruft `bun run eslint . --max-warnings=5` auf. Aktuell stehen genau 5 Warnings im Code (alle `react-hooks/exhaustive-deps` in `bestellung.*` und `zeit-uebersicht.tsx`) — jede weitere Warning, die jemand künftig hinzufügt, lässt CI rot werden, obwohl es nur Warnings sind.

## Vorschlag
Im CI-Step `--max-warnings=5` entfernen → ESLint bricht CI nur noch bei echten **Errors** ab; Warnings bleiben sichtbar in den Logs, blockieren aber den Build nicht. Gleiches Verhalten lokal (`bun run lint` ruft `eslint .` ohne Flag).

### Diff
```yaml
# .github/workflows/ci.yml, Zeile 18
- - run: bun run eslint . --max-warnings=5
+ - run: bun run eslint .
```

## Warum nicht den Schwellwert erhöhen?
Ein höherer Wert (z. B. `--max-warnings=20`) verschiebt das Problem nur. Sobald jemand sauber refactored und Warnings ergänzt, kippt CI erneut. „0 Errors blockieren, Warnings sind Hinweise" ist die robustere Regel.

## Nicht im Scope
- Die 5 bestehenden `exhaustive-deps`-Warnings inhaltlich beheben (separater Bauplan-Schritt; einige sind bewusste Defensiv-Memoizations).
- ESLint-Regeln verschärfen oder Auto-Format-Hook ergänzen.
