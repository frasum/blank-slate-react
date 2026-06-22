## Ziel
Im Wochenheader der „Zeit-Übersicht" statt nur „(Fei)" den konkreten Feiertagsnamen anzeigen (z. B. „Ostermontag" am Mo 06.04.).

## Änderungen

### 1. `src/lib/time/shift-hours.ts`
- Bestehende `bavarianHolidayMmDd(year)` umbauen zu `bavarianHolidayMap(year): Map<string, string>` (MM-DD → Name). Namen aus den vorhandenen Kommentaren übernehmen: Neujahr, Heilige Drei Könige, Karfreitag, Ostermontag, Tag der Arbeit, Christi Himmelfahrt, Pfingstmontag, Fronleichnam, Mariä Himmelfahrt, Tag der deutschen Einheit, Allerheiligen, Heiligabend, 1. Weihnachtstag, 2. Weihnachtstag.
- `isBavarianHoliday(date)` weiter `boolean` (basiert auf `map.has(...)`), kein API-Bruch.
- Neue Export-Funktion `bavarianHolidayName(date: Date): string | null`.

### 2. `src/routes/_authenticated/admin/zeit-uebersicht.tsx`
- Import um `bavarianHolidayName` erweitern.
- In `dayMeta` (innerhalb `WeeklyPlan`) neues Feld `holidayName: bavarianHolidayName(d)`.
- Im Tages-`TableHead` den Block `{dm.isHol && <span …>(Fei)</span>}` ersetzen durch `{dm.holidayName && <span className="block text-[10px] font-normal text-muted-foreground">{dm.holidayName}</span>}`. Styling/Hintergrund unverändert.

### 3. Scope-Grenzen
- Reine Anzeige-Erweiterung. Keine Logik-/Aggregations-/Berechnungs-Änderung. `isBavarianHoliday` und `isSundayOrHoliday` verhalten sich unverändert.
- Andere Verwendungen (`shift-hours`, SFN, Export) werden nicht angefasst.

## Erfolgs-Gate
- Mo 06.04. zeigt im Wochenheader „Ostermontag" statt „(Fei)".
- `tsc --noEmit`, `eslint --max-warnings=5`, `prettier --check`, `vitest run` (738) grün — keine neuen/wegfallenden Tests.