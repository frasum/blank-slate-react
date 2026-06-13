# B3 — Kasse / Tagesabschluss (Bauplan)

Grundlage: M2-Steckbrief vom 13.06.2026. Entscheidungen bestätigt:
Terminals als konfigurierbare Liste, eigene `cash_locked_through_date`,
Gutscheine 1:1 (drei Zahlen pro Session). Zweistufiger Flow mit
Auto-Ausstempeln über bestehenden `clockOut`-Pfad.

Gebaut wird in drei Commits (B3a → B3b → B3c), jeweils mit eigenem
Erfolgs-Gate. Kein Commit beginnt, bevor der vorherige extern geprüft ist.

---

## B3a — Schema + reines Rechenmodul

### DB-Migration (eine Datei)

Tabellen, alle mit `organization_id`, RLS ab Erstellung, GRANTs nach Standard.

- **`revenue_channels`** — Stammdaten je Org. Felder: `label`, `sort_order`,
  `is_active`. Unique `(organization_id, label)`. Manager/Admin schreibend,
  alle Rollen lesend (RLS).
- **`payment_terminals`** — analog `revenue_channels`. Ersetzt die festen
  `terminal_1/2`-Spalten des Altsystems.
- **`sessions`** — eine Zeile pro Geschäftstag und Org. Felder:
  `business_date` (aus `current_business_date()`, NICHT `now()::date`),
  `notes`, `status` (`open | finalized | locked`), `finalized_at/by`,
  `locked_at/by`, `opening_balance_cents` (nur erste Session der Org,
  sonst NULL → Carry-over greift), `vouchers_sold_cents`,
  `vouchers_redeemed_cents`, `finedine_vouchers_cents`,
  `opentabs_deduction_cents`, `vorschuss_cents`, `einladung_cents`,
  `sonstige_einnahme_cents`. Unique `(organization_id, business_date)`.
  **Alle Geldfelder als `BIGINT` in Cents** (Vermeidung NUMERIC-Rundungs-
  Drift, Golden-Master verlangt Cent-Genauigkeit).
- **`session_channel_amounts`** — `(session_id, channel_id, amount_cents)`,
  Unique `(session_id, channel_id)`.
- **`session_terminal_amounts`** — analog.
- **`waiter_settlements`** — append-only Snapshot je Kellner/Session.
  Felder: `session_id`, `staff_id` (FK, NOT NULL — D-M2-1),
  `pos_sales_cents`, `card_total_cents`, `hilf_mahl_cents`,
  `open_invoices_cents`, `cash_handed_in_cents`,
  `differenz_cents` (berechnet, persistiert),
  `kitchen_tip_cents` (berechnet, persistiert),
  `kitchen_tip_rate` (Snapshot der Org-Einstellung zum Zeitpunkt der Abgabe),
  `status` (`draft | submitted | corrected | superseded | locked`),
  `submitted_at`, `corrected_from_id` (FK self, NULL bei Original),
  `auto_clockout_time_entry_id` (NULL wenn kein offener Eintrag bestand).
  Korrektur durch Manager → neue Zeile mit `corrected_from_id`, Original
  bekommt `status='superseded'`. **Niemals UPDATE auf finanzielle Felder**
  einer Originalzeile.
- **`session_expenses`**, **`session_advances`** (FK auf `staff` für M4),
  **`session_card_transactions`**, **`session_bank_deposits`**,
  **`session_register_transfers`** (mit `direction` enum `to_restaurant |
from_restaurant`). Jeweils `(session_id, ...)`, Beträge in Cents.
- **`organization_settings`** erweitern: `kitchen_tip_rate NUMERIC(5,4)
NOT NULL DEFAULT 0.0200`, `cash_locked_through_date DATE NULL`.

### RLS-Regeln (Kurzfassung, Details in Migration)

- `sessions`, Satelliten, `session_*_amounts`: SELECT für alle Rollen der Org,
  Client-Write **DENY-ALL** (`USING (false)`) — Schreibzugriff ausschließlich
  über Server-Functions mit `supabaseAdmin`.
- `waiter_settlements`:
  - Kellner SELECT: nur eigene Zeilen.
  - Kellner INSERT/UPDATE: nur eigene Zeile, nur wenn
    `business_date = current_business_date()` UND `status = 'draft'`.
  - Manager SELECT: alle Zeilen der Org.
  - Manager/Admin Korrekturen: nur über Server-Function (DENY-ALL Client-Write).
- `revenue_channels`, `payment_terminals`: SELECT alle Rollen, INSERT/UPDATE
  Manager+, DELETE Admin (oder soft-delete via `is_active=false`).

### Reines Rechenmodul `src/lib/cash/`

Keine I/O, keine Supabase-Imports, voll getestet. Module:

- **`waiter-settlement.ts`** — `calcWaiterSettlement({ posSalesCents,
cardTotalCents, hilfMahlCents, openInvoicesCents, kitchenTipRate })` →
  `{ differenzCents, kitchenTipCents }`. Formel 1:1 wie Altsystem:
  `differenz = pos_sales + hilf_mahl − open_invoices − card_total`,
  `kitchen_tip = round(pos_sales * rate)`. Rundung: kaufmännisch auf Cents,
  Verhalten dokumentiert und getestet.
