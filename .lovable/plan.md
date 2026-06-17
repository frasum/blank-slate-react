## Ziel

1. **Login-Umbau:** E-Mail + Passwort als primäre Anmeldung (Standardpasswort, Zwangswechsel beim Erstlogin). **Badge wird entfernt.** **PIN bleibt** (Terminal/Kasse).
2. **Rechteverwaltung:** Du als `admin` kannst pro Rolle (`manager`, `payroll`, `staff`) festlegen, welche Seiten und welche schreibenden Funktionen sie nutzen dürfen. `admin` hat immer alles.

---

## Teil A — Login

### A1. Mitarbeiter-Konten anlegen

- Neue Spalte `staff.must_change_password boolean default true`.
- Beim Anlegen (`/admin/staff/new`): Admin gibt E-Mail ein, ein **Standardpasswort wird generiert** (z. B. `coco-7F3K-2P9Q`) und einmalig im UI angezeigt + kopierbar. Server-Function legt per Auth-Admin-API den Supabase-User an, verknüpft ihn in `user_links`, setzt `must_change_password = true`, schreibt Audit-Log.
- Bestehende Mitarbeiter ohne Auth-User: Button „Login einrichten" im Mitarbeiter-Editor löst denselben Flow aus.
- Bestehende Mitarbeiter mit Auth-User: `must_change_password = false` (keine erzwungene Änderung).
- „Passwort zurücksetzen"-Button im Mitarbeiter-Editor erzeugt ein neues Standardpasswort und setzt das Flag wieder auf `true`.

### A2. Erst-Login + Passwortwechsel

- Nach `signInWithPassword` prüft die App `must_change_password`.
- Ist es `true`, wird vor jeder anderen Navigation auf `/passwort-aendern` umgeleitet — einzige erreichbare Seite (außer Logout), bis ein neues Passwort gesetzt ist.
- Nach `supabase.auth.updateUser({ password })` setzt eine Server-Function (über `requireSupabaseAuth` + `supabaseAdmin`) `must_change_password = false` und schreibt Audit.

### A3. Badge entfernen

- Tab „Badge" auf `/auth` entfällt.
- `resolveBadgeToken` + Aufrufer werden entfernt.
- Tabelle `access_tokens` bleibt **vorerst stehen** (Audit). Aufräumen ist ein separater Schritt.

### A4. PIN

- Unverändert.

---

## Teil B — Rechteverwaltung (Admin-konfigurierbar)

### B1. Datenmodell

Eine neue Tabelle definiert pro Rolle erlaubte Aktionen:

- `role_permissions(organization_id, role app_role, permission text, allowed boolean, primary key (organization_id, role, permission))`
- `permission` ist ein **fixer Schlüssel aus einer Code-Konstante** (z. B. `kasse.view`, `kasse.export`, `dienstplan.edit`, `lohnrechner.view`, `urlaub.approve`, `staff.edit`, `einstellungen.view`, …). Der Katalog steht in einer TypeScript-Datei `src/lib/auth/permissions.ts`, damit es keine Tippfehler-Permissions geben kann.
- `admin` wird in der Tabelle **nicht** geführt — der Helper liefert für `admin` immer `true`.

Helper-Funktion in Postgres (`security definer`):
- `public.has_permission(_permission text) returns boolean` — gibt `true` zurück, wenn aktuelle Rolle `admin` ist oder ein Eintrag mit `allowed=true` existiert.

### B2. Wo wird geprüft

- **Server-Functions:** Jede schreibende oder sensible Funktion ruft am Anfang `await assertPermission("kasse.export")` o. ä. (TS-Wrapper um `has_permission`-RPC). Ohne Permission → Fehler `403 Forbidden`. Das ist die **eigentliche Sicherheitsbarriere**.
- **Route-Guards:** `/_authenticated/admin/route.tsx` und Kind-Routen prüfen Permissions statt fester Rollenlisten, damit gesperrte Tabs nicht erscheinen und direkter URL-Aufruf umleitet. Das ist UX, nicht Sicherheit.
- **UI-Buttons:** „Exportieren", „Löschen", „Genehmigen" usw. werden ausgeblendet/deaktiviert, wenn die Permission fehlt.

### B3. Admin-UI

Neue Seite **`/admin/einstellungen/berechtigungen`** (nur `admin` sichtbar):

- Tabelle: Zeilen = Permissions (gruppiert nach Bereich: Personal, Kasse, Bestellung, Lohn, System), Spalten = `manager` / `payroll` / `staff`. Checkbox je Zelle.
- Speichern schreibt nach `role_permissions` und legt einen Audit-Eintrag an („admin hat permission X für rolle Y aktiviert/deaktiviert").
- Voreinstellung beim ersten Öffnen entspricht dem **heutigen Verhalten** (z. B. `manager`: alles außer `lohnrechner.*` und System; `payroll`: nur `zeit.view`; `staff`: nichts im Admin-Bereich) — damit nichts kaputtgeht.

### B4. Migration der existierenden Guards

Bestehende harte Rollen-Checks (`identity.role === "admin" || "manager"` usw.) werden Stück für Stück auf `has_permission(...)` umgestellt. Beim Bau wird genau aufgelistet, welche Routen/Functions umgestellt wurden, damit nichts unbemerkt aufgemacht oder zugemacht wird.

---

## Reihenfolge der Umsetzung

1. Migration: `staff.must_change_password`, `role_permissions`, `has_permission()`-Funktion, Default-Seed der Permissions.
2. Login: Badge-Tab entfernen, Auth-Admin-Server-Functions (User anlegen, Passwort zurücksetzen), `/passwort-aendern`-Route + Guard.
3. Berechtigungs-UI (`/admin/einstellungen/berechtigungen`) + Permission-Katalog.
4. Bestehende Guards (Routen + Server-Functions) auf `has_permission` umstellen.
5. Audit-Log-Einträge für: Konto-Anlage, Passwort-Reset, Passwort-Wechsel, Permission-Änderung.

---

## Offene Fragen vor dem Bau

1. **Wer darf neue Konten anlegen / Passwort zurücksetzen** — nur `admin`, oder auch `manager`?
2. **Mitarbeiter ohne E-Mail** (Aushilfen): nur PIN-Login am Terminal — ok, oder soll der Admin eine Pseudo-Mail vergeben dürfen?
3. **Passwort-vergessen für Mitarbeiter:** reicht „Admin setzt neues Standardpasswort", oder zusätzlich Supabase-Self-Service „Passwort vergessen" per E-Mail?
4. **Permission-Granularität:** reicht pro Seite + grobe Aktion (z. B. `kasse.view`, `kasse.edit`, `kasse.export`), oder brauchst du es feiner (z. B. einzelne Felder, einzelne Standorte)?

Sobald diese vier Punkte geklärt sind, baue ich Teil A und Teil B in der oben genannten Reihenfolge.