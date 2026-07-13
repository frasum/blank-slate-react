
## Ziel

Oben im Wochenplan (Reiter „Wochenplan" der Zeit-/Arbeitszeit-Übersicht) einen kleinen Umschalter einbauen, der bestimmt, worauf sich die vier Zuschlagsspalten am rechten Tabellenrand beziehen:

- **Woche** (heute): Summen der aktuell gewählten Kalenderwoche (unverändert).
- **Abrechnungsmonat**: Summen der gesamten aktuell gewählten Abrechnungsperiode.

Das Tages-Grid (Mo–So mit Anf./Ende) bleibt in beiden Modi die aktuelle Woche — der Toggle ändert ausschließlich die vier Summenspalten. Die bereits period-basierten Spalten **S / U / K** bleiben ebenfalls unverändert.

## Betroffene Spalten (Kopfzeile)

```text
… | Ges | 20–24 | 24–x | SF | S | U | K
       ^^^^^^^^^^^^^^^^^^^^^   (nur diese vier reagieren auf den Toggle)
```

## UI

- Neuer kompakter Umschalter in `src/routes/_authenticated/admin/zeit-uebersicht.tsx`, im Header-Card des Wochenplan-Tabs, in derselben Zeile wie „Heute" (rechts). Zwei Pills: **Woche** / **Abrechnungsmonat** (Default: Woche, kein Persist).
- Wenn „Abrechnungsmonat" aktiv:
  - Kleines Badge/Label über der Tabelle: „Summen: Abrechnungsperiode {fromDate}–{toDate}".
  - Tooltips der vier Spalten-Header wechseln entsprechend („… in der Abrechnungsperiode").

## Datenquelle

- `getTimeOverview` und `getTimeOverviewBatch` liefern bereits alle Einträge der Abrechnungsperiode (period-scoped) inkl. `started_at`/`ended_at` in der DB-Selektion.
- Rückgabeform um `startedAt`, `endedAt` und `rawDepartment` erweitern (Single- und Batch-Variante, verhaltensgleich für alle bestehenden Aufrufe — nur zusätzliche Felder).
- Client aggregiert in `zeit-uebersicht.tsx` eine neue Map:
  `periodTotalsByRow: Map<"staffId:dept", { total, evening, night, sunHol }>`
  durch Iteration über `overviewEntries`, mit `computeShiftHours(startedAt, endedAt, businessDate)` und derselben Zeilen-Attribution wie im Wochen-Aggregat (`entryRowDepartment(rawDepartment, staffDepts)` — ohne `rosterArea`-Boost, da für die ganze Periode nicht verfügbar; Fallback auf Primär-Abteilung).

## Übergabe an WeeklyPlan

- Zwei neue Props (optional, additiv):
  - `totalsScope: "week" | "period"`
  - `periodTotalsByRow: Map<string, { total; evening; night; sunHol }>`
- In `WeeklyPlan.tsx` in der Tabellen-Body-Zeile: statt `row.totals` bei `scope==="period"` den Wert aus `periodTotalsByRow.get(\`${row.staffId}:${row.department}\`)` (Fallback 0). Spalten-Header-Tooltips analog wechseln.

## Nicht enthalten

- Kein Persist des Toggles über Session-Wechsel.
- Keine Änderung an Tages-Grid, Buchhaltungs-Tab, Exporten, S/U/K-Spalten oder anderen Aggregaten.

## Technische Notizen

- Server-Fn-Rückgabe additiv → keine Anpassung anderer Aufrufer nötig.
- Keine neuen Requests: `overviewQ`/`overviewBatchQ` sind im Wochenplan-Tab bereits mit derselben Periode aktiv (werden vom Buchhaltungs-Tab geteilt) — Toggle nutzt nur den bereits vorhandenen Cache-Eintrag.
- Reine UI/Client-Aggregation, keine Migration.

## Verifikation

- `bun run typecheck`, ESLint, Vitest.
- Manuell im Preview: In Wochenplan (spicery, aktuelle Periode) zwischen „Woche" und „Abrechnungsmonat" umschalten; Ges/20–24/24–x/SF müssen sich sichtbar erhöhen (Periode ≥ Woche); Tages-Grid und S/U/K unverändert.