- **`cash-ledger.ts`** — `computeDailyBalance(session, satellites) →
dailyDeltaCents` und `accumulateChain(openingBalanceCents, days[]) →
{ perDay: [{date, deltaCents, balanceCents, deficitCarriedFromPrevious}] }`.
  Reine Funktion über sortierte Tage. Vortages-Defizit-Verrechnung wie
  Altsystem (negativer Saldo wandert in Folgetag sichtbar mit).
- **`session-channels.ts`** — Aggregation `sum(channel_amounts) +
sum(terminal_amounts) + sonstige_einnahme − opentabs_deduction − vorschuss
− einladung` (exakte Formel beim Bau gegen Altsystem-Hook
  `useCashBalanceData` verifizieren — wenn Abweichung: melden statt raten).

### Tests

- **Unit**: `waiter-settlement.test.ts`, `cash-ledger.test.ts`,
  `session-channels.test.ts` — Tabellen-Tests mit Edge-Cases (0, negativ,
  Carry-over-Kette über DST-Sprung, Defizit-Übertrag, leere Tage).
- **Golden-Master-Harness**: `src/lib/cash/golden-master/cashBalance.test.ts`
  — lädt `cashBalance.json`, ruft `accumulateChain` + `calcWaiterSettlement`
  pro Fixture-Tag auf, vergleicht `toEqual` (Toleranz 0). Strukturanalog
  zu `src/lib/time/sfn/golden-master.test.ts`.
- **Platzhalter-Fixture** `cashBalance.json` (5–10 Tage, handgerechnet,
  Pseudonyme `KELLNER_01…`, alle Beträge in Cents als Integer, Rechenweg
  als JSON-Kommentarblock in einer Schwester-`.md`-Datei). Wird ersetzt,
  sobald der unabhängige Prüfer die echte Fixture liefert — Format
  identisch, Tests laufen ohne Code-Änderung weiter.
- **DB-Tests**: Unique `(organization_id, business_date)`, RLS-Härtung
  (Kellner kann fremde Settlement nicht lesen/schreiben, kann eigene
  Settlement nicht ändern wenn `status != 'draft'`, kann nicht für
  vergangenen `business_date` einfügen), append-only `waiter_settlements`
  (Korrektur erzeugt neue Zeile).

### Gate B3a

- `tsc`, `eslint`, `vitest` grün.
- `scripts/check-rls-inventory.sql` grün (keine neuen `USING (true)`).
- Platzhalter-Fixture reproduziert sich selbst cent-genau.
- Externe Prüfung der Migration + Rechenmodul vor B3b.

---

## B3b — Erfassungs-UI (zweistufig) + Server-Functions

### Server-Functions (`src/lib/cash/cash.functions.ts`)

Alle `requireSupabaseAuth` + Rollenprüfung via `has_role` + `runGuarded` +
Audit. `supabaseAdmin` ausschließlich im Handler.

- **`getOrCreateOpenSession({ businessDate })`** — Manager+. Idempotent.
- **`submitWaiterSettlement({ posSalesCents, cardTotalCents, hilfMahlCents,
openInvoicesCents, cashHandedInCents, breakMinutes })`** — Staff+.
  Schreibt Settlement mit `status='submitted'`, berechnet differenz/
  kitchen_tip über `calcWaiterSettlement`, snapshottet `kitchen_tip_rate`.
  **Ruft anschließend die bestehende `clockOut`-Server-Function intern auf**
  (Import aus B2a, gleiche Validierung/Pausenlogik/Audit) mit
  `meta: { triggered_by: 'settlement', settlement_id }`. Wenn kein offener
  Zeiteintrag existiert: Settlement gespeichert, `auto_clockout_time_entry_id
= NULL`, Response enthält Hinweis `no_open_time_entry` — kein Throw,
  kein zweiter Stempelversuch bei erneutem Bearbeiten (idempotent).
  **Harte Grenze**: Diese Funktion fasst `time_entries` nicht direkt an.
- **`correctWaiterSettlement({ originalId, ...felder, reason })`** — Manager+.
  Erzeugt neue Zeile mit `corrected_from_id`, setzt Original auf
  `status='superseded'`. Audit-Eintrag mit `reason`.
- **`updateSession({ sessionId, channelAmounts, terminalAmounts,
voucherFields, opentabs/vorschuss/einladung/sonstige, notes })`** —
  Manager+. Upsert auf `session_*_amounts`, Update der Zahlen-Felder
  auf `sessions`. Blockiert wenn `status != 'open'`.
- **`addSessionSatellite({ sessionId, kind, payload })`** — Manager+.
  `kind` ∈ `expense | advance | card_transaction | bank_deposit |
register_transfer`. Blockiert bei Sperre.
- **`finalizeSession({ sessionId })`** — Manager+. Setzt `status='finalized'`.
- **`lockSession({ sessionId })`** — Admin only. Setzt `status='locked'`,
  verschiebt `cash_locked_through_date` auf `max(business_date)` der
  gesperrten Sessions. Audit-Eintrag.
