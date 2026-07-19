## Ziel
Mitarbeiter sollen im Portal (Meine Schichten) alle Schichten sehen können, die in einer **freigegebenen** Periode liegen — auch wenn sie über die aktuellen 4 Wochen hinausgehen. Fensteroption „4 Wochen" / „Diese Woche" bleibt bestehen; neu wird ein dritter Modus **„Bis Ende Freigabe"** (Default, wenn eine Freigabe existiert, die über die 4 Wochen hinausreicht).

## Umsetzung

### 1) Server: `getMyShifts` freigabefähig machen (`src/lib/roster/roster.functions.ts`)
- Neuer optionaler Input `mode: "range" | "released"` (Default `range`, rückwärtskompatibel).
- Bei `mode === "released"`:
  - Standorte des Mitarbeiters aus `staff_locations` laden.
  - Alle `roster_releases`-Einträge für diese Standorte + Organisation laden, `period_id`s sammeln (inkl. Bereich, damit nur freigegebene Area sichtbar ist).
  - Zugehörige `periods` laden, `to = max(end_date)`, `from = today`.
  - `roster_shifts`-Query zusätzlich per `(location_id, area)`-Paare filtern, sodass nur Zeilen aus tatsächlich freigegebenen (Standort × Bereich)-Kombinationen zurückkommen. Nicht freigegebene Standort/Bereich-Schichten bleiben unsichtbar.
- Bei `mode === "range"`: Verhalten unverändert.

### 2) Neuer Helper: `getMyReleaseHorizon`
Kleine Server-Fn, die die spätesten freigegebenen `end_date`s pro Standort für den eingeloggten Mitarbeiter liefert (`{ maxEnd: string | null }`). Damit weiß der Client, ob der Modus „Bis Ende Freigabe" sinnvoll/nötig ist und kann ihn als Default setzen, wenn `maxEnd > today+27d`.

### 3) Client: `src/routes/_authenticated/zeit/schichten.tsx`
- `RangeKey` um `"released"` erweitern.
- Query `my-release-horizon` hinzufügen; wenn `maxEnd` weiter als 4 Wochen reicht, `range` initial auf `"released"` setzen.
- Dritter Button „Bis Ende Freigabe" — nur sichtbar, wenn eine Freigabe existiert. Aktivierter Button ruft `getMyShifts({ mode: "released" })` auf (ohne `from/to`).
- `getMyAbsences` / `getMyShiftMates` weiterhin auf demselben `from..to`-Fenster (Anzeige-Konsistenz).

### 4) Tests
- Neuer Unit-Test für die Horizont-Berechnung (max end_date pro Staff via Standorte × Releases): reine Utility separat, falls sinnvoll extrahierbar.
- Bestehende Roster-Tests bleiben unberührt.

## Nicht enthalten
- Keine Änderung an Admin-Freigabe-UI, Perioden, Tausch-Regeln oder Abwesenheits-Logik.
- Keine Migration nötig — bestehende Tabellen `roster_releases`, `periods`, `staff_locations` reichen.
