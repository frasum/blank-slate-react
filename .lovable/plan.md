Reine Doku-Änderung an `docs/arbeitsweise.md`. Kein Code, keine Migration.

## Änderungen

**1. Abschnitt §6 (Zeile 209):** Die eine bestehende BWA-Zeile wird durch die vier neuen Zeilen ersetzt (M-BWA F1, Historie-Import, F2a Dashboard, F2b+F3 offen) — Wortlaut exakt wie in der Aufgabe.

**2. Neuer Abschnitt §41 am Dateiende** (nach §40, Zeile 1440): "Modul M-BWA — Steuerberater-BWA in COCO: F1 Fundament + F2a Dashboard (03.07.2026)" mit den vier Unterabschnitten Designentscheidungen (F1), Historie-Import, F2a Dashboard, Offen/Auflagen — Wortlaut exakt wie in der Aufgabe.

§1–§40 inhaltlich unverändert (außer der einen ersetzten Tabellenzeile in §6).

## Erfolgs-Gate vor Commit

- `npx prettier --write docs/arbeitsweise.md`
- `npx prettier --check .` (grün, ganzes Repo — CI prüft docs/)
- `npx tsc --noEmit`, `npx eslint . --max-warnings=5`, `npx vitest run` — alle grün (dürfen sich durch reine Doku nicht ändern)