- **`setCashLock({ throughDate, reason })`** — Admin only, separat
  (Muster `setTimeLock`). Eigener Audit-Eintrag.
- **Schreibgate**: jede schreibende Funktion auf `sessions`/Satelliten
  prüft `business_date > cash_locked_through_date` — sonst
  `CashLockedError` (Muster `TimeLockedError`).

### UI

Eine Route, zwei Views, rollenabhängig:

- **`/zeit/abrechnung`** (Staff+) — mobil-optimiert, PIN-Auth wie
  Stempeluhr. Eigene Settlement des laufenden Geschäftstags erfassen,
  Pausen-Dialog (ArbZG-Default vorgewählt), „Absenden" → ruft
  `submitWaiterSettlement`. Nach Submit read-only mit Status-Badge.
  Hinweis-Banner wenn kein offener Zeiteintrag.
- **`/admin/kasse`** (Manager+) — Desktop. Liste aller Settlements des
  Geschäftstags + Sektionen für Kanäle, Terminals, Gutscheine, Ausgaben,
  Vorschüsse, Kartenumsätze, Einzahlungen, Transfers. Korrektur-Button
  je Settlement (öffnet Dialog mit Pflichtfeld `reason`). „Tag
  finalisieren" + (Admin) „Sperren".

### Gate B3b

- Vitest grün inkl. neuer DB-Tests für Server-Functions
  (Idempotenz `submitWaiterSettlement`, Auto-Clockout-Pfad, kein zweiter
  Stempelversuch, Korrektur erzeugt neue Zeile + supersedet Original,
  `CashLockedError` bei gesperrtem Tag, Admin-only für `lockSession`/
  `setCashLock`).
- **Manuelles E2E**: Kellner stempelt ein → erfasst Abrechnung am Handy →
  Submit → Audit zeigt `triggered_by: 'settlement'` und passenden
  `time_entries`-Eintrag mit `clocked_out_at = submitted_at` → Manager
  sieht Settlement in `/admin/kasse` → finalisiert → Admin sperrt → erneuter
  Schreibversuch wirft `CashLockedError`.

---

## B3c — Saldo & Berichte

- **`getCashLedger({ from, to })`** — Manager+. Liest Sessions + Satelliten,
  ruft `accumulateChain`, gibt Tag/Delta/Saldo/Defizit zurück.
- **UI `/admin/kasse/saldo`** — Tabelle mit Tagessaldo, Carry-over,
  Vortages-Defizit, CSV-Export.
- **Abgleichsbericht** `/admin/kasse/abgleich` — Eingabe: Alt-Saldo je Tag
  (CSV-Upload analog B2c). Zeigt Diff Alt vs. neu, rot markiert wenn ≠ 0.

### Gate B3c

- Parallelmonat startet: jeden Tag Abschluss in COCO + Altsystem,
  Abgleichsbericht muss 0 Differenz zeigen über einen vollen Monat.
- Erst danach: Cutover-Checkliste (analog `docs/migration-cutover-
checklist.md`), Altsystem read-only.

---

## Explizit NICHT in B3

- Lohnbüro-Übergabe der Vorschüsse (→ M4).
- Sofortmeldung (→ M4).
- Trinkgeld-Verteilung Küche über `kitchen_shifts` als Planungs-Feature
  (→ eigener Bauplan; `kitchen_tip_cents` wird in B3a nur als Summe je
  Settlement berechnet, Verteilung folgt später).
- Historien-Migration. Nur Eröffnungssaldo + Stammdaten (Kanäle, Terminals,
  Tip-Rate) werden initial gesetzt — über eine separate Seed-Server-Function
  `seedCashOpening({ openingBalanceCents, channels, terminals, kitchenTipRate })`,
  Admin-only, einmalig pro Org, mit Audit.

---

## Offene Frage vor B3a-Bau

Keine. Alle drei M2-Entscheidungen bestätigt, Golden-Master-Arbeitsteilung
geklärt (du lieferst Fixture, ich baue Harness + handgerechneten Platzhalter).

Freigabe?

---

## B3b — Erfassung & zweistufiger Abschluss-Flow (gebaut)

Freigaben:

- `correctWaiterSettlement` ist erlaubt bei Session-Status `open` UND
  `finalized`; gesperrt erst bei `locked` oder unterhalb
  `cash_locked_through_date`. `assertCashWritable` blockt entsprechend
  nur `locked` + Wasserlinie, NICHT `finalized`. `finalized` ist
  Zwischenstatus für Manager-Übersicht, keine Schreibsperre für
  Korrekturen (M2-Steckbrief §5).
- `correctWaiterSettlement` ERBT den `kitchen_tip_rate`-Snapshot der
  Original-Zeile — eine Zahlenkorrektur ändert den Trinkgeldsatz nicht
  rückwirkend.

### Server-Functions (`src/lib/cash/cash.functions.ts`)

