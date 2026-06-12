# B2c — Migration & Parallelbetrieb (Scope-Vorschlag)

Letzter M1-Schritt. Alt-Daten aus zwei `zt_shifts`-Quellen (tagesabrechnung, bunker) in `time_entries` übernehmen, identitäts-gemappt, idempotent, mit Abgleichsbericht. Gebaut wird nach Freigabe.

## 1. DB-Vorarbeiten (eine Migration)

- **`source`-Constraint erweitern**: `{clock, manual}` → `{clock, manual, import}`. Bestehende Daten unverändert.
- **`import_runs`** (neu): `id`, `organization_id`, `source_system` (`'tagesabrechnung' | 'bunker'`), `file_hash` (sha256), `started_at`, `finished_at`, `mode` (`'dry_run' | 'commit'`), `counters jsonb` (gelesen/importiert/skipped_by_reason), `created_by`. RLS: nur Admin SELECT; INSERT/UPDATE nur Service-Role.
- **`staff_identity_map`** (neu): `id`, `organization_id`, `source_system`, `alt_id` (text), `alt_name` (text), `staff_id` (nullable FK), `confirmed_at`, `confirmed_by`. Unique `(organization_id, source_system, alt_id)`. RLS: Admin SELECT/UPDATE; INSERT/DELETE Service-Role.
- **`time_entries.import_key`** (neu, nullable, unique partial): `source_system || ':' || alt_shift_id` — Idempotenz-Schlüssel. Unique-Index `WHERE source = 'import'`.
- GRANTs nach Standard-Muster, RLS-Inventur grün.

## 2. Importer-Module (rein, getestet)

```
src/lib/migration/
├── parse-tagesabrechnung.ts   # CSV → normalisierte Alt-Zeile
├── parse-bunker.ts            # CSV → normalisierte Alt-Zeile
├── normalize.ts               # gemeinsames Schema: { altSystem, altId, altEmployee, shiftDate, startedAt, endedAt, breakMinutes, skipReason? }
├── aggregate-by-business-date.ts  # pures Modul + Tests (Regel: jeder Eintrag einzeln, Summen = Σ Topf-Werte)
└── reconcile.ts               # Alt-Topf vs. neu gerechneter Topf (tagesabrechnung-Adapter)
```

**Normalisierungs-Regeln (extern verifiziert, nicht erweitern):**
- `started_at`/`ended_at` = `shift_date + Uhrzeit`, bei `end ≤ start` → `+1 Tag` (Übernacht).
- `business_date` = `shift_date` **direkt übernehmen**, nicht aus Zeiten herleiten.
- `break_minutes`: bunker übernehmen; tagesabrechnung → `0` (Feld existiert dort nicht).
- **Skip-Gründe** (im Report gezählt, einzeln gelistet): `absence` (Zeile ohne start/end oder mit `absence_type`), `unmapped_staff` (kein bestätigtes Identitäts-Mapping), `invalid_time` (Parsing-Fehler), `duplicate` (idempotent — bereits importiert).
- **Nicht importiert**: `department`/`area`/`skill`, SFN-Topfwerte aus Alt-Daten (nur für Abgleich gelesen, nicht persistiert).

## 3. Server-Funktionen (`src/lib/migration/migration.functions.ts`)

Alle `requireSupabaseAuth` + Admin-Rollencheck via `has_role`. `supabaseAdmin` nur innerhalb des Handlers.

