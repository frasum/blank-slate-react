## Ziel
Pro Mitarbeiter kann für Service, Küche und GL jeweils ein eigener Stundenlohn hinterlegt werden. Die Lohnabrechnung nutzt den jeweiligen Bereichs-Satz je Zeiteintrag, sofort auch für die laufende (offene) Abrechnungsperiode. Der Lohnbüro-Export weist Stunden × Sätze getrennt je Bereich aus.

## Terminierung
- **SQL-Freigabe:** jetzt möglich (additiv, harmlos).
- **Bau-Ausführung:** erst nach T0 (26.07.2026). Grund: Verdrahtung berührt Lohn-/SFN-Aggregatoren, die als stabile Referenz für den T0-Abgleich benötigt werden. Kein Zeitdruck (Juli-Periode geht Anfang August ans Lohnbüro).

## 1. Datenmodell (E1 — Vorab-SQL-Freigabe erforderlich)
Neue Tabelle `staff_compensation_rates` zusätzlich zum bestehenden Basiswert in `staff_compensation.hourly_rate` (Fallback bleibt).

```text
staff_compensation_rates
  id uuid pk
  organization_id uuid  NOT NULL  (FK organizations)
  staff_id uuid          NOT NULL  (FK staff)
  department staff_department NOT NULL   -- 'service' | 'kitchen' | 'gl'
  hourly_rate numeric(10,2)   NOT NULL   -- dokumentierte Domänen-Ausnahme, s.u.
  valid_from date              NOT NULL
  created_at / updated_at
  UNIQUE (staff_id, department, valid_from)
  Index auf (organization_id), (staff_id, department, valid_from DESC)
```

### DENY-ALL für Client (Korrektur 1)
Zugriff läuft ausschließlich über Server-Functions (`getStaffCompensation` / `upsertStaffCompensation`, beide mit `requireSupabaseAuth` + `has_permission`-Check). Deshalb:
- `GRANT ALL ON public.staff_compensation_rates TO service_role;`
- **Keine** Grants an `authenticated` (kein SELECT, kein Write).
- **Keine** Write-Policies; RLS aktiviert, ohne dass der Client jemals direkt darauf schreibt/liest.
- Konsistent mit MA1 (§96) und der Doktrin für Geld-Tabellen.

### Domänen-Ausnahme (Korrektur 2)
`numeric(10,2)` in Euro widerspricht der BIGINT-Cents-Regel, ist hier aber die richtige Wahl, weil `staff_compensation.hourly_rate` bereits so modelliert ist (Domänen-Konsistenz > Neubeginn). **Wird im Migrations-Kommentar explizit als dokumentierte Ausnahme vermerkt.** Der Resolver liefert nach außen Cents.

### Weiteres
- Trigger `tg_set_updated_at`.
- FK-Indizes gemäß FK1-Standard.
- `hourly_rate_2` in `staff_compensation` bleibt als Legacy-Feld stehen, kein Drop in diesem Schritt.

## 2. Server-Logik
- `src/lib/admin/compensation.functions.ts`:
  - `getStaffCompensation` liefert zusätzlich `rates: { service?, kitchen?, gl? }` (jeweils aktueller Satz + `valid_from`).
  - `upsertStaffCompensation` akzeptiert `rates`-Payload und schreibt pro Bereich einen neuen `valid_from`-Datensatz (Historie bleibt). Audit-Log-Eintrag pro Bereich mit `[REDACTED]`-Werten.
- Neues, reines Modul `src/lib/lohn/rate-resolver.ts`:
  - Input: `staff_id`, `department`, `date` → Output: `hourly_rate_cents`.
  - Neuester passender Bereichs-Satz mit `valid_from <= date`; Fallback auf `staff_compensation.hourly_rate` zum Datum.
- `src/lib/lohn/lohn-period.functions.ts` und alle Lohn-Aggregatoren (`personnel-stats`, SFN-Berechnung soweit lohnbezogen) rufen den Resolver pro Zeiteintrag mit der über `primary-department.ts` bestimmten Zeile (inkl. W2-GL-Regel). Damit greifen die neuen Sätze **sofort in der offenen Periode**; gesperrte Perioden bleiben unangetastet.

## 3. UI
`src/components/admin/PersonalDetailsTab.tsx` — Abschnitt „Vergütung":
- Statt Einzelfeld ein 4-Felder-Block: Basis (Fallback), Service €/h, Küche €/h, GL €/h — Bereichsfelder optional (leer = Basis).
- Gemeinsames „Gültig ab" (Default heute), pro Bereich individuell überschreibbar.
- Hinweis: „Leer = Basis-Satz. Änderung greift sofort in der laufenden Abrechnungsperiode; gesperrte Perioden bleiben unberührt."
- Read-only-Ansicht listet Basis + drei Bereichs-Sätze.

## 4. Tests
- Unit: `rate-resolver.test.ts` (Fallback, Bereichs-Match, Historien-Auswahl, GL-Sonderfall).
- DB-Integration: `staff-compensation-rates.db.test.ts` — Insert via Server-Function, direkter Client-Zugriff verweigert (DENY-ALL-Nachweis), Cross-Org verweigert, Payroll-Aggregation mischt Bereichs-Sätze korrekt.
- Charakterisierungstest Nettolohn: identisches Ergebnis, wenn keine Bereichs-Sätze gepflegt sind (Verhaltens-Neutralität bis zur Datenpflege).

## 5. Doku
`docs/arbeitsweise.md` §99 — LG1 abgeschlossen; Domänen-Ausnahme `numeric(10,2)` dokumentiert; DENY-ALL-Doktrin auch für neue Geld-Tabelle bestätigt.

## 6. Lohnbüro-Export: Stunden-Split je Abteilung (Ergänzung)
Der eigentliche LG1-Zweck. Im Buchhaltungs-Tab / Lohnbüro-Export (`personnel-stats` + PDF/CSV-Ausgang):
- Pro Mitarbeiter und Periode drei Zeilen (Service / Küche / GL), jeweils **Stunden × Satz = Betrag**.
- Summenzeile je Mitarbeiter unverändert (Gesamtbrutto).
- Ohne gepflegte Bereichs-Sätze: eine Zeile mit Basis-Satz (Verhaltens-Neutralität).
- Export-Header ergänzt um Spalten „Bereich", „Stunden", „Satz €/h", „Betrag €".
- Test: Vergleichsdatensatz mit gemischten Bereichen liefert erwartete drei Zeilen; Summe = bisherige Einzelzeile.

## Reihenfolge (E1-konform)
1. **SQL-Freigabe abwarten** → Migration `staff_compensation_rates` (inkl. Kommentar zur Domänen-Ausnahme, nur `service_role`-Grants).
2. Types-Regenerierung abwarten.
3. Server: Resolver + `compensation.functions.ts` + Payroll-Wiring.
4. UI-Umbau `PersonalDetailsTab`.
5. Lohnbüro-Export-Split (Punkt 6).
6. Tests + `prettier`/`eslint --fix` + Doku-Nachzug §99.

## Nicht enthalten
- Standort-abhängige Sätze.
- Zeiterfassungs-UI-Änderungen (Bereichszuordnung weiter über `primary-department`).
- `hourly_rate_2`-Drop (später separat).
