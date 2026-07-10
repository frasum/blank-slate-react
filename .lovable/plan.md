# BK2 — Direkte Bank-Anbindung Spicery via GoCardless BAD (PSD2)

Ziel: Umsätze der Deutschen Bank (Spicery) werden per PSD2 automatisch abgerufen und wie ein CSV-Import in `bank_transactions` geschrieben. CSV bleibt als Fallback/Historie. Konto-Zuordnung passiert IMMER über die IBAN — nie über ein Dropdown.

## Anbieter

**GoCardless Bank Account Data** (früher Nordigen). Kostenlos für EU-Konten, Deutsche Bank unterstützt, 90-Tage-Consent. Zwei Credentials: `Secret ID` + `Secret Key` aus bankaccountdata.gocardless.com.

## Voraussetzungen beim Nutzer

Frank legt Account bei GoCardless BAD an, erzeugt ein Secret-Paar und trägt die zwei Werte selbst in Lovables Secrets-UI ein — `GOCARDLESS_BAD_SECRET_ID` und `GOCARDLESS_BAD_SECRET_KEY`. Kein Wert erscheint in Prompt, Chat, Commit oder Migration.

## Datenfluss

```text
Admin klickt "Bank verbinden"
  → Server-Fn startBankConnect() → Redirect zur DB, Consent
  → Rückkehr /admin/bankkonto?bk2=callback&ref=<requisition-id>
  → Server-Fn finalizeBankConnect(): holt IBAN je Account,
    matcht STRIKT gegen bank_accounts.iban (kein Dropdown),
    setzt gocardless_account_id nur bei exaktem IBAN-Match
Admin klickt "Umsätze abrufen" (oder Cron 06:00)
  → Server-Fn syncBankTransactions()
      - date_from bestimmen (siehe Regel unten)
      - GET /accounts/{id}/transactions?date_from=…
      - NUR booked-Transaktionen mappen, pending überspringen
      - Zeilen ohne external_tx_id überspringen (skipped++)
      - Upsert (account_id, external_tx_id)
```

## Die acht Anpassungen

### 1. `laufende_nummer` wird nullable

Nachlaufende Buchungen der API bekommen keine Bank-lfd.-Nr. Migration setzt die Spalte auf `NULL`-fähig; die „max+1 pro Sync"-Zähler-Alternative wird ersatzlos gestrichen (nachlaufende Buchungen würden die Nummern verschieben). UI-Sortierung wechselt auf `buchungstag DESC, id DESC` — nie mehr auf `laufende_nummer`.

### 2. Nur `booked`-Transaktionen importieren

`mapGcTransactionToRow` verarbeitet ausschließlich Einträge aus `transactions.booked`. `pending` wird verworfen (instabile IDs → Dubletten, sobald sie fest werden). Testfall: Fixture mit gemischtem booked/pending → nur booked landet in der Ausgabe.

### 3. Public-Sync-Route mit `CRON_SECRET`, nicht Anon-Key

`src/routes/api/public/bank/sync-spicery.ts` prüft `x-cron-secret`-Header gegen `process.env.CRON_SECRET` (timing-safe). Muster analog `telegram/daily-report.ts`. pg_cron-Aufruf setzt genau diesen Header.

### 4. Token-Cache ohne Timer

`getAccessToken()` hält Token + Expiry-Zeitstempel in einer Modulvariablen. Beim Zugriff lazy prüfen: `if (Date.now() > expiresAt - 60_000) refresh()`. Kein `setTimeout` — Cloudflare Workers sind zustandslos, Timer sind dort nicht verlässlich.

### 5. Secrets-Disziplin

Der Bau-Schritt fordert keine Werte an und ruft weder `add_secret` noch `set_secret`. Nur ein Hinweis-Block in der Doku: Frank legt `GOCARDLESS_BAD_SECRET_ID` und `_KEY` selbst in der Lovable-Secrets-UI an.

### 6. `date_from`-Naht-Formel

