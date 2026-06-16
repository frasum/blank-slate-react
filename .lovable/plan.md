
## Ziel

Fall 2 (Minijob) im `src/lib/lohn/`-Modul auf den Cent korrekt rechnen und die 115 Prettier-Fehler beseitigen. Sonst nichts anfassen.

## Änderungen

### 1. `src/lib/lohn/config-2026.ts`
In `SV_SAETZE_2026` zwei neue Konstanten ergänzen:
- `RV_GESAMT_PROZENT: 18.6` — voller RV-Gesamtbeitragssatz (AG+AN), Basis der Minijob-Differenzrechnung.
- `MINIJOB_AG_PAUSCHAL_RV_PROZENT: 15.0` — AG-Pauschale im Minijob.

Bestehende `MINIJOB_RV_AN_PROZENT: 3.6` bleibt stehen (nur informativ, nicht mehr rechnungsrelevant — als Kommentar markieren).

### 2. `src/lib/lohn/sv-2026.ts`
In `svBeitraegeMinijob` die `rvCent`-Zeile ersetzen durch die Standard-SV-Differenz-Mechanik in Cent-Ganzzahlen:

```ts
// AN-RV im Minijob = Gesamt(18,6 %) − AG-Pauschale(15 %), jeweils
// cent-gerundet (standard-SV-Mechanik), nicht direkt 3,6 % — sonst 1 Cent Abweichung.
rvCent:
  roundCent((e.aushilfeZeitlohnCent * SV_SAETZE_2026.RV_GESAMT_PROZENT) / 100) -
  roundCent(
    (e.aushilfeZeitlohnCent * SV_SAETZE_2026.MINIJOB_AG_PAUSCHAL_RV_PROZENT) / 100,
  ),
```

Rechen-Check (Fall 2, 395,50 €):
- Gesamt: `round(39550 × 0,186) = 7356` (73,56 €)
- AG-Pauschale: `round(39550 × 0,15) = round(5932,5) = 5933` (59,33 €)
- AN-RV = `7356 − 5933 = 1423` (14,23 €) ✓

Keine weiteren Eingriffe — Normalfall-RV (9,3 %), KV/AV/PV, PAP, `lohn-core.ts`, Tests und `edlohn-faelle.json` bleiben unverändert.

### 3. Formatierung
- `npx prettier --write` über alle Dateien in `src/lib/lohn/` (inkl. `pap-2026/`) und sonst geänderte Dateien.
- `npx eslint . --fix` danach.

## Gate

- `npx tsc --noEmit` → 0 Fehler
- `npx eslint . --max-warnings=5` → 0 Fehler (115 Prettier-Fehler weg)
- `npx vitest run` → grün, alle 3 edlohn-Fälle bitgenau (Fall 2: RV 14,23 / Netto 491,75 / Auszahlung 418,90)
- `bun.lock` unverändert (keine neuen Deps)

Falls Fall 2 nach der Änderung nicht auf 14,23 kommt: STOPP und melden mit Eingabe/Soll/Ist — nicht weiter drehen.