- `getOrCreateOpenSession({ businessDate? })` — Manager+.
- `submitWaiterSettlement({ posSalesCents, cardTotalCents, hilfMahlCents,
openInvoicesCents, cashHandedInCents })` — Staff+. Snapshot von
  `kitchen_tip_rate`, ruft `calcWaiterSettlement`, persistiert
  `submitted`. Auto-Ausstempeln über `performClockOut` (aus
  `time.functions.ts` extrahiert; gleiche Validierung/Pausen-Logik wie
  `clockOut`-Server-Fn). Pause = ArbZG-Default, Audit-Meta enthält
  `triggered_by:'settlement'`, `arbzg_default:true`, `settlement_id`.
  Idempotent: zweiter Aufruf erzeugt keinen zweiten clockOut. Kein
  offener Eintrag → `noOpenTimeEntry:true`.
- `correctWaiterSettlement({ originalId, …felder, reason })` — Manager+.
  Erzeugt neue Zeile mit `corrected_from_id`, Original →
  `status='superseded'`. Erbt `kitchen_tip_rate` vom Original.
- `updateSession({ … })`, `addSessionSatellite`, `removeSessionSatellite`,
  `finalizeSession`, `lockSession` (Admin), `setCashLock({ throughDate,
reason })` (Admin, nur vorwärts, Muster `setTimeLock`).
- Schreibgate `assertCashWritable` aus `cash-lock.ts` (rein).

### UI

- `/zeit/abrechnung` (Staff+, mobil): 5 Cent-Eingaben, Live-Vorschau,
  Submit → Auto-Ausstempeln (kein Pausen-Dialog, ArbZG automatisch).
- `/admin/kasse` (Manager+): Liste aller Settlements, Korrektur-Dialog
  mit Reason, Session vervollständigen (Kanäle/Terminals/Satelliten),
  Finalisieren, Sperren (Admin), Wasserlinie setzen (Admin).

### Tests

- `cash-lock.test.ts` (Tabellen) + `cash-{submit,correct,lock,finalize}.db.test.ts`.
- Bestehende 165 Tests bleiben grün.

---

## B3c-1 — Kasse-UI (nur Oberfläche)

Reiner UI-Commit auf den B3b-Server-Functions. Keine neue Geschäfts- oder
Rechenlogik, kein neuer Auth-Pfad, keine Schema-Änderung. Saldo/Carry-over/
Export/Abgleich bleiben B3c-2.

### Scope

**1. `/zeit/abrechnung` (Staff+, mobil, PWA)**

- Wiederverwendung der bestehenden PIN-Auth-Schicht der Stempeluhr
  (`/zeit/index.tsx`-Flow). Kein neuer Login, kein neuer Token.
- Formular mit fünf Cent-Eingaben:
  `posSalesCents`, `cardTotalCents`, `hilfMahlCents`,
  `openInvoicesCents`, `cashHandedInCents`. Eingabe in Euro (Dezimal),
  Konvertierung auf ganze Cents im Form-State.
- Live-Vorschau `differenz` + `kitchen_tip` clientseitig über das **gleiche**
  reine Modul `calcWaiterSettlement` aus `src/lib/cash/waiter-settlement.ts`.
  Tip-Rate aus Org-Settings (Query). Der Serverwert (snapshottet beim
  Submit) bleibt Source of Truth — Vorschau ist informativ, nicht
  verbindlich.
- Primärbutton „Abrechnung absenden & ausstempeln" mit Confirm-Dialog:
  „ArbZG-Pause wird automatisch angewendet." → `useServerFn(submitWaiterSettlement)`.
- Nach Submit: read-only Ansicht der eigenen Settlement des Geschäftstags
  mit Status-Badge (`submitted | superseded | locked`) + Anzeige der
  Auto-Ausstempelzeit. Banner „Kein offener Zeiteintrag — nichts ausgestempelt"
  bei `noOpenTimeEntry: true`.
- **Keine Kellner-Korrektur-UI** — Korrekturen laufen nur über Manager
  in `/admin/kasse`.

**2. `/admin/kasse` (Manager+, Desktop)**

- Kopfzeile: Datumswahl (default `current_business_date()`),
  Session-Status-Badge (`open | finalized | locked`), zusätzlicher
  Warnbadge wenn `business_date <= cash_locked_through_date` der Org.
- Kellnerabrechnungen-Liste: alle Settlements der Session, Spalten
  Kellner / pos / card / hilf / open / cash / differenz / tip / status.
  `superseded`-Zeilen visuell ausgegraut, mit Verweis auf Nachfolger-Zeile.
  Korrektur-Button je nicht-supersededer Zeile → Dialog mit allen fünf
  Geldfeldern (vorbefüllt) + Pflichtfeld `reason` (Validierung `min(3)`)
  → `correctWaiterSettlement`.