- Normalfall: `date_from = max(buchungstag) der Zeilen des Accounts mit external_tx_id IS NOT NULL − 7 Tage`.
- Allererster API-Sync (noch keine Zeile mit `external_tx_id`): `date_from = max(buchungstag) aller Zeilen + 1 Tag` — damit der erste Abruf nie in den CSV-Bestand hineingreift, gegen den er nicht deduplizieren kann.
- Leeres Konto: `date_from = today − 90 Tage`.

Reine Funktion `computeDateFrom(state)`, drei Tests (API-Zeilen vorhanden / nur CSV-Historie / leer).

### 7. Cross-Account-Duplikatswarnung im CSV-Import

Beim CSV-Import (Review-Screen) läuft — bevor der Server-Import-Call kommt — ein Content-Fingerprint gegen andere Konten der Organisation:

- Fingerprint: `buchungstag | betragCents | normalize(gegenpartei)`. **Ohne** Verwendungszweck.
- Neue Server-Fn `findCrossAccountDuplicates({ candidateAccountIban, fingerprints, dateFrom, dateTo })` liest im überlappenden Zeitraum alle Buchungen anderer Konten der Org und liefert Treffer zurück.
- Review-Screen zeigt roten Warnblock: „N Buchungen liegen inhaltsgleich bereits im Konto XY (IBAN …). Wahrscheinlich falsche Konto-Zuordnung."
- Import-Button bei ≥ 1 Treffer per Default deaktiviert; nur eine explizite Checkbox „Ich habe geprüft, es sind unterschiedliche Buchungen" gibt ihn frei.
- Testfall: Fixture mit 3 Zeilen, davon 2 als Treffer in einem anderen Konto → Warnblock, Button gesperrt.

### 8. Konto-Zuordnung strikt per IBAN

Kein Konto-Dropdown im Import-Flow — nirgends. Der Import liest die IBAN aus der CSV (BK1b-Muster, `extractSingleIban`), sucht `bank_accounts` per exaktem IBAN-Match und importiert nur dann. Kein Match → klarer Fehler „Für IBAN X ist kein Konto angelegt" mit Anlege-Aktion (auch wieder IBAN-gebunden). Analog auf der API-Seite: `finalizeBankConnect` verknüpft `gocardless_account_id` ausschließlich bei exaktem IBAN-Match. Mehrdeutigkeit → Fehler, keine Heuristik.

## Migration

- `bank_accounts`: Spalten `gocardless_institution_id text`, `gocardless_account_id text UNIQUE`, `gocardless_requisition_id text`, `gocardless_agreement_expires_at timestamptz`.
- `bank_transactions`: `external_tx_id text` (nullable), partieller Unique-Index `(account_id, external_tx_id) WHERE external_tx_id IS NOT NULL`, `laufende_nummer` → nullable (Punkt 1).
- Bestehende RLS/GRANTs unverändert.

## Server-Code (neu)

- `src/lib/bank/gocardless.server.ts` — `getAccessToken` (Modulvariablen-Cache, Punkt 4), `listInstitutions`, `createAgreement`, `createRequisition`, `getRequisition`, `getAccountDetails`, `getAccountTransactions`. Fehler-Mapping 401/429.
- `src/lib/bank/gocardless-map.ts` (rein, getestet) — `mapGcTransactionToRow(gcTx)`:
  - nur booked (Punkt 2), EUR-Filter,
  - Betrag `round(amount*100)`,
  - Gegenpartei `creditorName || debtorName || remittanceUnstructuredArray[0]`,
  - Zweck `remittanceInformationUnstructured` bzw. joined Array,
  - `external_tx_id = transactionId ?? internalTransactionId`,
  - **Fehlen beide IDs → Zeile überspringen, `skipped++`. Niemals mit `external_tx_id = NULL` importieren** — sonst greift der partielle Unique-Index nicht und Dubletten kehren zurück. Eigener Testfall dafür.