- `parseImportCsv({ sourceSystem, csvText })` — gibt Vorschau (Top-50) + Zähler zurück, kein Schreibvorgang.
- `proposeIdentityMappings({ sourceSystem, csvText })` — extrahiert distinkte `(alt_id, alt_name)`, schlägt `staff_id` per Namens-Match vor (Levenshtein auf normalisierten Namen, Schwelle dokumentiert), schreibt unbestätigte Vorschläge in `staff_identity_map` (confirmed_at = NULL).
- `confirmMapping({ id, staffId | null })` — setzt `confirmed_at/by`; `null` bedeutet „bewusst überspringen".
- `runImport({ sourceSystem, csvText, mode })` — `mode='dry_run' | 'commit'`. Liest, normalisiert, prüft Mapping, prüft Idempotenz (`import_key`), schreibt im Commit-Modus, erzeugt **einen** `audit_log`-Eintrag (`action: 'time_entries.import'`, `meta: { counters, fileHash, runId }`). Im Commit-Modus nach erfolgreichem Lauf: `time_locked_through_date = max(business_date)` über `setTimeLock` (eigener Audit-Eintrag).
- `getReconciliationReport({ from, to, groupBy: 'week' | 'cycle' })` — pro Mitarbeiter + Bucket: `total_hours` und SFN-Töpfe, einmal aus Alt-Topf-Spalten (separat in `import_runs.meta` bzw. temp-Spalte gehalten — Detail in Implementierung), einmal neu via `tagesabrechnung`-Adapter. Listet Differenzen einzeln.

Abrechnungszyklus = **26.–25.** (entspricht Gründungsdokument).

## 4. UI (`/admin/migration`, Admin-only)

Minimal, kein Schnickschnack:
1. **Upload + Dry-Run**: Datei wählen, Quellsystem wählen, „Dry-Run". Tabelle mit Zählern + Skip-Gründen + Top-50-Vorschau.
2. **Mapping-Tabelle**: alt_id/alt_name → Staff-Auswahl (Combobox), „Bestätigen" / „Überspringen". Unbestätigte Zeilen blockieren Commit.
3. **Commit**: zeigt nochmal Zähler, danach Bestätigung → Audit-Eintrag-ID + neue Wasserlinie.
4. **Abgleichsbericht**: Zeitraum + Gruppierung, Tabelle mit Differenzen rot markiert.

## 5. Erfolgs-Gate

- `tsc` / `eslint` / `vitest` grün.
- Neue Unit-Tests:
  - `aggregate-by-business-date.test.ts` — Regel jeder-Eintrag-einzeln.
  - `normalize.test.ts` — Übernacht-Schicht, fehlende Endzeit, absence-Skip, ungültige Zeit.
  - `reconcile.test.ts` — identische Töpfe ⇒ 0 Differenzen.
- Neue DB-Tests:
  - **Idempotenz**: zweimal `runImport(commit)` mit gleicher Datei ⇒ identische Zähler, kein Duplikat (unique `import_key`).
  - **`source='import'`-Constraint**: INSERT mit `source='import'` zulässig, mit `source='foo'` schlägt fehl.
  - **Wasserlinie**: nach Commit ist `time_locked_through_date = max(business_date)`.
  - **RLS-Härtung**: authentifizierter Manager-Client kann `import_runs`/`staff_identity_map` weder INSERTen noch UPDATEn.
- `scripts/check-rls-inventory.sql` unverändert grün.
- **Manuelle Abnahme**: echter Import beider Quellen + Abgleichsbericht ohne unerklärte Differenzen.

## 6. Explizit NICHT in B2c

- Abwesenheiten-Modul (vertagt, separater Bauplan).
- SFN-Persistenz-Entscheidung (bleibt M4).
- UI jenseits Mapping + Report.
- Stilllegen der Alt-Syncs (du machst manuell; ich liefere `docs/migration-cutover-checklist.md`).

## 7. Reihenfolge der Commits

1. DB-Migration (`source='import'`, `import_runs`, `staff_identity_map`, `time_entries.import_key`).
2. Reine Module + Unit-Tests (parse, normalize, aggregate, reconcile).
3. Server-Funktionen + DB-Tests.
4. `/admin/migration`-UI.
5. Cutover-Checkliste-Dokument.

## 8. Offene Frage vor Bau

CSV-Spaltennamen: Sind die Header in deinen Exporten **exakt** wie im Mapping (`employee_id`, `staff_id`, `shift_date`, `start_time`, `end_time`, `clocked_in_at`, `clocked_out_at`, `break_minutes`, `department`, `area`, `skill`, `absence_type`, plus SFN-Töpfe `evening`, `night`, `night_deep`, `sunday_holiday`)? Falls eine Quelle abweichende Header hat, brauche ich vor Bau die wahren Spaltennamen — sonst rate ich.

Freigabe?
