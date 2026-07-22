## Ziel

Im Reiter „Konto" der Personalakte einen zweiten Button „Einladung per E-Mail senden" anbieten. Der Mitarbeiter bekommt eine E-Mail mit einem einmaligen Link, klickt, landet auf `/reset-password` und vergibt sein eigenes Passwort — kein Standardpasswort läuft mehr durch die UI oder mündlich zwischen Admin und Mitarbeiter. Der bestehende Standardpasswort-Weg bleibt unverändert als Fallback für Mitarbeiter ohne echte E-Mail (Pseudo-Adressen).

## Umsetzung

### 1) Neue Server-Function `inviteStaffByEmail`

Datei: `src/lib/admin/account.functions.ts` (bestehende Datei erweitern, gleiches Muster wie `createStaffAccount`).

- `admin`-only via `runGuarded`, Zod `{ staffId, email }`, Cross-Org-Check.
- Fehlerfrüh, wenn `user_links` schon existiert („Dieser Mitarbeiter hat bereits ein Konto.").
- `supabaseAdmin.auth.admin.generateLink({ type: 'invite', email, options: { redirectTo: \`${origin}/reset-password\`, data: { staff_id } } })` — legt den Auth-User an und liefert `action_link`. `origin` wird aus `getRequestHost()` + Protokoll gebaut (Fallback auf `SUPABASE_URL`-Host-Ableitung nicht nötig, weil die Fn nur aus Admin-UI aufgerufen wird).
- `link_account_to_staff`-RPC wie bei `createStaffAccount`; bei Fehler Kompensation `auth.admin.deleteUser`.
- `must_change_password`-Flag: RPC setzt es bereits auf `true`; Invite-Flow überschreibt es durch das eigene Passwort — passt.
- E-Mail-Versand: direkter HTTPS-POST an MailerSend (`https://api.mailersend.com/v1/email`) mit `MAILERSEND_API_KEY`, `MAILERSEND_FROM_EMAIL`, `MAILERSEND_FROM_NAME`. Kein neuer Secret, keine neue Infrastruktur. Kleines COCO-Branding im HTML (Text + Button-Link), Klartext-Fallback. Bei MailerSend-Fehler: Auth-User + `user_links` wieder entfernen (Saga), damit „Einladen" neu versucht werden kann.
- Audit: `staff.account_invited`, `meta: { email }`. Der `action_link` wird **nicht** ins Audit oder in Logs geschrieben (nur an MailerSend).
- Rückgabe an die UI: `{ email }` — kein Link, kein Passwort im Response.

### 2) UI im Konto-Reiter

Datei: `src/routes/_authenticated/admin/staff.$staffId.tsx`, Komponente `AccountTab`.

- Im `!hasAccount`-Formular neben dem bestehenden Submit-Button einen zweiten Button „Einladung per E-Mail senden" — beide teilen sich dasselbe E-Mail-Feld.
- Bei Erfolg: Info-Box „Einladung an <email> versendet. Der Mitarbeiter setzt sein Passwort über den Link in der E-Mail." (grün gehaltene Neutralfarbe, kein Passwort-Block).
- Fehler wie gehabt in `err`-State.
- Wenn `hasAccount` bereits `true` ist: kein Invite-Button (dann gilt „Passwort zurücksetzen").

### 3) Reset-Password-Route

`src/routes/reset-password.tsx` existiert und akzeptiert `type=recovery` bzw. den Invite-Hash — Supabase mappt den Invite-Link auf denselben `verifyOtp`-Fluss. Kein Umbau nötig, nur kurz gegenprüfen und ggf. Text ergänzen („Passwort für dein neues COCO-Konto festlegen"), falls URL-Parameter Invite von Recovery unterscheidet.

### 4) Tests (minimal, gemäß Custom-Instructions)

- Zod-Unit: `inviteStaffByEmail`-Input (E-Mail-Format, staffId UUID).
- Kein DB-Integrationstest — die Fn ist reine Orchestrierung bereits getesteter Bausteine (`generateLink`, `link_account_to_staff`-RPC, MailerSend-Aufruf). Bei Bedarf zusätzlicher Test später.

### 5) Prüfungen vor Commit

`prettier --write`, `eslint --fix`, `tsgo --noEmit`, `eslint . --max-warnings=0`, `vitest run`, `prettier --check .` — alle grün, danach commit.

## Abgrenzung

- Keine neue Tabelle, kein RLS-Umbau, keine Änderung am bestehenden Standardpasswort-Weg.
- Keine neuen Secrets — MailerSend-Setup ist bereits vorhanden.
- Keine Änderung an `resetStaffPassword` (bestehender „Passwort zurücksetzen"-Button für bereits verknüpfte Konten bleibt).

## Erfolgs-Gate

- Admin klickt „Einladung per E-Mail senden" → Mitarbeiter erhält E-Mail mit Link → Klick öffnet `/reset-password` → eigenes Passwort setzbar → danach Login mit E-Mail+Passwort erfolgreich.
- Standardpasswort-Weg funktioniert unverändert.
- Audit-Log enthält `staff.account_invited` mit E-Mail, aber ohne Link.
- CI grün.
