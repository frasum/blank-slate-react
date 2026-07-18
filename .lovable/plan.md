## Ziel
Reiner Doku-Commit §103 in `docs/arbeitsweise.md`. Keine Code-Änderungen.

## Änderungen (nur `docs/arbeitsweise.md`)

**1. Stand-Zeile ersetzen**
- alt: `Stand: 17.07.2026 (§102: Standorte-Tab-Layout + N3-Retry-Härtung + BM-A erledigt + Registry-Wechsel)`
- neu: `Stand: 18.07.2026 (§103: Standort-Tests CI-bewiesen + VA-EK-Inline + Abweichungs-Doppelfund + H1b)`

**2. §3-Regel ergänzen**
- Schluss `Erst dann committen."` ersetzen durch `Erst dann committen. Jede Abweichung vom freigegebenen Plan wird im Chat gemeldet, BEVOR committet wird."`
- Rest der Regel unverändert.

**3. §103 wortgleich am Dateiende anhängen**
(Vollständiger Textblock aus dem Prompt: SL2, VA-EK1, Abweichungs-Doppelfund, H1b — inkl. Merkposten SL2-R.)

## Vor Commit
`npx prettier --write docs/arbeitsweise.md`; vier Gates grün.

## Erfolgs-Gate
- Nur `docs/arbeitsweise.md` im Diff
- Stand-Zeile auf §103
- §3-Regel enthält Meldepflicht-Satz an der genannten Stelle
- §103 vollständig und wortgleich am Dateiende
- CI `check` grün
