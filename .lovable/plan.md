## Diagnose

Mo (Sirirat „MO", `4edfdb…`) ist in `staff_locations` an beiden Standorten (spicery, YUM) für **kitchen, service UND gl** eingetragen. `time_entries` hat keine Abteilungs-Dimension — die Zeit-Übersicht attribuiert jede Zeile über `entryRowDepartment` → `primaryDepartment` (`src/lib/time/primary-department.ts`), und dessen Reihenfolge ist hart:

```text
kitchen  >  service  >  gl
```

Also: sobald jemand irgendwo als „kitchen" gelistet ist, laufen alle Stunden ohne explizite Abteilung auf die Küchenzeile — unabhängig davon, was tatsächlich im Dienstplan steht. Mos Dienstplan-Schichten der letzten Wochen sind aber **ausnahmslos `area = 'service'`**.

Der Fehler ist damit systemisch (nicht Mo-spezifisch): Jede Person, die zusätzlich zur eigentlichen Abteilung irgendwo mal in „kitchen" oder darüber gemappt wurde, wird in der Zeit-Übersicht falsch einsortiert.

## Zwei-Stufen-Fix

### Stufe 1 — Daten bereinigen (sofort, ohne Code)

- In der Stammdaten-UI Mos Zuordnungen an beiden Standorten auf **nur `service`** reduzieren (kitchen + gl entfernen). Danach stimmt die Zeit-Übersicht rückwirkend, weil die Attribution zur Anzeigezeit berechnet wird.
- Kein Migrationseingriff nötig — reine Datenpflege.

### Stufe 2 — Systemischer Fix (Code, gleiche Attributions-Logik für alle)

Ziel: die tatsächliche Roster-Area des jeweiligen Tages schlägt die statische Rangfolge.

Änderungen:

1. **`src/lib/time/primary-department.ts`**
   - Neue Signatur `entryRowDepartment(entryDept, staffDepts, opts?: { rosterArea?: Department | null })`.
   - Wenn `entryDept == null` und `rosterArea` an dem Tag existiert und in `staffDepts` liegt → Attribution auf `rosterArea` (nicht `primaryDepartment`).
   - Fallback unverändert (`primaryDepartment(staffDepts)`), Reihenfolge bleibt kitchen > service > gl nur für den Fall „gar keine Roster-Info".
   - Tests in `primary-department.test.ts` um Roster-Overlay-Fälle erweitern.

2. **`src/routes/_authenticated/admin/zeit-uebersicht.tsx`**
   - Roster-Shifts pro (staffId, iso) aus vorhandenem Loader mitziehen (Map `staffId|iso → area`).
   - An der Attributionsstelle (Zeile 790–798) `rosterArea` mit übergeben.
   - Für Zeilen-Gruppierung: existiert für einen Tag bereits eine Roster-Area einer Person, wird die dazugehörige Departments-Zeile garantiert erzeugt, damit die Stunden dort landen (statt eine neue leere „Küche"-Zeile zu öffnen, wenn dort nichts geplant ist).

3. **Regression-Guard**
   - Charakterisierungstest mit Mo-artigem Setup (`staffDepts = [kitchen, service, gl]`, Roster-Area = service, entryDept = null) → erwartetes Ergebnis `service`.

Kein Schema-Change, keine RLS-Änderung, keine Migration. Reine Anzeige-Logik + Datenpflege.

## Nicht enthalten (bewusst)

- Keine Änderung an `time_entries`-Schema (Abteilung weiter am Eintrag nur wenn explizit gestempelt).
- Keine Änderung an der Reihenfolge kitchen > service > gl als reiner Fallback — nur die Roster-Area schlägt ihn.
- Keine UI-Umschichtung in der Stammdaten-Pflege (könnte separat als „Primary Department"-Feld folgen).

## Test

- `bun run test src/lib/time/primary-department.test.ts` grün.
- Zeit-Übersicht der letzten 14 Tage für Mo zeigt Stunden unter **Service** (statt Küche), ohne dass ihre Zuordnung geändert werden muss.
