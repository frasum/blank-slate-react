## Ziel

Beim Klick in eine Zeitzelle im Wochenplan sollen reine Ziffern-Eingaben (z. B. `1530`) automatisch als `15:30` erkannt werden — der Doppelpunkt muss nicht mehr getippt werden. Zeiten wie jetzt bleiben ebenfalls erlaubt (`15:30`, `9:5`), und valide `HH:MM`-Werte laufen weiter unverändert durch.

## Änderungen (nur `WeeklyPlan` in `src/routes/_authenticated/admin/zeit-uebersicht.tsx`)

1. **Input-Typ wechseln**: Das inline-Edit-Feld für Uhrzeiten von `<input type="time">` auf `<input type="text" inputMode="numeric">` umstellen. Das native Zeitfeld ignoriert freie Ziffern-Eingaben — genau das ist der Grund, warum `1530` heute nicht funktioniert.

2. **Normalisierer beim Commit** (kleine Hilfsfunktion `parseHHMM(raw)` im gleichen Modul):
   - Leerraum trimmen, `.` und `-` als Trenner akzeptieren, dann bei Bedarf zu `HH:MM` zusammenbauen.
   - Reine Ziffern:
     - `4` Stellen → `HHMM` (z. B. `1530` → `15:30`, `0905` → `09:05`)
     - `3` Stellen → `HMM` (z. B. `930` → `09:30`)
     - `1`–`2` Stellen → volle Stunde (z. B. `9` → `09:00`, `15` → `15:00`)
   - Mit Trenner: `9:5` → `09:05`, `15:3` → `15:03` (Minuten links aufgefüllt).
   - Bereichsprüfung `HH ∈ 00–23`, `MM ∈ 00–59`. Ungültig → wie bisher `toast.error("Ungültige Uhrzeit.")`, `edit` bleibt offen.

3. **Anzeige während des Tippens** unverändert lassen (roher String im State), damit die Eingabe flüssig bleibt. Normalisierung passiert genau einmal beim Enter/Blur in `commit(...)`, bevor gegen `HHMM` geprüft und an `onUpdateInline` / `onCreateInline` übergeben wird.

4. **Kein Layout-Umbau**: Feldbreite (`w-[58px]`), Höhe (`h-6`), Font (`font-mono text-sm`), Klick-/Marker-/Sperr-Logik, `handleBlur`, `data-edit-key`, `+`/`×`-Marker — alles bleibt wie in Feinschliff 4/5.

## Nicht anfassen

- Datenfluss (`onUpdateInline`, `onCreateInline`, `buildIsoFromLocal`, Mitternachtsüberlauf).
- Wochenplan-Layout, S/U/K-Ordnung, Zusammenfassung, Buchhaltung, Exporte.
- Andere Zeitfelder außerhalb der Wochenplan-Inline-Edit (z. B. Perioden-Dialoge).
- Keine Migration, kein SQL.

## Erfolgs-Gate

- `npx tsc --noEmit` 0; ESLint 0; Prettier sauber; Vitest grün.
- Manueller E2E (Frank): Zelle anklicken → `1530` tippen → Enter → speichert `15:30`. `930` → `09:30`. `15:3` → `15:03`. `abc` → Toast „Ungültige Uhrzeit.", Feld bleibt offen. Vorhandene Zeiten lassen sich weiter komfortabel überschreiben.