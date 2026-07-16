## WZ1 — Zeitübersicht: Alle-Standorte, sichtbare Lücken, GL-Priorität

Ein Commit, keine Migration.

### 0. Vorab-Absicherung (Ergebnis in Commit-Ansage)

Vor dem ersten Edit: per `rg` bestätigen, dass `primaryDepartment` / die Abteilungs-Zuordnung ausschließlich Anzeige-Gruppierung ist. Prüfsuche in:
- `src/lib/lohn/**` (Lohn-Pfade, Nettolohn, Provision)
- `src/lib/time/**` speziell `getSfnOverview`, SFN-Berechnung
- `src/lib/cash/**` (Trinkgeld-/Pool-Berechnung)
- alle Aufrufer von `primaryDepartment`, `buildPrimaryDeptMap`, `entryRowDepartment`

**Erwartung:** Abteilung ist reine Darstellung, keine Verzweigung in Geld/SFN. Beträge ändern sich um null Cent.

**Wenn doch Geld an der Abteilung hängt → STOPP, melden, nicht bauen.** Dann ist es keine Anzeige-Korrektur mehr, sondern eine Lohn-Änderung — Entscheidung Frank.

### 1. Server: `locationId` optional in `getTimeOverview`

`src/lib/time/time-admin.functions.ts`
- `inputValidator`: `locationId: z.string().uuid().nullable()`.
- `null` ⇒ kein `.eq('location_id', …)` (org-weit, inkl. `location_id IS NULL`).
- `staff_locations` bei `null` org-weit; `buildPrimaryDeptMap` reduziert je Mitarbeiter über alle Standorte.
- Buchhaltungs-/SFN-Pfad mit gleichem Filter analog anpassen.

### 2. Lücken-Counts im selben Handler

Nur bei `locationId != null`, zwei `head:true, count:'exact'` Queries:
- `unlocatedShifts`: Zeitraum, `location_id IS NULL`, betroffene Mitarbeiter.
- `openShifts`: Zeitraum, gewählter Standort, `ended_at IS NULL`.

Ergebnis-Shape um `gaps: { unlocatedShifts, openShifts }` erweitert. Summenquery bleibt bei `.not('ended_at','is',null)`.

### 3. GL-Priorität drehen (KGL)

`src/lib/time/primary-department.ts`
- `PRIORITY = ['gl','kitchen','service']`.
- Kommentar mit Verweis auf `roster-pool-snapshot.ts` (TP-GL-Hausregel als Referenz).
- Fallback leer bleibt `service`.

Tests aktualisieren + LAM-Fall (service+gl → gl) explizit.

Gruppierung im Handler: `rawDepartment` (Z3) hat Vorrang, `primaryDepartment` nur Fallback ohne `rawDepartment`. Unit-Test dazu.

### 4. UI

`src/routes/_authenticated/admin/zeit-uebersicht.tsx`
- `LocationPills` mit oberster Option „Alle Standorte" (Sentinel `__all__` → Server: `null`).
- **Default Zusammenfassungs-Tab:** „Alle Standorte".
- Detail-Sichten (Wochenplan) unverändert, brauchen konkreten Standort.

Zusammenfassungs-Panel: Hinweis-Balken oberhalb Tabelle, nur wenn Standort gewählt UND `gaps.unlocatedShifts + gaps.openShifts > 0`:
> „X Schichten ohne Standort und Y offene Schichten werden hier nicht gezählt — ‚Alle Standorte' wählen bzw. Ausstempelung nachtragen."

### 5. Tests

- `primary-department.test.ts`: neue Priorität, LAM-Fall.
- Neuer Unit-Test: `rawDepartment` wins, primary als Fallback.
- DB-Integration `time-admin-all-locations.db.test.ts`:
  (a) `locationId: null` summiert über zwei Standorte;
  (b) `location_id IS NULL`-Einträge in Alle-Standorte-Sicht enthalten;
  (c) Standort-Sicht liefert `gaps` korrekt.

### Commit-Kommentar

- Ein-Satz-Warnung: „Prioritätsumkehr wirkt rückwirkend auf Fallback-Gruppierung aller GL+Fachbereich-Personen."
- Ergebnis der Vorab-Absicherung: „Abteilung nur Anzeige, Beträge unverändert."

### Nicht anfassen

`buildStaffDeptsMap`/Wochenplan-Grid (Z3), `roster-pool-snapshot.ts`, `deleteTimeEntry`/WP1, Import-Code, `pap-2026/**`.

### Hygiene

`npx prettier --write` + `npx eslint --fix`; vier Gates + db-integration grün.