- Editierbare Sektionen der Session (jeweils eigene Karte):
  - **Kanäle** und **Terminals** — dynamische Zeilen `(channel/terminal, amountCents)`
    aus `revenue_channels` / `payment_terminals` der Org → `updateSession`.
  - **Gutscheine + Sonstiges** — Felder `vouchers_sold_cents`,
    `vouchers_redeemed_cents`, `finedine_vouchers_cents`,
    `opentabs_deduction_cents`, `vorschuss_cents`, `einladung_cents`,
    `sonstige_einnahme_cents`, `notes` → `updateSession`.
  - **Ausgaben**, **Vorschüsse**, **Kartenumsätze**, **Einzahlungen**,
    **Transfers** — Liste + Add-Form + Remove-Button →
    `addSessionSatellite` / `removeSessionSatellite`.
  - Alle Sektionen disabled, sobald `assertCashWritable` blocken würde
    (locked oder unter Wasserlinie); UI fragt das vor dem Render aus
    Session-Status + Org-Settings ab und zeigt Hinweis.
- Footer-Aktionen:
  - „Tag finalisieren" (Manager+) → `finalizeSession`, Confirm-Dialog.
  - „Sperren" (Admin) → `lockSession`, Confirm-Dialog mit Hinweis
    „Setzt cash_locked_through_date — unumkehrbar".
- Separater Admin-Block „Kasse sperren bis…" mit Datumsfeld + Pflichtfeld
  `reason` → `setCashLock`. Nur vorwärts (Server prüft, UI deaktiviert
  Daten ≤ aktueller Wasserlinie).

**3. Daten-Layer**

- Alle Writes ausschließlich über `useServerFn(...)` + `useMutation`,
  `onSuccess` invalidiert die betroffenen Query-Keys
  (`['cash','session', businessDate]`, `['cash','settlements', sessionId]`).
- Reads über `queryOptions` + `ensureQueryData` im Loader +
  `useSuspenseQuery` im Component (Standard-Read-Shape).
- **Keine optimistic updates auf Geldfelder.** Optimismus nur erlaubt
  für reine Lese-Refreshes (z.B. Toggle eines Filters), niemals für
  Beträge, Status-Wechsel, Korrekturen oder Sperren — der Server bleibt
  Source of Truth, Race-/Konflikt-Antworten werden sichtbar gemacht.
- Fehler-Pfade: `CashLockedError`, `NotAuthorized`, Validierungsfehler →
  als Toast (sonner) + Inline-Hinweis im Formular. Keine stillen Retries.

### Wiederverwendung statt Neubau

- `calcWaiterSettlement` (rein) → Live-Vorschau und Server-Validierung.
- PIN-Auth-Komponente der Stempeluhr → identische Eingabe-UX.
- Bestehende `cash.functions.ts` (B3b) → unverändert, nur konsumiert.
- shadcn-Bausteine (Card, Dialog, Input, Badge, Button) — kein Neubau
  generischer UI-Primitiven.

### Explizit NICHT in B3c-1

- Saldo-/Carry-over-Ansicht (`/admin/kasse/saldo`), CSV-Export,
  Abgleichsbericht — alles B3c-2, kommt nach Lieferung der echten
  Golden-Master-Fixture durch den unabhängigen Prüfer.
- Stammdaten-Pflege für `revenue_channels` / `payment_terminals`
  (eigene Admin-Seite, separater Mini-Commit). B3c-1 zeigt nur die
  vorhandenen Einträge.
- Trinkgeld-Verteilung Küche (separater Bauplan).
- Lohnbüro-Übergabe Vorschüsse (M4).

### Gate B3c-1

- `tsc`, `eslint --max-warnings=0`, `vitest run` grün; bestehende Tests
  unverändert (UI-Commit fasst keine Logik an).
- CI `check` + `db-integration` grün.
- Manuelles E2E nach `docs/cash-e2e-check.md` (neu in diesem Commit):
  Kellner stempelt ein → öffnet `/zeit/abrechnung` am Handy → trägt
  fünf Beträge ein → Live-Vorschau stimmt mit Server-Response überein →
  Submit → Auto-Ausstempelzeit sichtbar → Manager öffnet `/admin/kasse`,
  sieht Settlement, korrigiert mit Reason (Original wird ausgegraut,
  Nachfolger erscheint), ergänzt Kanäle/Terminals/Satelliten, finalisiert,
  Admin sperrt → erneuter Schreibversuch (Korrektur, Update, Satellit)
  wird mit `CashLockedError`-Toast abgewiesen.

### Offene Frage vor B3c-1-Bau

Keine. Wenn freigegeben: Build erfolgt in **einem** Commit (zwei Routen +
`docs/cash-e2e-check.md`), kein Logik-/Schema-Anfass.

Freigabe?

---

## B3c-1 — Split in 1a/1b (nach Review)

Begründung: Die Read-Seite ist für die UI unvollständig (keine Reader
für `revenue_channels`/`payment_terminals`, `getCashOverview` liefert
keine `*_amounts` + Satelliten, kein `kitchen_tip_rate` für die
Live-Vorschau). Read-Endpunkte für ein Geldmodul gehören mit
DB-Tests in einen eigenen Commit, nicht vermischt mit UI.

### B3c-1a — Read-Endpunkte (zuerst, eigener Commit)

