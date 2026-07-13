# Dienstplan: Vergangenheit in offener Periode editierbar (Admin/Manager)

## Kontext & Befund

Die Prüfung von `src/lib/roster/roster.functions.ts` und der Grid-Komponenten zeigt: **serverseitig existiert kein Vergangenheits-Verbot**. `assertShiftDateUnlocked` (Zeile 87) blockt ausschließlich, wenn `periods.status = 'locked'`. Auch UI-seitig (`RosterGrid`, `DropCell`, `DayEditSheet`, `CellQuickPopover`, `AbsenceRangeForm`) gibt es keinen `iso < today`-Guard. Trotzdem beschreibst du, dass Änderungen in der Vergangenheit nicht durchgehen.

Die aktuellen `periods`-Zeilen der DB bestätigen das erwartete Bild: die laufende Periode `2026-06-26 … 2026-07-25` ist `open`, die vorherige `2026-04-26 … 2026-05-25` ist `locked`. Heute ist der 13.07.2026. Nach Regel „periods.start_date der laufenden Periode" **müssen** die Tage 26.06.–12.07. für Admin/Manager frei editierbar sein — heute vermutlich schon, aber ohne dokumentierte Zusicherung.

## Ziel

Explizit machen, testen und (falls nötig) reparieren, dass **Admin und Manager** im Dienstplan alle Tage `≥ periodStart` der aktuellen `open`-Periode bearbeiten dürfen — inklusive der bereits vergangenen. Grenze bleibt der Periodenwechsel: alles vor `periodStart` (also die vorherige, `locked`-Periode) bleibt gesperrt.

## Vorgehen

1. **Ist-Verhalten dokumentieren und reproduzieren.** Ein winziger DB-Live-Test gegen deinen Bestand: `createRosterShift` für einen konkreten Vergangenheits-Tag der laufenden Periode aufrufen (per `invoke-server-function`) und das Ergebnis prüfen. Erst danach entscheidet sich, ob wirklich eine Code-Änderung nötig ist oder nur eine Härtung + Test.

2. **`assertShiftDateUnlocked` schärfen und benennen.** Die Bedingung „nur wenn `status = 'locked'` blockieren" wird als bewusste Fachregel im Docblock hinterlegt: „Vergangene Tage der aktuellen offenen Periode sind für Admin/Manager frei editierbar. Nur `locked`-Perioden sind für alle gesperrt (Admin verschiebt den Riegel separat über Periodenwechsel)." Damit steht die Regel schwarz auf weiß und wird nicht bei einem späteren Refactor still verändert.

3. **Vollständigkeits-Audit der Schreibpfade.** Für jede Roster-Schreib-Funktion prüfen, ob ein `today`-Vergleich existiert, den es nicht geben darf: `createRosterShift`, `deleteRosterShift`, `updateRosterShiftSkill`, `moveRosterShift`, `setRosterAbsence`, `clearRosterAbsence`, `bulkClearRosterShifts`. Falls einer stumm `shift_date >= today` erzwingt, entfernen. Aktuelle Lesung: keine solche Sperre gefunden — Audit bestätigt das.

4. **Regressionstests.** Zwei kanonische Fälle in `roster.functions`-Nähe (Vitest, ggf. DB-Integration): (a) Admin/Manager kann `createRosterShift`/`setRosterAbsence` für einen Vergangenheits-Tag **innerhalb** der offenen Periode erfolgreich schreiben; (b) beide Funktionen werfen für einen Tag in der `locked`-Vorperiode „Periode gesperrt". Diese Tests sind der eigentliche Ergebnis-Beweis der Regel.

5. **Kein UI-Umbau.** `RosterGrid`/`DropCell`/`DayEditSheet` bleiben, wie sie sind — sie hängen bereits nur an `canEdit` (Scope) und `periodLocked` (Periodenstatus). Sollte im Audit ein bislang übersehener „Vergangenheits"-Blocker in einer dieser Komponenten auftauchen, wird er ersatzlos entfernt.

6. **Doku-Nachzug §91.** Kurzer Eintrag in `docs/arbeitsweise.md`: Fachregel, Audit-Ergebnis, Test-Namen, Klarstellung „Schichttausch ist nicht Teil dieses Schrittes — dort bleibt der bestehende `shift_date > today`-Guard, das war deine Entscheidung im Frage-Dialog."

## Bewusst NICHT enthalten

- **Schichttausch** (`swap.functions.ts`, Zeilen 1144/1152) — dessen `shift_date <= today`-Verbot bleibt, weil das eine eigene Fachregel ist (Tausch nur für Zukunft) und im Frage-Dialog nicht ausgewählt wurde.
- **Zeiterfassung / `time_locked_through_date` / `cash.functions.ts`** — separate Sperrlogik, ebenfalls nicht ausgewählt.
- **Änderung der `periods`-Status-Semantik** oder ein neuer „aufheben"-Knopf für die Vorperiode.

## Technische Details

- Betroffene Dateien: `src/lib/roster/roster.functions.ts` (Docblock + evtl. Guards), neue/erweiterte Tests neben bestehenden `roster-*.test.ts`, `docs/arbeitsweise.md`.
- Erfolgs-Gate: `tsc` · `eslint --max-warnings=5` · `prettier --check` · `vitest` grün; zusätzlich die zwei neuen Tests aus Schritt 4 grün, ein bewusst rot gezogener Vergleichslauf gegen die `locked`-Periode wirft `Periode gesperrt`.
- Keine Migration, keine RLS-Änderung, keine neuen Secrets.

## Rückfrage vor Umsetzung

Wenn Schritt 1 zeigt, dass dein konkreter Fehlversuch **doch** blockiert wurde (z. B. weil der Tag in der bereits `locked`-Vorperiode lag oder ein Scope-Recht fehlte), melde ich das zurück statt weiterzuändern — die Fachregel „locked bleibt locked" wollen wir nicht heimlich aushebeln.
