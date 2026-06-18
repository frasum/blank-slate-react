## Ziel

Mitarbeiterin **Viktoria Schaffer** (Rolle `payroll`) in Organisation `77838674-26c1-40dd-9b74-eb1041e79b95` anlegen — mit Login `viktoria.schaffer@etl.de`, PIN `4711`, **ohne** Location-Zuweisung (somit unsichtbar in Dienstplan und Arbeitszeit). Reine Datenoperation, kein Code-Commit.

## Code-Realität (geprüft)

- `getStaffForRoster` joint `staff_locations` → ohne Eintrag keine Roster-Zeile.
- `getTimeOverview` listet nur Mitarbeiter mit `time_entries` an der Location.
- Rollen-Resolving liest **ein** `role_assignments`-Row → ein `payroll`-Assignment reicht.
- `staff.participates_in_pool` hat DB-Default `true` → muss für Lohnbüro explizit auf `false`.

Kein Code-Filter auf Rolle `payroll` wird hinzugefügt.

## Schritte

1. **`public.staff` Insert** mit `first_name='Viktoria'`, `last_name='Schaffer'`, `display_name='Viktoria Schaffer'`, `email='viktoria.schaffer@etl.de'`, `is_active=true`, `participates_in_pool=false`. Rückgabe: `<STAFF_ID>`.
2. **`public.role_assignments` Insert**: `(<STAFF_ID>, <ORG>, 'payroll')`.
3. **Auth-Konto** via `code--exec` mit `SUPABASE_SERVICE_ROLE_KEY`:
   - `auth.admin.createUser` (E-Mail bestätigt, generiertes Passwort via projekt-eigenem `generateStandardPassword`, `app_metadata.staff_id`).
   - Insert in `public.user_links`.
   - `staff.must_change_password = true` setzen.
   - Klartext-Passwort + `AUTH_USER_ID` in Chat-Ausgabe (nicht geloggt).
4. **PIN `4711`**: bcryptjs Cost 10 Hash via `code--exec` erzeugen, dann `staff_pins` Insert.
5. **Bewusst leer**: `staff_locations`, `staff_skills`, `staff_personal_details`, `permission_overrides`.
6. **Audit-Log**: `staff.account_created` Insert (kompensiert für den am Server-Flow vorbei laufenden Auth-Schritt).

## Erfolgs-Gate

SELECT über `staff`/`role_assignments`/`user_links`/`staff_pins`/`staff_locations` erwartet genau eine Zeile: `role=payroll`, `has_login=true`, `has_pin=true`, `location_count=0`, `is_active=true`. Klartext-Passwort und „PIN 4711 gesetzt" im Chat.

## Ausführung

`supabase--insert` für Schritte 1, 2, 4, 6. `code--exec` einmalig für Auth-Konto (Schritt 3) und für bcrypt-Hash (Schritt 4 Vorbereitung). Kein File-Commit.