- `listRevenueChannels()` / `listPaymentTerminals()` — Manager+.
  Org-gescoped, sortiert nach `(sort_order, label)`, kein `is_active`-
  Filter (UI zeigt inaktive ausgegraut). Nur SELECT.
- `getCashOverview` erweitern um:
  - `channelAmounts: [{ channelId, amountCents }]`
  - `terminalAmounts: [{ terminalId, amountCents }]`
  - Satelliten der Session: `expenses`, `advances`, `cardTransactions`,
    `bankDeposits`, `registerTransfers`. Jeweils mit `id` + Feldern aus
    der jeweiligen Tabelle (BIGINT-Cents).
  - Response-Shape bleibt rückwärtskompatibel: bestehende Felder
    (`session`, `settlements`, `cashLockedThroughDate`) unverändert.
- `getMySettlement` erweitern um `kitchenTipRate: number` (aus
  `organization_settings.kitchen_tip_rate`) — Staff darf die eigene
  Org-Rate für die Live-Vorschau lesen, auch wenn noch keine Settlement
  existiert. Kein neuer Reader nötig.
- **KEINE Schema-Änderung.** RLS bleibt wie sie ist; alle Reads laufen
  über die bestehende `supabaseAdmin`-Function-Schicht (DENY-ALL für
  Sessions/Satelliten Client-seitig). Die Funktionen authentifizieren
  + autorisieren über `loadAdminCaller`/`loadStaffCaller`.
- DB-Tests (`cash-read.db.test.ts`, role-guard-Muster):
  1. Kellner-Aufruf gegen Manager-Reader (`getCashOverviewCore`,
     `listRevenueChannelsCore`, `listPaymentTerminalsCore`) wirft
     `ForbiddenError` — Kellner kann keine fremden Settlements oder
     Satelliten über Reader abgreifen.
  2. Manager sieht Overview inkl. `channelAmounts`, `terminalAmounts`
     und allen fünf Satelliten-Listen seiner Org; sieht KEINE Daten
     einer anderen Org (Cross-Org-Härtung).
  3. Staff-Reader `getMySettlementCore` liefert `kitchenTipRate` aus
     `organization_settings` auch ohne vorhandene Settlement.
- Gate: `tsc`, `eslint --max-warnings=0`, `vitest run` grün; bestehende
  Tests unverändert; CI `check` + `db-integration` grün.

### B3c-1b — UI (danach)

Konsumiert 1a, baut die zwei Routen wie in B3c-1 oben beschrieben.
Kein weiterer Function-Anfass, keine neue Geschäftslogik.

---

## B3-Modellkorrektur (Befund 1 + 2)

Quelle: `befund-kasse-modell-und-standort.md`. Befund 3 (Trinkgeld-Pool)
ist explizit NICHT Teil dieses Blocks und folgt danach. B3c-2
(Saldo-UI/Export) ebenfalls nicht.

Hintergrund: Die in B3a/B3b gebaute Kassenmechanik weicht in zwei
Punkten vom bewährten Alt-Modell ab:
1. Kanäle, Terminals und Sessions hängen nur an `organization_id`,
   nicht an `location_id`. Damit ist die Kasse für Mehrstandort-Orgs
   nicht korrekt abbildbar — ein Tag pro Org statt ein Tag pro Standort.
2. `cash-ledger.computeDayDelta` weicht von der Original-`dailyCash`-
   Formel ab (fehlende Eingaben: Kartenumsatz separat, ordersmart,
   wolt, einladung, openInvoices, sonstigeEinnahme; Transfers nicht
   richtungsbasiert; Bankeinzahlungen werden ins Tages-Delta gemischt
   statt nach dem Carry abgezogen). Ergebnis: Saldo nicht reproduzierbar
   gegen Altdaten.

Reihenfolge: Teil A (Standort-Modell) und Teil B (Formel) sind getrennte
Commits in dieser Reihenfolge. Tests (Teil C) jeweils mit dem Commit,
der die Logik bringt.

### Teil A — Standorte in der Kasse (eigener Commit)

Schema-Migration (eine Migration, alle Tabellen in einem Schritt — sonst
ist die Datenbank zwischen Migrationen inkonsistent):

- `sessions`:
  - `location_id uuid NOT NULL REFERENCES locations(id)` ergänzen.
  - Bestehender Unique `(organization_id, business_date)` → DROP, dann
    `UNIQUE (organization_id, location_id, business_date)`.
  - Index `(organization_id, business_date)` → `(organization_id,
    location_id, business_date)`.
- `revenue_channels`:
  - `location_id uuid NOT NULL REFERENCES locations(id)` ergänzen.
  - Unique-/Sort-Order-Constraints inkl. `location_id` neu fassen.
- `payment_terminals`: analog `location_id NOT NULL` ergänzen.
- Wasserlinie (`cash_locked_through_date`): **je Standort**, nicht
  org-weit. Begründung: Kassentage werden standortweise final; eine
  org-weite Sperre würde einen Standort gegen unfertige Tage eines
  anderen blockieren. Umsetzung: neue Tabelle
  `cash_locks (organization_id, location_id, locked_through_date,
  updated_at, updated_by)` mit `PRIMARY KEY (organization_id,
  location_id)`. Die Spalte auf `organizations` (falls vorhanden) wird
  durch dieses Mapping ersetzt; Migration kopiert den bisherigen Wert je
  bestehender Location.
