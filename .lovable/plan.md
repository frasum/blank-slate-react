## Ziel
Im Mitarbeiterprofil (`/admin/staff/:staffId`) einen neuen Tab **„Personaldaten"** ergänzen, der alle Felder aus `staff_personal_details` anzeigt. Rolle **admin** darf bearbeiten, Rolle **payroll** nur lesen. Sensible Felder (IBAN, Steuer-ID, SV-Nummer) sind standardmäßig maskiert und werden weder in Audit-Diffs noch in Logs im Klartext gespeichert.

## 1. Migration — RLS verschärfen und Schreibrechte ergänzen

Heute hat `staff_personal_details` nur eine SELECT-Policy für `has_min_permission('manager')` — die deckt manager+admin, schließt aber payroll aus und erlaubt manager zu viel.

- `DROP POLICY details_select_manager` → ersetzen durch `details_select_admin_payroll`: SELECT für authenticated, USING `(public.has_role('admin') OR public.has_role('payroll')) AND organization_id = current_organization_id()`.
- Neue Policies `details_insert_admin`, `details_update_admin`, `details_delete_admin` (jeweils `has_role('admin')` + Org-Match, mit `WITH CHECK` wo nötig).
- `GRANT INSERT, UPDATE, DELETE ON public.staff_personal_details TO authenticated;` (SELECT/GRANT bereits vorhanden).
- Keine Änderungen an Trigger `tg_staff_personal_details_set_updated_at`.

Audit-Eintrag bei Schreibvorgängen erfolgt in der Server-Funktion (siehe 2.), nicht via Trigger — so können sensible Felder maskiert protokolliert werden.

## 2. Server-Funktionen — `src/lib/admin/personal-details.functions.ts`

Beide mit `requireSupabaseAuth`:

- `getStaffPersonalDetails({ staffId })` — liest die Zeile (RLS gilt). Gibt komplettes DTO zurück (sensible Felder ungemaskt — Maskierung passiert im UI). 404 wenn keine Zeile vorhanden ist (kein Throw, sondern `{ exists: false }`).
- `upsertStaffPersonalDetails({ staffId, fields })` — Admin-only. Schritte:
  1. `context.supabase.rpc('has_role', { _role: 'admin' })` prüfen, sonst Forbidden.
  2. Zod-Validierung aller Felder (Längen-Limits, IBAN-Regex grob, Datum ISO, Booleans). Felder, die unverändert bleiben sollen, werden im Patch weggelassen.
  3. UPSERT auf `(staff_id)`-Konflikt. `organization_id` aus `current_organization_id()` via Server-Side-Subquery oder per Insert mit `organization_id = (select organization_id from staff where id = staffId)`.
  4. Audit-Eintrag in `audit_log` schreiben: nur Feldnamen + `[REDACTED]`-Marker für `SENSITIVE_FIELDS` (`iban`, `tax_id`, `social_security_number`) — sonst Vorher/Nachher in Kurzform.

Wiederverwendung: `SENSITIVE_FIELDS` aus `src/lib/admin/import-details.ts` exportieren und hier importieren — keine zweite Liste.

## 3. UI — neuer Tab in `src/routes/_authenticated/admin/staff.$staffId.tsx`

- `Tab`-Union um `"personal"` erweitern, Tab-Beschriftung „Personaldaten". Tab nur rendern, wenn `identity.role === "admin" || identity.role === "payroll"` (Tab-Sichtbarkeit; RLS bleibt die echte Schranke).
- Neue Komponente `PersonalDetailsTab` in eigenem File `src/components/admin/PersonalDetailsTab.tsx` (Profil-Datei ist bereits ~630 Zeilen — nicht weiter aufblähen).
- Layout: vier Sektionen als `<fieldset>`-Blöcke
  1. **Person & Kontakt** — Anrede, Geburtsdatum/-ort, Nationalität, Telefon, E-Mail, Adresse
  2. **Steuer & SV** — Steuerklasse, **Steuer-ID** (sensibel), **SV-Nummer** (sensibel), Minijob, SV-frei, Krankenkasse, Kirchensteuer, Kinderfreibeträge
  3. **Bank** — **IBAN** (sensibel), Bankname, Kontoinhaber
  4. **Beschäftigung & Urlaub** — Eintritt, Austritt, Personalgruppe, Berufsbezeichnung, Urlaubstage (vertraglich, Vorjahr, lfd. Jahr, genommen)
- Sensible Felder: maskiert anzeigen (`••••1234` für IBAN, `••••` sonst), Button „Einblenden" pro Feld (nur clientseitig, kein Re-Fetch). Im Edit-Modus echtes Input-Feld.
- Modus-Schalter: payroll → komplette Read-only-Ansicht ohne „Bearbeiten"-Button. Admin → „Bearbeiten" toggelt Formular; „Speichern" ruft `upsertStaffPersonalDetails` via `useServerFn`/`useMutation`, invalidiert `["admin","staff",staffId,"personal-details"]`. „Abbrechen" verwirft lokale Änderungen.
- Validierung clientseitig mit derselben Zod-Schema-Datei wie der Server (geteilt unter `src/lib/admin/personal-details.schema.ts`).

## 4. Route-Gate

`src/routes/_authenticated/admin/route.tsx` blockt payroll heute auf alles außer `/admin/zeit-uebersicht`. **Nicht in diesem Schritt ändern** — payroll bleibt für jetzt von `/admin/staff/:id` ausgesperrt. Folgeticket: payroll-Lesezugang zum Mitarbeiterprofil (nur Tab „Personaldaten" sichtbar) als eigener Bauplan-Schritt — sonst müssten wir die Sichtbarkeit aller anderen Tabs neu durchdenken.

## 5. Tests & Gate

- Reine Funktion `redactForAudit(fields)` in `personal-details.server.ts` (oder geteilt) + Vitest-Test: sensible Felder werden zu `[REDACTED]`, andere passieren durch.
- Zod-Schema-Test: gültige/ungültige Eingaben.
- `npx eslint . --max-warnings=5` → 0 Errors, `tsc --noEmit` → 0, `vitest run` grün.

## Aus dem Scope ausgeschlossen
- Payroll-Zugang zur Mitarbeiterdetail-Seite (eigener Schritt).
- Bulk-Edit, CSV-Export, Diff-Historie der Personaldaten-Änderungen (nur Audit-Einträge).
- Validierung von IBAN mit Prüfziffer (nur Längen-/Format-Check).
- Brutto/Netto-Berechnungen (separater Bauplan-Schritt M-Lohn).
