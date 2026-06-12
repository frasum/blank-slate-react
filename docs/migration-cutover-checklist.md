# Migration-Cutover-Checkliste (B2c)

Diese Checkliste begleitet den Übergang von den Alt-Systemen
(`tagesabrechnung`, `bunker`) auf das neue System. Der technische Import läuft
über `/admin/migration` (Admin-only). Das Stilllegen der Alt-Syncs erfolgt
manuell in den Quellsystemen — die App tut hier nichts automatisch.

## Rollen

- **Admin (du):** führt Import, Mapping-Bestätigung und Cutover-Schritte aus.
- **Manager:** ab Cutover-Zeitpunkt einzige Quelle für Korrekturen
  (`/admin/zeit`). Keine Schreibaktionen in den Alt-Systemen mehr.

## Vorbereitung (T-7 bis T-1)

1. **Export-Queries fixieren** (in beiden Alt-Systemen):
   - `tagesabrechnung/zt_shifts.csv` mit Headern:
     `id,employee_id,staff_name,staff_nickname,shift_date,department,start_time,end_time,absence_type,is_holiday,total_hours,evening_hours,night_hours,night_deep_hours,sunday_holiday_hours`.
   - `bunker/zt_shifts.csv` mit Headern:
     `id,staff_id,staff_name,restaurant_id,shift_date,source,start_time,end_time,clocked_in_at,clocked_out_at,break_minutes,absence_type,total_hours,notes`.
   - Format: UTF-8, Komma-getrennt, `"`-Quoting; `HH:MM:SS` für Zeiten;
     ISO 8601 für `clocked_*`. Abweichende Header werden vom Parser
     hart abgelehnt.
2. **Dry-Run je Quelle**: CSV hochladen → „Dry-Run". Erfolgs-Kriterien:
   - `read = imported + Σ skippedByReason` (Bilanz-Invariante, wird von der
     App erzwungen).
   - `unmapped_staff = 0` *nach* Mapping-Bestätigung.
   - `invalid_time = 0` (sonst Export-Query nachschärfen).
3. **Identitäts-Mapping** je Quelle:
   - „Identitäten vorschlagen" laufen lassen → Vorschläge prüfen, jedes
     Alt-Konto entweder einem Staff zuordnen oder bewusst auf „nicht
     zuordnen" stellen (= Schichten wandern in `unmapped_staff`).
   - Alle Zeilen bestätigen, bis Badge „alle bestätigt" leuchtet.
4. **Abgleichsbericht** je Quelle erstellen (Cycle `26.–25.`):
   - Erwartung: 0 Zeilen mit Differenzen. Jede Differenz ist ein Befund —
     vor Commit erklären (manuelle Edits im Alt-System, Rundungs-Drift,
     Feiertags-Konfiguration).

## Cutover-Tag (T0)

1. **Alt-Systeme einfrieren** (manuell, in den Quellsystemen):
   - Schreib-Rechte für alle Nicht-Admin-Konten entziehen.
   - Laufende Stempelungen abschließen.
   - Vermerk im Alt-System: „Read-only ab `<Datum/Uhrzeit>`, neue Quelle:
     `tococo`."
2. **Finale Exporte ziehen** (beide Quellen) — Zeitraum bis einschließlich
   T0-1.
3. **Commit je Quelle** über `/admin/migration`:
   - Reihenfolge: `tagesabrechnung` zuerst, dann `bunker` (oder umgekehrt —
     der Import ist über `import_key` idempotent und konfliktfrei).
   - Nach jedem Commit: Run-ID + neue Wasserlinie notieren.
4. **Wasserlinie prüfen** (`/admin/zeit`): `time_locked_through_date` muss
   dem höchsten importierten `business_date` entsprechen.
5. **Audit-Log prüfen**: pro Commit genau ein `time_entries.import`-Eintrag
   plus ggf. ein `settings.time_lock_moved`-Eintrag.

## Nachlauf (T+1 bis T+7)

1. **Erneuter Abgleichsbericht** mit den Final-Exporten — Erwartung: 0
   Differenzen. Differenzen jetzt sind ein Hinweis auf nachträgliche
   Manipulation der Alt-Systeme nach dem Einfrieren.
2. **Alt-Syncs stilllegen** (manuell):
   - Geplante Jobs/Cron in den Alt-Systemen deaktivieren.
   - API-Webhooks Richtung Alt-Systeme deaktivieren.
   - Vermerk im Betriebshandbuch.
3. **Re-Import-Probe**: gleiche CSV nochmal als Dry-Run laden — Zähler
   müssen `imported = 0` und `duplicate = read - andere_skips` zeigen
   (Idempotenz-Beweis).
4. **Backup**: finale CSVs verschlüsselt archivieren (nicht im Repo, nicht
   im Projekt-Storage — externes Backup-Ziel).

## Rollback-Plan

Ein Rollback ist *nicht* automatisiert — bewusst, weil ein Teil-Rollback
nach Korrekturen im neuen System Daten beschädigen würde. Vorgehen bei
kritischem Befund:

1. Wasserlinie zurücksetzen ist **nicht** vorgesehen; stattdessen
   Korrekturen über `/admin/zeit` (mit Audit-Begründung).
2. Bei systematischem Fehler: betroffene `time_entries` mit
   `source='import'` per gezielter SQL-Migration entfernen (Audit-Eintrag
   pro Zeile), `import_runs`-Eintrag als `rollback`-Vermerk markieren,
   Cutover ab Schritt „Commit je Quelle" wiederholen. Die Idempotenz über
   `import_key` macht den Re-Import sicher.

## Erfolgs-Kriterien (Abnahme)

- Bilanz-Invariante in jedem Lauf erfüllt (App-seitig erzwungen).
- Abgleichsbericht ohne unerklärte Differenzen.
- Wasserlinie passt zum höchsten importierten Geschäftstag.
- Re-Import liefert 0 neue Zeilen (Idempotenz).
- Alt-Systeme nachweislich read-only.