- RLS: alle vier Tabellen behalten DENY-ALL Client-seitig; Lese-/
  Schreibrechte laufen über `supabaseAdmin` in den Server-Functions.
  GRANTs wie bisher.
- Bestandsdaten: Da B3 noch nicht produktiv ist, gibt es keine
  Migrationspflicht für historische `sessions`. Falls Testdaten
  existieren, werden sie an die erste Location der Org gepinnt
  (deterministisch nach `created_at`); die Migration weist auf den
  Eingriff explizit hin.

Server-Functions (`src/lib/cash/cash.functions.ts`, alle Aufrufer
anpassen):

- `getOrCreateOpenSession({ businessDate, locationId })` — Idempotenz
  jetzt über `(org, location, date)`.
- `getCashOverview({ businessDate, locationId })` — selektiert pro
  Standort. Reader-Shape bleibt sonst.
- `updateSession`, `finalizeSession`, `lockSession` — `locationId` aus
  der `sessions`-Zeile lesen, Wasserlinie gegen `cash_locks` pro
  Standort prüfen.
- `setCashLock({ locationId, throughDate, reason })` — schreibt in
  `cash_locks`. Admin-only wie bisher.
- `submitWaiterSettlement({ businessDate, locationId, ... })` — Kellner
  wählt den Standort, an dem er heute gearbeitet hat. Validierung:
  `staff_locations`-Eintrag des Callers für diese `locationId` muss
  existieren (sonst `ForbiddenError`). Das deckt fliegende Mitarbeiter
  ab, die mal hier, mal dort abrechnen.
- `correctWaiterSettlement` — keine Signaturänderung; die zu
  korrigierende Zeile bringt `location_id` über `session_id` mit.
- `listRevenueChannels({ locationId })` / `listPaymentTerminals(
  { locationId })` — standort-gefiltert. UI muss `locationId` mitgeben.
- Cross-Org-Schutz: jede Function prüft, dass die übergebene
  `locationId` zur Org des Callers gehört (`locations.organization_id =
  caller.org`). Sonst `ForbiddenError`.

UI (nur Anpassung, kein neuer Scope):

- `/admin/kasse`: Standort-Selector im Kopf, persistiert in der URL
  (`?location=…`). Default: erster Standort der Org nach `sort_order`.
- `/zeit/abrechnung`: Standort-Selector über den Beträgen, gefiltert auf
  Standorte mit gültiger `staff_locations`-Bindung. Default: einziger
  Standort, falls nur einer berechtigt.
- Wasserlinien-Block (`/admin/kasse`): Datum + Reason je Standort.

### Teil B — Kassenformel ans Alt-Modell angleichen (eigener Commit)

Modul: `src/lib/cash/cash-ledger.ts`.

Neue `DayInput`-Felder (BIGINT-Cents, Integer-Validierung wie bisher):

- `grossRevenueCents` (= POS) — bleibt.
- `vouchersSoldCents`, `vouchersRedeemedCents`, `finedineVouchersCents`
  — bleiben.
- **NEU** `cardTotalCents` — Summe Terminal1+Terminal2. Wird vom Tages-
  Delta subtrahiert (Karten kommen nicht in die Kasse).
- **NEU** `ordersmartCents`, `woltCents` — Bestellplattformen, subtrahiert.
- **NEU** `einladungCents` — subtrahiert.
- **NEU** `openInvoicesCents: number[]` — Σ subtrahiert.
- **NEU** `sonstigeEinnahmeCents` — addiert.
- `satellites.expensesCents` — bleibt (subtrahiert).
- `satellites.advancesCents` — bleibt; **Quirk**: wenn die Liste nicht
  leer ist, gilt deren Summe; sonst greift `vorschussCents` aus
  `DayInput` (NICHT beide gleichzeitig). Begründung: das Alt-Modell hat
  beide Eingabearten, aber nie additiv.
- **NEU** `vorschussCents` (Session-Pauschalfeld) — siehe oben.
- `satellites.bankDepositsCents` — bleibt, wird aber NICHT mehr im
  Tages-Delta verrechnet. Stattdessen separate Ketten-Stufe (s. u.).
- `satellites.registerTransfersCents: [{ direction, amountCents }]` —
  richtungsbasiert statt zwei Listen. `direction ∈ { 'to_restaurant',
  'to_safe', 'to_other' }`. `to_restaurant` addiert, alle anderen
  subtrahieren. Das Schema-Feld bleibt wie heute (`direction`-Spalte
  existiert in `session_register_transfers` bereits).
- `satellites.cardTransactionsCents` — bleibt als separate
  Korrekturliste (selten genutzt; addiert/subtrahiert je Vorzeichen wie
  heute). Nicht gleich `cardTotalCents`.

Neue Formel (cent-genau):

