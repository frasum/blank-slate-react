## Ziel

Im Lohnrechner (`/admin/lohnrechner`) eine **Perioden-Übersicht** als Liste aller aktiven Mitarbeiter zeigen. Klick auf eine Zeile öffnet die bestehende Detailansicht. Liste und Detail teilen sich denselben Rechen-Kern — kein zweiter Pfad, kein Drift.

---

## Änderungen

### 1) `src/lib/lohn/lohn-rechner.functions.ts`

**1a — Helper extrahieren (kein Verhaltenswechsel):**
Pro-MA-Zusammenbau aus `berechneLohnFuerMitarbeiter` (ab `aggregateSfnPeriod(...)` bis `return { ... ergebnis }`) in private async-Helferfunktion `computeLohnForStaff(supabaseAdmin, { staffId, fromDate, toDate, mode, zusatzZeilen })` ziehen.

- `berechneLohnFuerMitarbeiter` bleibt nach außen **identisch**: Permission-Check, `loadAdminCaller`, org-scoped staff-Existenzprüfung bleiben im Handler; Handler ruft danach `computeLohnForStaff(...)` auf.
- Werfen bei fehlenden `staff_personal_details` bleibt **im Helper** (Einzelansicht soll klar fehlschlagen).

**1b — Neue Function `berechneLohnUebersicht`:**
- `method: "GET"`, `requireSupabaseAuth`, `assertPermission("payroll.calc.run")`, `loadAdminCaller(["admin","payroll"])`.
- Input: `{ fromDate, toDate, mode: "simple"|"extended" }` (Zod, dateRegex).
- Lädt alle `staff` mit `organization_id = caller.organizationId` und `is_active = true`, sortiert nach `display_name`.
- Schleife mit `try/catch` pro MA: ruft `computeLohnForStaff(..., zusatzZeilen: [])` auf; bei Fehler Zeile mit `error: message` + `null`-Zahlen, damit die Liste **nicht abreißt**.
- Rückgabe: `{ mode, fromDate, toDate, rows: [{ staffId, displayName, totalHours, hourlyRateCents, zuschlagCents, bruttoCents, nettoCents, auszahlungCents, error }] }`.

### 2) `src/routes/_authenticated/admin/lohnrechner.tsx`

- **Perioden-Dropdown** ersetzt freie Von/Bis-Inputs. `listPeriods` aus `@/lib/time/time-admin.functions` via `useQuery` (Key `["lohn-periods"]`). Auswahl setzt `fromDate = startDate`, `toDate = endDate`. Default = neueste Periode. `mode`-Select bleibt. `defaultFromTo()` als Fallback bis Perioden geladen.
- **Übersichts-Tabelle** als Primäransicht: `useQuery` auf `berechneLohnUebersicht` (Key `["lohn-uebersicht", fromDate, toDate, mode]`, enabled wenn Daten gesetzt). Spalten: **Mitarbeiter · Stunden · Stundenlohn · Zuschläge · Brutto · Netto · Auszahlung** (Helper `eur()`/`hrs()`). Bestehende `Table`-Komponente nutzen.
- Fehler-Zeilen (`error != null`): Name + Hinweis-Text in `text-muted-foreground text-xs`, Zahlenspalten „—".
- Zeilen klickbar (`cursor-pointer`, Hover, ausgewählte Zeile hervorheben) → setzt `staffId` und triggert die **bestehende** `berechneLohnFuerMitarbeiter`-Mutation mit gleichem `fromDate`/`toDate`/`mode`. Bestehende Detail-JSX (Zeilen, Person, Ergebnis, Excel-Export) bleibt **unverändert**, wird inline unter der Liste gerendert.
- **Altes Staff-Dropdown entfernen**, toten State aufräumen.

---

## Nicht anfassen

- Rechenlogik (`aggregateSfnPeriod`, `berechneLohn`, `staffDetailsToPerson`, `config-2026`, `pap-2026`, `sv-2026`, alle Tests/Golden-Master).
- Rückgabe-Shape von `berechneLohnFuerMitarbeiter` bleibt 1:1.
- `lohn-excel-export.ts`.
- Permissions/RLS/Schema — keine Änderungen, keine Migration.

---

## CSS-Hinweis

Keine `hsl(var(--…))`. Nur Tailwind-Klassen bzw. `color-mix(in oklch, …)`.

---

## Erfolgs-Gate

`tsc --noEmit`, `format:check`, `eslint .` (max-warnings=5), `vitest run` alle grün. Manuell: Periode wählen → Liste; 0-Std-MA mit 0h+Stundenlohn; MA ohne Personaldaten mit „—"+Hinweis (Liste reißt nicht ab); Row-Click → unveränderte Detailansicht inkl. Excel.
