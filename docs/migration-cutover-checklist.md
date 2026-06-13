# Migration-Cutover-Checkliste (B2c)

Diese Checkliste begleitet den Übergang vom Alt-System `tagesabrechnung` auf
das neue System. Der technische Import läuft über `/admin/migration`
(Admin-only). Das Stilllegen der Alt-Syncs erfolgt manuell in den
Quellsystemen — die App tut hier nichts automatisch.

## Befund vor Cutover (verifiziert)

- **`tagesabrechnung.zt_shifts`**: produktive Quelle, 3890 Zeilen im
  finalen Export.
- **`bunker.zt_shifts`**: leer (als privilegierte Rolle verifiziert). Es
  wird **kein** Bunker-Import durchgeführt. Der Bunker-Parser bleibt im
  Code als getesteter, aber inaktiver Pfad — falls die Quelle künftig
  doch befüllt wird, ist er lauffähig.

## Rollen

- **Admin (du):** führt Import, Mapping-Bestätigung und Cutover-Schritte aus.
- **Manager:** ab Cutover-Zeitpunkt einzige Quelle für Korrekturen
  (`/admin/zeit`). Keine Schreibaktionen in den Alt-Systemen mehr.

## Vorbereitung (T-7 bis T-1)

1. **Export-Query fixieren** (Alt-System `tagesabrechnung`):
   - Spalten (Reihenfolge egal, Header set-basiert geprüft):
     `id, employee_id, staff_name, staff_nickname, shift_date, department, start_time, end_time, absence_type, is_holiday, total_hours, evening_hours, night_hours, night_deep_hours, sunday_holiday_hours`.
   - Format: UTF-8, Delimiter `;` **oder** `,` (Parser erkennt automatisch
     anhand der Header-Zeile), `"`-Quoting, Dezimaltrennzeichen Punkt;
     `HH:MM:SS` oder `HH:MM` für Zeiten (`24:MM` als „Tagesende" wird auf
     `00:MM` Folgetag normalisiert). Abweichende Header werden vom Parser
     hart abgelehnt.
2. **Dry-Run**: CSV hochladen → „Dry-Run". Sollwerte für den aktuellen
   Export (Stand T-1, 3890 Zeilen):
   - `read = 3890`
   - `skipped.absence = 131` (Abwesenheitscodes wie `vacation`)
   - `skipped.invalid_time = 58` (56 Zeilen ohne Start-/Endzeit + 2
     Zeilen mit defektem Endwert `01:001`; siehe Notiz unten)
   - vor Mapping-Bestätigung zusätzlich `skipped.unmapped_staff > 0`
   - `read = imported + Σ skippedByReason` (Bilanz-Invariante, wird von der
     App erzwungen).
   - `unmapped_staff = 0` _nach_ Mapping-Bestätigung.
3. **Identitäts-Mapping**:
   - „Identitäten vorschlagen" laufen lassen → Vorschläge prüfen, jedes
     Alt-Konto entweder einem Staff zuordnen oder bewusst auf „nicht
     zuordnen" stellen (= Schichten wandern in `unmapped_staff`).
   - Alle Zeilen bestätigen, bis Badge „alle bestätigt" leuchtet.
4. **Abgleichsbericht** erstellen (Cycle `26.–25.`):
   - Erwartung: 0 Zeilen mit Differenzen. Jede Differenz ist ein Befund —
     vor Commit erklären (manuelle Edits im Alt-System, Rundungs-Drift,
     Feiertags-Konfiguration).

Hinweis zu den zwei `01:001`-Zeilen: Der Parser fängt sie als
`invalid_time` ab, damit der DB-Insert nicht knallt. Vor dem Commit
entweder im Alt-System auf `01:00` korrigieren und neu exportieren oder
nach dem Commit per Korrektur in `/admin/zeit` nachtragen.

## Cutover-Tag (T0)

1. **Alt-Systeme einfrieren** (manuell, in den Quellsystemen):
   - Schreib-Rechte für alle Nicht-Admin-Konten entziehen.
   - Laufende Stempelungen abschließen.
   - Vermerk im Alt-System: „Read-only ab `<Datum/Uhrzeit>`, neue Quelle:
     `tococo`."
2. **Finalen Export ziehen** (`tagesabrechnung`) — Zeitraum bis
   einschließlich T0-1. `bunker` wird nicht exportiert (leer, siehe
   Befund oben).
3. **Commit** über `/admin/migration` (Quelle `tagesabrechnung`):
   - Run-ID + neue Wasserlinie notieren.
4. **Wasserlinie prüfen** (`/admin/zeit`): `time_locked_through_date` muss
   dem höchsten importierten `business_date` entsprechen.
5. **Audit-Log prüfen**: genau ein `time_entries.import`-Eintrag
   plus ggf. ein `settings.time_lock_moved`-Eintrag.

## Nachlauf (T+1 bis T+7)

1. **Erneuter Abgleichsbericht** mit den Final-Exporten — Erwartung: 0
   Differenzen. Differenzen jetzt sind ein Hinweis auf nachträgliche
   Manipulation der Alt-Systeme nach dem Einfrieren.
2. **Alt-Syncs stilllegen** (manuell):
   - Geplante Jobs/Cron in `tagesabrechnung` deaktivieren.
   - API-Webhooks Richtung Alt-System deaktivieren.
   - Vermerk im Betriebshandbuch.
3. **Re-Import-Probe**: gleiche CSV nochmal als Dry-Run laden — Zähler
   müssen `imported = 0` und `duplicate = read - andere_skips` zeigen
   (Idempotenz-Beweis).
4. **Backup**: finale CSVs verschlüsselt archivieren (nicht im Repo, nicht
   im Projekt-Storage — externes Backup-Ziel).

## Rollback-Plan

Ein Rollback ist _nicht_ automatisiert — bewusst, weil ein Teil-Rollback
nach Korrekturen im neuen System Daten beschädigen würde. Vorgehen bei
kritischem Befund:

1. Wasserlinie zurücksetzen ist **nicht** vorgesehen; stattdessen
   Korrekturen über `/admin/zeit` (mit Audit-Begründung).
2. Bei systematischem Fehler: betroffene `time_entries` mit
   `source='import'` per gezielter SQL-Migration entfernen (Audit-Eintrag
   pro Zeile), `import_runs`-Eintrag als `rollback`-Vermerk markieren,
   Cutover ab Schritt „Commit" wiederholen. Die Idempotenz über
   `import_key` macht den Re-Import sicher.

## Erfolgs-Kriterien (Abnahme)

- Bilanz-Invariante in jedem Lauf erfüllt (App-seitig erzwungen).
- Abgleichsbericht ohne unerklärte Differenzen.
- Wasserlinie passt zum höchsten importierten Geschäftstag.
- Re-Import liefert 0 neue Zeilen (Idempotenz).
- Alt-System `tagesabrechnung` nachweislich read-only.
- `bunker` bleibt unverändert leer (kein Import nötig).