- `src/lib/bank/date-from.ts` (rein, getestet) — `computeDateFrom(state)` (Punkt 6).
- `src/lib/bank/cross-account-duplicates.ts` (rein, getestet) — Fingerprint + Matcher (Punkt 7).
- `src/lib/bank/bank.functions.ts` neue Fns (admin-only, `loadAdminCaller`, `makeAuditWriter`):
  - `startBankConnect({ institutionId? })` → `{ redirectUrl, requisitionId }`
  - `finalizeBankConnect({ requisitionId })` → strikte IBAN-Verknüpfung (Punkt 8)
  - `syncBankTransactions({ accountId })` → `{ inserted, skipped, dateFromUsed }`
  - `findCrossAccountDuplicates(...)` (Punkt 7)
  - Audit: `bank.connect.start`, `bank.connect.finalize`, `bank.sync`, `bank.import.cross_account_warn`.

## UI

`src/routes/_authenticated/admin/bankkonto.tsx`:
- Neuer Karten-Block „Bank-Verbindung" oben — nicht verbunden: Button „Deutsche Bank verbinden"; verbunden: Status-Chip (Agreement-Ablauf, Warnung < 14 Tage), Button „Jetzt Umsätze abrufen", letzter Sync.
- Callback-Handling `?bk2=callback&ref=…` → `finalizeBankConnect`, Toast.
- CSV-Import umlabeln zu „CSV-Import (Fallback / Altbestände)". Review-Screen zeigt Warnblock aus Punkt 7 und respektiert die Checkbox-Freischaltung. **Kein Konto-Dropdown**.
- Buchungsliste sortiert nach `buchungstag DESC` (Punkt 1).

## Automatischer Sync

Ziel-URL ist die Custom-Domain — die `project--<id>.lovable.app`-Domain leitet pfadverlierend um (TRMNL-Lektion vom 08.07.).

pg_cron täglich 06:00 → `POST https://cocoplatform.online/api/public/bank/sync-spicery` mit Header `x-cron-secret: <CRON_SECRET>`. Route iteriert alle Accounts mit gesetzter `gocardless_account_id`.

**Anlage der pg_cron-Zeile:** Lovable liefert das `cron.schedule`-Statement als Vorab-SQL-Skizze mit `<CRON_SECRET>`-Platzhalter in der Prompt-Antwort. Frank ersetzt den Platzhalter durch den echten Wert und führt das SQL selbst im Supabase-Editor aus. Lovable ruft weder `supabase--insert` noch `supabase--migration` für diese Zeile auf — Datenhoheits-Regel + der Secret-Wert darf nirgends durch Lovables Werkzeuge fließen.

Skizze (in der Prompt-Antwort mitliefern):

```sql
select cron.schedule(
  'bk2-sync-spicery-daily',
  '0 6 * * *',
  $$
  select net.http_post(
    url:='https://cocoplatform.online/api/public/bank/sync-spicery',
    headers:='{"Content-Type":"application/json","x-cron-secret":"<CRON_SECRET>"}'::jsonb,
    body:='{}'::jsonb
  ) as request_id;
  $$
);
```

## Tests

- `gocardless-map.test.ts` — Vorzeichen, EUR-Filter, Fallback-Gegenpartei, unstructuredArray, **booked-only-Filter**, **Skip-ohne-external_tx_id**.
- `date-from.test.ts` — die drei Fälle aus Punkt 6.
- `cross-account-duplicates.test.ts` — Treffer/Nicht-Treffer, Normalisierung Gegenpartei.
- Keine Live-API-Tests in CI.

## Doku-Nachzug §83

`docs/arbeitsweise.md` bekommt exakt diesen Block (Frank-Text 1:1):