```text
dailyCash    = grossRevenue + vouchersSold + sonstigeEinnahme
             − cardTotal − ordersmart − wolt − vouchersRedeemed
             − finedineVouchers − einladung − Σ openInvoices
             − effectiveVorschuss − Σ expenses
             + Σ cardTransactions

transferEffect = Σ transfers(to_restaurant) − Σ transfers(to_safe|other)

rawBargeld     = dailyCash + transferEffect
chained        = rawBargeld + previousCarry          // previousCarry darf < 0 sein
remainingCash  = chained − Σ bankDeposits            // Einzahlungen NACH Carry
carry          = remainingCash                       // auch negativ weiterreichen
```

`accumulateChain` liefert pro Tag: `dailyCashCents`, `transferEffectCents`,
`rawBargeldCents`, `previousCarryCents`, `chainedCents`,
`bankDepositsTotalCents`, `remainingCashCents` (= neuer
`balanceCents`). `deficitCarriedFromPreviousCents` bleibt (= max(0,
−previousCarry)). Reihenfolge-Invariante (strictly ascending
`businessDate`) bleibt; Property-Test bleibt unverändert (gilt für die
neue Funktion ebenso).

`session_channel_amounts` / `session_terminal_amounts` werden im Reader
(`getCashOverview`) so aggregiert, dass die UI die Formel-Eingaben
direkt füllen kann: POS/Wolt/Ordersmart werden anhand
`revenue_channels.kind` (oder eines äquivalenten Marker-Feldes)
separiert; `cardTotal` ist die Summe aller `terminal_amounts`. Falls
der Marker fehlt, wird er als Mini-Schema-Ergänzung in derselben
Migration nachgezogen (`revenue_channels.kind text NOT NULL DEFAULT
'pos'`, Werte: `'pos'`, `'wolt'`, `'ordersmart'`, `'voucher_sold'`,
`'voucher_redeemed'`, `'finedine'`, `'einladung'`, `'sonstige'`).
Konkrete Wahl wird im Implementierungs-Commit fixiert.

`aggregateSessionRevenue` (`session-channels.ts`) wird passend zu den
neuen Kanal-Kinds umgeschrieben; bisherige Tests werden angepasst (sie
sind Charakterisierungstests der jetzigen Formel, nicht der Altformel).

### Teil C — Tests

- `cash-ledger.test.ts`: neu fassen mit Fällen aus dem Befund-Dokument
  (POS-only, Karten dominieren, Wolt+Ordersmart, Vorschuss-Quirk
  beide Varianten, Transfer to_restaurant/to_safe, Einzahlung > Bargeld
  → negativer Carry, mehrtägige Kette mit Defizit-Übertrag).
- `cash-ledger.property.test.ts`: bleibt (Assoziativität der Kette).
  Generator wird um die neuen Felder erweitert.
- Golden-Master (`golden-master/cashBalance.test.ts`): Harness bleibt;
  Fixture wird vom externen Prüfer geliefert (zwei Ketten, eine je
  Standort). Bis dahin bleibt die Platzhalter-Fixture, an die neue
  Formel angepasst.
- DB-Tests:
  - `cash-submit.db.test.ts` / `cash-correct.db.test.ts` /
    `cash-finalize.db.test.ts` / `cash-lock.db.test.ts` /
    `cash-read.db.test.ts` / `cash-rls.db.test.ts` — alle bekommen einen
    `locationId`-Parameter in den Aufrufen.
  - NEU: zwei Standorte derselben Org, je eigene Session am selben Tag;
    `(org, location, date)` Unique greift (zweiter Insert mit gleichem
    Tripel → Konflikt; mit unterschiedlicher `location_id` ok).
  - NEU: Kellner ohne `staff_locations`-Bindung für die `locationId`
    ruft `submitWaiterSettlement` → `ForbiddenError`.
  - NEU: Wasserlinie je Standort: `setCashLock` für Location A sperrt
    Schreibpfade für A; B bleibt schreibbar.

### Nicht in diesem Block

- Trinkgeld-Pool-Verteilung (Befund 3) — eigener Block danach.
- B3c-2 Saldo-UI/Export.
- Stammdaten-Pflege Kanäle/Terminals.

### Erfolgs-Gate

- `tsc`, `eslint . --fix` mit `--max-warnings=0`, `vitest run` grün.
- CI `check` + `db-integration` grün.
- `docs/cash-e2e-check.md` um Standort-Fall ergänzt (zwei Standorte,
  Kellner-Berechtigung, Wasserlinie je Standort).

### Offene Fragen vor Bau (bitte vor Teil-A-Commit klären)

1. Soll `revenue_channels.kind` als Marker eingeführt werden, oder gibt
   es bereits ein äquivalentes Feld, das wir nutzen sollen? (Beeinflusst
   die Migration in Teil A bzw. Teil B.)
2. `cash_locks` als eigene Tabelle (Vorschlag) oder bestehende Spalte
   auf `organizations` durch `(organization_id, location_id)`-Pivot
   ersetzen?
3. Default-Standort in der UI: erster nach `sort_order` ok, oder soll
   der zuletzt benutzte je User persistiert werden (kleine
   `user_preferences`-Erweiterung)?
