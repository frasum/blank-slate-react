## AV1a Stufe 1 — Adress-Aufspaltung auf `staff_personal_details` (revidiert)

Kein neuer Tabellen-/Rollen-/RLS-Umbau. Einzige Struktur-Änderung: drei neue Spalten für die Adresse. Bestehende Redaktions-, Audit- und Guard-Muster bleiben unangetastet.

### Vorab-Aufgabe: RLS-Review (nur Report, keine Änderung)

Vor Umsetzung: bestehende Policies von `public.staff_personal_details` per `supabase--read_query` gegen `pg_policies` inspizieren. Geprüft wird:
- Ist jede Policy auf `organization_id` gescoped (kein Cross-Org-Leck)?
- Greifen die Rollen-Gates (payroll/admin über `has_permission("payroll.personal.view/edit")`)?
- Keine `USING (true)`- oder `WITH CHECK (true)`-Reste?

Ergebnis wird im Chat gemeldet, BEVOR der Bau-Commit rausgeht. Nur wenn ein echtes Loch auftaucht, wird das als **eigener, gemeldeter Punkt** aufgemacht — nicht still mit-migriert.

### Migration (`supabase--migration`)

Eine Datei, drei Spalten:

```sql
ALTER TABLE public.staff_personal_details
  ADD COLUMN street text NULL,
  ADD COLUMN postal_code text NULL,
  ADD COLUMN city text NULL;
```

- Kein `DROP`/`RENAME` auf `address`.
- Kein Backfill, kein Constraint.
- Keine Policy-Änderungen (RLS bleibt).
- Keine `permission_role_defaults`-Änderungen (payroll behält view+edit).
- Migrations-Kommentar: „AV1a Stufe 1 — Adresse strukturiert (street/postal_code/city). Freitext `address` bleibt als Migrationspuffer; RLS und Rollen (admin+payroll r/w) unverändert."

### Server (`src/lib/admin/personal-details.schema.ts` + `.functions.ts`)

- Zod-Schema erweitern:
  - `street`: `nullableText(120)`.
  - `postal_code`: leer→null nach trim, danach `.regex(/^\d{4,5}$/, "PLZ muss 4–5 Ziffern sein")`.
  - `city`: `nullableText(120)`.
- `redactForAudit`: keine Aufnahme in `SENSITIVE_FIELDS` — die drei Felder werden als `{ changed: true }` diffbar, konsistent mit dem bestehenden Adress-Feld.
- `getStaffPersonalDetails`: SELECT-Liste, `EMPTY`-Defaults und `PersonalDetailsFields`/`PersonalDetailsDto` um die drei Spalten erweitern. Rollen/Guards unverändert (admin+payroll).
- `upsertStaffPersonalDetails`: unverändert im Rollen-Gate — Schema-Erweiterung reicht, Upsert schreibt die neuen Spalten mit.

### UI (`src/components/admin/PersonalDetailsTab.tsx`)

- Adress-Zeile ersetzen: drei Eingabefelder `Straße`, `PLZ`, `Ort` (die letzten beiden in einer Zeile), Bearbeiten für admin+payroll wie bisher.
- Freitext-`address` bleibt sichtbar, aber:
  - Wird nur noch gerendert, **solange `address` befüllt UND alle drei neuen Felder leer sind**.
  - Als **read-only/ausgegraut** mit Hinweis „Alt-Adresse (Migrationspuffer) — bitte in Straße/PLZ/Ort übernehmen".
  - Sobald mindestens eines der drei neuen Felder gefüllt und gespeichert ist, verschwindet die Alt-Zeile aus der Anzeige (Feld bleibt DB-seitig erhalten).
- Keine Änderung an `src/routes/_authenticated/profil.tsx` (Self-Service-Adresse bleibt Bestand — konsistent mit Migrationspuffer-Regel).

### Tests

1. **Zod-Unit** (`personal-details.schema.test.ts`):
   - PLZ: `"12345"` ok, `"1234"` ok, `"123"` wirft, `"abc"` wirft, `""` und `" "` → null, Leerzeichen-Trim.
   - `street`, `city`: Trim, leer→null, max-Länge.
2. **Bestands-Regressionstest** (neuer Case in derselben Datei): ein `personalDetailsSchema.parse({...})` mit einem repräsentativen Auszug aller heute vorhandenen 44+ Felder (aus `EMPTY` in `personal-details.functions.ts` abgeleitet) muss ohne Datenverlust durchlaufen — Snapshot-Vergleich der Ausgabe-Keys stellt sicher, dass keine Bestandsspalte durch die Erweiterung verloren geht.
3. Kein neuer DB-Integrationstest (keine RLS-/Rollen-Änderung → kein DENY-Beweis in dieser Stufe).

### Vor dem Commit

`npx prettier --write` + `npx eslint --fix` über geänderte Dateien. Danach müssen `npx tsc --noEmit` (0), `npx eslint . --max-warnings=0`, `npx vitest run` (grün) und `npx prettier --check .` durchlaufen. Der RLS-Review-Befund wird im Chat gemeldet, BEVOR committet wird.

### Erfolgs-Gate

- Drei neue Spalten migriert, RLS/Rollen unverändert.
- Admin+payroll können Straße/PLZ/Ort pflegen; Alt-`address` bleibt lesbar/ausgegraut bis überführt.
- Zod- und Bestands-Regressionstests grün; CI `check` grün.
- RLS-Review-Befund im Chat vorhanden.

### Ausdrücklich NICHT in dieser Stufe

- Keine neue Tabelle `staff_personal_data`.
- Kein Rollen-Entzug für payroll.
- Kein DENY-ALL-Umbau, keine Policy-Änderung an `staff_personal_details` (außer als separat gemeldeter Punkt, falls das Review ein echtes Loch findet).
- Kein Backfill/Löschen von `address`.
- Keine Änderung an CSV-Import, Dokumenten-Generierung, Sofortmeldung, Lohn.