```md
## §83 — Bank-Bestand bereinigt (Fehl-Import YUM→Spicery), BK2 vorbereitet (10.07.)

**Was passiert war.** Der Dubletten-Check zur BK2-Vorbereitung zeigte 19 doppelte Buchungsgruppen am 29./30.06. Vier Theorien nacheinander (Export-Überlappung → Parser-Differenz vor/nach BK1b → Konto-Dublette → Fehl-Import), drei davon durch Lese-Selects widerlegt. Tatsächliche Ursache: Um 16:40 war die **komplette YUM-CSV (1101 Zeilen, Jan–Jun) versehentlich ins Spicery-Konto** importiert worden (Dropdown-Auswahl, keine IBAN-Prüfung) — 24 sichtbare Dubletten an zwei Tagen verdeckten 1099 Fremdzeilen über sechs Monate. Überführt per Arithmetik: 1912 = 813 (Spicery echt) + 1101 − 2. Bereinigung: kompletter 16:40-Lauf gelöscht. Kollateralschaden: Ein DELETE aus der zuvor gestoppten YUM-Hypothese war mitgelaufen und hatte 24 echte YUM-Zeilen (29./30.06.) entfernt — geheilt durch idempotenten Re-Import derselben Datei ins richtige Konto. Endstand verifiziert: Spicery 813, YUM 1101, Cross-Konto-Check zeigt nur noch legitime gemeinsame Lieferanten (Focus, Knebl, Bleyle …).

**Regel A — Lösch-Hypothesen erst per Lese-Select beweisen.** Hat zweimal vor dem Löschen legitimer Daten gerettet (YUM-15:52-Lauf war der Voll-Import, nicht das vermutete Delta). Kein DELETE ohne vorherigen SELECT mit identischem WHERE, dessen Ergebnis Frank freigibt.

**Regel B — Destruktives SQL nie in derselben Lieferung wie seine Vorbedingung.** Das mitgelaufene DELETE stand im selben Block wie sein Kontroll-SELECT; Mehrfach-Statements laufen praktisch am Stück. Getrennte Lieferungen mit Zwischenprüfung. (Regel stammt aus einem Fehler des Prüfers, nicht des Baumeisters.)

**Konsequenz für BK2:** Punkt 7 (Cross-Account-Duplikatswarnung, Fingerprint ohne Zweck-Text) und Punkt 8 (IBAN-Zwang statt Dropdown) sind direkt aus diesem Vorfall geboren.
```

Statuszeile am Doku-Kopf auf „§83" aktualisieren.

## Erfolgs-Gate

- tsc / vitest / eslint / Prettier grün.
- Neue Tests: `gocardless-map` (inkl. booked-only + Skip-ohne-ID), `date-from`, `cross-account-duplicates`.
- Manuelle Abnahme: Bank verbinden → IBAN-Match → erster Sync bringt neue Zeilen ohne Überlappung mit CSV-Bestand.
- CSV-Import einer Spicery-Datei ins YUM-Konto ist praktisch unmöglich (Punkt 8) und würde zusätzlich Cross-Account-Warnung auslösen (Punkt 7).

## Reihenfolge im Bau-Modus

1. Doku §83 in `docs/arbeitsweise.md`.
2. Migration (Spalten + partieller Unique-Index + `laufende_nummer` nullable).
3. `gocardless.server.ts`, `gocardless-map.ts` (inkl. Skip-Regel), `date-from.ts`, `cross-account-duplicates.ts` + Tests.
4. Neue Server-Fns in `bank.functions.ts` (inkl. `findCrossAccountDuplicates`, strikter IBAN-Match in `finalizeBankConnect`).
5. UI: Verbindungs-Karte, Callback-Handling, Import-Review mit Warnblock, kein Konto-Dropdown, Liste nach buchungstag.
6. Public-Route `/api/public/bank/sync-spicery` mit `x-cron-secret`-Prüfung. **Kein** `supabase--insert` für pg_cron — stattdessen die oben abgedruckte `cron.schedule`-Skizze mit `<CRON_SECRET>`-Platzhalter in der Prompt-Antwort ausgeben, Ausführung liegt bei Frank.
7. Hinweis an Frank: `GOCARDLESS_BAD_SECRET_ID` + `_KEY` selbst in Lovable-Secrets-UI eintragen.
