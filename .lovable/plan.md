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
- **REVIDIERT (Prüfpunkt 1):** `cardTransactionsCents` fließt NICHT in
  die neue `dailyCash`-Formel ein. Begründung: im Altsystem
  (`useCashBalanceData.ts`) gibt es laut Review nur `cardTotal`
  (Terminal1+2) als Abzug, KEINE separate `cardTransactions`-Addition.
  Der Agent konnte das Alt-File nicht selbst einsehen (liegt nicht im
  COCO-Repo) — die Festlegung erfolgt nach Review-Aussage. Die Tabelle
  `session_card_transactions` und ihre Add/Remove/Reader bleiben
  unverändert (B3a-Schema), werden aber von `computeDayDelta` ignoriert.
  Falls die Alt-Quelle doch eine Addition zeigt, wird sie in einem
  Folge-Commit nachgezogen — Codestelle dann bitte nennen.

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

`revenue_channels.kind` ist als fester Enum / `CHECK`-Constraint
`NOT NULL` modelliert (kein freier Text). Jede neu angelegte Location
bekommt beim Seeding denselben vollständigen Satz Kinds (genau eine
Zeile je Kind pro Location). `kind` ist der technische Schlüssel und
enthält NIE einen Anbieternamen — Anbieter ändern sich (Beispiel:
„ordersmart" → „SOUSE"), der Enum-Wert darf das nicht. Anzeigename
steht ausschließlich in `revenue_channels.label`.

Erlaubte Kind-Werte (final): `'pos'`, `'delivery_souse'` (label:
„SOUSE"), `'delivery_wolt'` (label: „Wolt"), `'voucher_sold'`,
`'voucher_redeemed'`, `'finedine'`, `'einladung'`, `'sonstige'`.

`session_channel_amounts` / `session_terminal_amounts` werden im Reader
(`getCashOverview`) so aggregiert, dass die UI die Formel-Eingaben
direkt füllen kann: POS/Wolt/Delivery-Plattformen werden anhand
`revenue_channels.kind` separiert; `cardTotal` ist die Summe aller
`terminal_amounts`. Falls die Spalte `kind` heute noch nicht existiert,
wird sie in derselben Migration (Teil B) als `NOT NULL` mit CHECK-Liste
wie oben nachgezogen — Backfill auf `'pos'` für Bestandszeilen, danach
wird der Default entfernt, damit neue Inserts den Kind explizit setzen
müssen.

In der `cash-ledger`-Formel ersetzt `delivery_souse` den bisher als
`ordersmartCents` benannten Eingabewert (die DayInput-Feldnamen werden
ebenfalls neutral gefasst, z. B. `deliverySouseCents` /
`deliveryWoltCents`, damit der Code keinen Anbieternamen trägt).

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

Geklärt im Review:
- Auflage akzeptiert: `revenue_channels.kind` als fester Enum/CHECK,
  `NOT NULL`, neutral (kein Anbietername im Enum), per-Location-Seeding
  mit vollständigem Satz Kinds.
- Prüfpunkt 1: `cardTransactionsCents` bleibt aus der `dailyCash`-Formel
  draußen (siehe Notiz oben). Agent konnte Alt-Quelle nicht prüfen,
  Festlegung per Review-Aussage.
- Prüfpunkt 2: Charakterisierungstests in `session-channels.ts` werden
  beim Anpassen NICHT an die neue Implementierung angeschmiegt.
  Hand-geschriebene Erwartungswerte nur für isolierte Formel-Bausteine
  (Kanal-Summen, Transfer-Vorzeichen, Vorschuss-Quirk). Die ganze
  Tages-/Mehrtages-Kette wird ausschließlich gegen die extern
  gelieferte Golden-Master-Fixture (`cashBalance.json`, zwei Ketten,
  Mapping `ordersmart`→`delivery_souse` macht der Prüfer) cent-genau
  verifiziert.
- Reihenfolge final: Teil A (Standorte) als eigener Commit, dann
  Teil B (Formel). `eslint --fix` vor jedem Commit.

Offen (nicht blockierend für Teil A):
- `cash_locks` als eigene Tabelle vs. Pivot bestehender Spalte —
  Vorschlag bleibt eigene Tabelle; falls keine Gegenrede, wird so
  gebaut.
- Default-Standort in der UI: erster nach `sort_order`. Persistenz pro
  User ist kein B3-Scope.

---

## Block „Abrechnung live" — P1: Stammdaten-Fundament

Status: Plan, wartet auf Freigabe. KEIN Code in diesem Schritt.

Hinweis an den Prüfer (Ehrlichkeitsregel): Die referenzierten Dokumente
`bauplan-abrechnung-live.md` und `spec-trinkgeld-pool.md` liegen dem Agent
noch NICHT vor (nicht in `/mnt/user-uploads/`). Dieser Plan stützt sich
ausschließlich auf den im Auftrag inline beschriebenen P1-Scope. Sobald die
Dokumente nachgereicht werden, wird der Plan vor Bau abgeglichen und
Abweichungen werden gemeldet, nicht still gelöst.

Scope-Abgrenzung (was P1 NICHT enthält):
- Keine Zeiterfassungs-Logik (P2).
- Keine Trinkgeld-Felder an `waiter_settlements` oder Abrechnung (P3).
- Keine Pool-Berechnung, kein 2 %-Küchen-Provisionsmodul (P4).
- Keine Skills/Dienstplan (M3).
- Keine UI-Flows. Nur Schema + Stammdaten + RLS + DB-Tests.

### P1.1 — `staff_locations.department`

- Neues Enum `public.staff_department` mit Werten
  `('kitchen','service','gl')`.
- Spalte `staff_locations.department staff_department NOT NULL`.
  Backfill bestehender Zeilen mit `'service'` (Default-Annahme für die
  Migrationsphase; explizit dokumentiert, später per Stammdaten-UI änderbar).
- Unique-Constraint wechselt von `(staff_id, location_id)` auf
  `(staff_id, location_id, department)`. Damit kann ein Mitarbeiter je
  Standort in MEHREREN Abteilungen geführt werden und an verschiedenen
  Standorten unterschiedlich (Vorbild: Alt-System
  `staff_restaurants.zt_department`).
- RLS bleibt unverändert (org-scoped SELECT, Writes service_role).
- Folge-Anpassung in Tests/Seeds: `seedOrg().mkUser()` und alle DB-Tests,
  die `staff_locations` befüllen, setzen explizit `department: 'service'`,
  damit Bestandstests grün bleiben.

### P1.2 — `staff.participates_in_pool`

- Spalte `participates_in_pool boolean NOT NULL DEFAULT true`.
- Semantik (rein deklarativ, KEINE Berechnung in P1): Pool-Teilnahme
  bedeutet später `department ∈ {kitchen, service}` UND
  `participates_in_pool = true`. GL ist strukturell ausgeschlossen
  (auch wenn `participates_in_pool=true` wäre).
- Bestandszeilen erhalten per Default `true`.

### P1.3 — `revenue_channels`: Takeaway-Flag + Vectron + Wolt/SOUSE

- Spalte `is_takeaway boolean NOT NULL DEFAULT false`.
- Per-Location-Seeding (Erweiterung der bestehenden Seed-Routine aus B3
  Teil B):
  - neuer Kind `'delivery_vectron'`, `display_name="Vectron"`,
    `is_takeaway=true`.
  - bestehender Kind `'wolt'`: `is_takeaway=true`.
  - bestehender Kind `'delivery_souse'` (Ex-ordersmart): `is_takeaway=true`.
  - POS-/Tresen-/Bar-Kanäle: `is_takeaway=false`.
- CHECK auf `kind` wird um `'delivery_vectron'` erweitert. Bestehende
  Organisationen erhalten den neuen Kanal per Backfill-INSERT
  (`ON CONFLICT DO NOTHING`).
- Zweck (Doku, keine Implementierung in P1): die spätere 2 %-
  Küchen-Provisionsbasis = Tagesumsatz OHNE Kanäle mit `is_takeaway=true`.

### P1.4 — `location_department_defaults`

Neue Tabelle für Standard-Eincheckzeiten je Standort+Abteilung.

- Spalten:
  - `organization_id uuid NOT NULL` (FK `organizations`)
  - `location_id uuid NOT NULL` (FK `locations`)
  - `department staff_department NOT NULL`
  - `default_checkin time NOT NULL`
  - Standard-Audit-Spalten (`id`, `created_at`, `updated_at`).
- Unique `(location_id, department)`.
- GRANTs: `SELECT` für `authenticated`, `ALL` für `service_role` (kein
  `anon`).
- RLS: `SELECT` org-scoped via `current_organization_id()`; INSERT/UPDATE/
  DELETE bleiben DENY-ALL für PostgREST (Writes ausschließlich
  service_role / spätere Admin-Server-Fn).
- Seed je Standort: `kitchen=15:00`, `service=16:00`. Kein Default-Eintrag
  für `gl` (GL hat keine pool-relevante Standard-Checkin-Zeit).
- Übersteuerung pro Abend: ausdrücklich P2-Scope; in P1 nur Stammdaten-
  Ablage.

### Migrationsreihenfolge (idempotent)

1. `CREATE TYPE public.staff_department` (mit `IF NOT EXISTS` via DO-Block).
2. `ALTER TABLE staff_locations ADD COLUMN department … NULL` →
   Backfill `'service'` → `SET NOT NULL` → Unique-Constraint tauschen.
3. `ALTER TABLE staff ADD COLUMN participates_in_pool …`.
4. `ALTER TABLE revenue_channels ADD COLUMN is_takeaway …` →
   CHECK auf `kind` erweitern → Backfill `is_takeaway=true` für
   `('wolt','delivery_souse')` → Vectron-Kanal je Location einfügen
   (`ON CONFLICT DO NOTHING`).
5. `CREATE TABLE location_department_defaults` + GRANTs + RLS + Policies
   + Seed je bestehender Location.

Reihenfolge folgt dem etablierten Muster
(nullable → backfill → NOT NULL, Constraint-Wechsel mit Drop-vor-Create).
Jede Anweisung mit `IF NOT EXISTS` / `IF EXISTS`, damit die Migration
wiederholt anwendbar bleibt.

### DB-Tests (`*.db.test.ts`)

Neue Suite `src/lib/admin/department-stammdaten.db.test.ts`:
- (a) ein Mitarbeiter kann an einem Standort GLEICHZEITIG für `kitchen`
  und `service` eingetragen werden (neuer Unique-Constraint).
- (b) Doppelter Eintrag `(staff_id, location_id, department)` schlägt fehl.
- (c) `revenue_channels`: nach Migration sind `wolt`, `delivery_souse`,
  `delivery_vectron` je Location vorhanden und `is_takeaway=true`; POS
  `is_takeaway=false`.
- (d) `location_department_defaults`: SELECT als authenticated Manager
  liefert `kitchen=15:00` und `service=16:00`; SELECT aus FREMDER Org
  liefert 0 Zeilen.
- (e) Direkter PostgREST-INSERT/UPDATE/DELETE auf
  `location_department_defaults` als Manager schlägt fehl (DENY-ALL).

Bestehende Tests bleiben unverändert grün; Seed-Helper in
`src/test/db-setup.ts` wird minimal erweitert (Default-Department
`'service'`), kein Verhaltenswechsel für Altertests.

### Gate

- Migration sauber, idempotent, mit RLS und GRANTs.
- `eslint --fix` vor Commit.
- CI: `check` + `db-integration` grün, inkl. neuer Department-Suite.
- Keine Berechnungs-/UI-Änderungen committen.

### Offen (vor Bau-Freigabe zu klären)

1. Backfill `staff_locations.department` mit `'service'` — OK, oder soll
   die Migration für Bestands-Orgs einen anderen Default setzen
   (z. B. anhand des `staff.first_name`-Mappings aus dem Alt-System)?
2. `participates_in_pool` Default `true` für ALLE Bestandsmitarbeiter —
   OK, oder sollen bekannte GL-Personen direkt mit `false` migriert
   werden? In P1 wäre das ein manuelles Update außerhalb der Migration.
3. Vectron-Kind-Bezeichner: `'delivery_vectron'` neutral — bestätigt?
4. `location_department_defaults` ohne `gl`-Seed — bestätigt?

---

## Übernahme Zuordnungen (Stammdaten-Import aus tagesabrechnung)

Ziel: 42 Mitarbeiter-Zuordnungen (Abteilung je Standort) und 82 Skills
aus dem Altsystem `tagesabrechnung` per Server-Function nach COCO
übernehmen, statt manuell zu pflegen. NUR Stammdaten — keine
Pool-Berechnung, keine Zeiterfassung, keine Abrechnung.

### Verifizierte Grundlage (fix)

- `staff_identity_map`: 42/42 verknüpft + bestätigt.
  `alt_id` = UUID der Alt-Personen-ID → Join ohne Namensraterei.
- Restaurant → Location:
  - `Spicery` / `a1710390…` → `44a99e7e-93be-44b1-89ab-38e364a02ddc`
  - `YUM`     / `3065f458…` → `14c2d773-6c5f-4a24-ba00-1c726f277091`
- `zt_department` → `staff_department`-Enum: Küche→`kitchen`,
  Service→`service`, GL→`gl`.
- 62 Zuordnungen (42 MA, 14 mit Mehrfach-Standort), 82 Skill-Einträge.

### Teil X — Skills-Schema (eigene Migration)

COCO hat aktuell kein Skill-Konzept. Wird in derselben Migration mit
angelegt (idempotent, RLS, GRANTs nach Projektstandard).

- **Neuer Typ `public.skill_category`** — eigenständig, NICHT
  `staff_department` wiederverwenden. Werte:
  `'kitchen' | 'service' | 'gl' | 'other'`.
  Begründung: `'other'` (z. B. Hausmeister) darf die pool-relevante
  Abteilungs-/Trinkgeld-Logik nicht verschmutzen; `staff_department`
  bleibt strikt auf pool-/abrechnungsrelevante Werte beschränkt.
- **`skills`** — `id`, `organization_id`, `name`, `category`,
  `color NULL`, `sort_order INT DEFAULT 0`, `created_at/updated_at`.
  Unique `(organization_id, name)`.
- **`staff_skills`** — `staff_id`, `skill_id`, `organization_id`
  (denormalisiert für RLS), Unique `(staff_id, skill_id)`,
  ON DELETE CASCADE auf beiden FKs.
- RLS:
  - SELECT für alle Rollen der Org (`organization_id =
    current_organization_id()`).
  - INSERT/UPDATE/DELETE: DENY-ALL Client (`USING (false)`), Writes
    laufen ausschließlich über Server-Functions mit `supabaseAdmin`.
- GRANTs Standard (`SELECT` an `authenticated`, `ALL` an
  `service_role`).
- **Seed je Org** (idempotent, `ON CONFLICT DO NOTHING`, in der
  Migration UND via Trigger `tg_organizations_seed_skills` analog
  `tg_locations_seed_defaults`, damit auch neu angelegte Orgs den Satz
  bekommen):
  - `kitchen`: `VS`, `PASS`, `SPÜLEN`, `CO`
  - `service`: `SERVICE`, `BAR`
  - `gl`:      `GL`
  - `other`:   `Hausmeister`
- DB-Tests: Seed nach `INSERT INTO organizations` vorhanden; Unique
  greift; RLS-Härtung (Kellner kann Skills nur in eigener Org lesen,
  kein Client-Write).

### Teil Y — `importStaffAssignments` (Server-Function, Admin-only)

Modul: `src/lib/admin/import-assignments.functions.ts` plus reines
Mapping-Modul `src/lib/admin/import-assignments.ts` (keine I/O,
vollständig testbar). UI folgt später; jetzt nur die Funktion +
Tests.

#### Eingabe

```
importStaffAssignments({
  assignments: Array<{ altStaffId: string; altLocationId: string;
                        ztDepartment: 'Küche'|'Service'|'GL' }>,
  skills:      Array<{ altStaffId: string; skillName: string }>,
  mode: 'dry_run' | 'commit',
})
```

CSV-Parsing passiert außerhalb (späterer UI-Schritt). Die Funktion
nimmt bereits geparste, getypte Arrays — so testbar ohne Datei-I/O.

#### Auflösung

- `altStaffId → staff_id` via `staff_identity_map.alt_id` (Org-scoped).
- `altLocationId → location_id` via fixer Map (oben). Unbekannte
  Location → `skippedRows` mit Grund `unknown_location`.
- `ztDepartment → staff_department` via fixem Mapping.
- Skill: per `(organization_id, name)` in `skills` nachschlagen.
  Fehlender Skill → `skippedRows` mit Grund `unknown_skill` (kein
  Auto-Anlegen — Skill-Stammdaten sind kontrolliert).
- Zeilen ohne Treffer in `staff_identity_map` → `skippedRows` mit
  Grund `unknown_alt_staff`. Niemals stumm verlieren.

#### Abteilungen → `staff_locations`

Wahrheit sind die Alt-Daten. Für jeden importierten Mitarbeiter:

1. Sollset bilden: `Set<(staff_id, location_id, department)>` aus
   `assignments` (nach Mapping).
2. Istzustand laden: alle `staff_locations`-Zeilen dieses MA in der
   Org.
3. Diff:
   - **add**:      im Soll, nicht im Ist → INSERT.
   - **keep**:     in beiden → nichts.
   - **remove**:   im Ist, nicht im Soll, **und** `department='service'`
     (P1-Platzhalter) → DELETE. Nicht-Platzhalter-Zeilen (kitchen/gl,
     oder service die explizit im Soll war) werden NIE auto-entfernt
     — Schutz vor versehentlichem Datenverlust bei Re-Import.
   - **replace**:  ergibt sich aus add+remove (gleiche
     `(staff_id, location_id)`, andere department).
4. Idempotent: zweiter Lauf produziert 0 Schreib-Ops.

Begründung der Replace-Strategie: P1 hat für ALLE Bestandsmitarbeiter
`department='service'` als Platzhalter gesetzt. Ein Küchen-MA muss
aktiv von `service` auf `kitchen` umgesetzt werden, sonst landet er
später fälschlich im Service-Pool.

#### Skills → `staff_skills`

- Sollset: `Set<(staff_id, skill_id)>` aus `skills`-Eingabe.
- Istzustand: alle `staff_skills` des MA.
- Diff: add/keep wie oben. **remove** für `staff_skills`: nur wenn
  der Skill nicht im Soll steht — Alt-System ist Wahrheit, weil
  Skills bislang in COCO leer waren. Bei späteren Importen mit
  Teilumfang ist das ein Risiko; deshalb Server-Fn-Param
  `skillsMode: 'merge' | 'replace'` (Default `'replace'` für den
  Erst-Import, später `'merge'`).

#### Dry-Run-Bericht

Strukturiertes Ergebnis (kein freier Text), pro MA:

```
{
  staffId, displayName,
  locations: { added: [...], removed: [...], kept: [...] },
  skills:    { added: [...], removed: [...], kept: [...] },
}
```

Plus Bilanz: `{ staff: 42, assignments: 62, skills: 82,
skippedRows: [...] }`. Dry-Run schreibt nichts und schreibt KEIN
Audit.

#### Commit

- `runGuarded(caller, 'admin', writeAudit, …)` — Admin-only.
- Schreibt in einer logischen Transaktion (Server-Fn-Handler, alle
  Statements sequenziell, bei Fehler abort + sprechender Error).
- Audit-Eintrag `staff.import_assignments` mit Zählern:
  `{ staff, locationsAdded, locationsRemoved, skillsAdded,
  skillsRemoved, skippedCount }` und SHA-256 der normalisierten
  Eingabe (Reproduzierbarkeit).
- Idempotent: zweiter Commit = 0 Änderungen, Audit-Eintrag mit
  Nullzählern (oder gar nicht — Entscheidung: gar nicht, sonst
  vermüllt das Log).

### Tests

- **Unit** (`import-assignments.test.ts`, rein):
  - Mapping `zt_department → staff_department`.
  - Diff-Logik: add/keep/replace/remove, Platzhalter-Schutz.
  - `skippedRows`-Klassifizierung (3 Gründe).
- **DB-Integration** (`import-assignments.db.test.ts`,
  `describe.skipIf(!dbTestsEnabled)`):
  - (a) role-guard: staff/manager → `ForbiddenError`, kein Schreiben.
  - (b) Mehrfachzuordnung: APPEL `kitchen` an beiden Standorten →
    zwei `staff_locations`-Zeilen, beide `kitchen`, keine
    Platzhalter-`service`-Reste.
  - (c) GL-Fall: CHEFIN → `department='gl'`. Bestätigung über
    Lese-Test, dass eine spätere Pool-Query (Platzhalter:
    SELECT … WHERE department IN ('kitchen','service')) sie nicht
    enthält.
  - (d) Platzhalter-Ersetzung: Bestands-MA hat `service`, Alt-Daten
    sagen `kitchen` → nach Commit nur `kitchen`, kein Doppel.
  - (e) Idempotenz: zweiter Commit liefert 0 Schreib-Ops, kein
    zusätzlicher Audit-Eintrag.
  - (f) Dry-Run schreibt nichts (Snapshot vorher/nachher identisch).
  - (g) Unbekannte `altStaffId` / `altLocationId` / `skillName` →
    landen in `skippedRows`, blockieren den Rest nicht.

### Migration

Eine Datei, idempotent:

1. `CREATE TYPE public.skill_category` (`IF NOT EXISTS`-Muster via
   `DO $$ BEGIN … EXCEPTION WHEN duplicate_object THEN NULL; END $$`).
2. `CREATE TABLE public.skills` + GRANTs + RLS + Policies.
3. `CREATE TABLE public.staff_skills` + GRANTs + RLS + Policies.
4. `CREATE OR REPLACE FUNCTION tg_organizations_seed_skills()` +
   Trigger `AFTER INSERT ON public.organizations`.
5. Backfill: für alle bestehenden Orgs den Seed via `INSERT … ON
   CONFLICT DO NOTHING` ausführen.
6. `REVOKE EXECUTE` der Trigger-Function von `PUBLIC`/`anon`/
   `authenticated`.

### Erfolgs-Gate

- Migration idempotent (zweiter Lauf = no-op), RLS + GRANTs sauber,
  `scripts/check-rls-inventory.sql` ohne neue `USING (true)`.
- `eslint --fix` vor Commit, `tsc` grün.
- CI: `check` + `db-integration` grün, inkl. (a)–(g).
- Keine Berechnungs-, UI- oder Auth-Pfad-Änderungen außerhalb des
  Scopes.

### Explizit NICHT in diesem Schritt

- CSV-Parser / Upload-UI (folgt als Mini-Commit, sobald die
  Server-Fn steht und manuell mit den beiden CSVs gefüttert wurde).
- Pool-Berechnung (P4), Zeiterfassung (P2), Abrechnung (P3).
- Verwendung der Skills in Dienstplan/Reports (M3).

### Offene Fragen vor Bau-Freigabe

1. `skillsMode` Default `'replace'` für den Erst-Import — bestätigt?
   (Späterer Teil-Reimport würde `'merge'` brauchen, damit nicht
   versehentlich Skills gelöscht werden, die im Teil-CSV fehlen.)
2. Bei `unknown_skill` (Skill-Name in CSV existiert nicht im Seed):
   skippen ist konservativ. Alternative: Auto-Anlegen mit
   `category='other'`. Empfehlung: skippen + im Dry-Run-Bericht
   listen, damit der Admin entscheidet — bestätigt?
3. Soll der Commit auch eine Zeile `staff.import_assignments` ins
   Audit schreiben, wenn die Bilanz 0/0/0 ist? Empfehlung: nein
   (Log-Hygiene) — bestätigt?

---

## Personaldaten Welle 1 — echte Namen + Lohnbasis (42 MA)

Übernahme aus tagesabrechnung-Alt-`staff` (CSV-Export, 43 Zeilen). Architektur
exakt nach Vorbild von `importStaffAssignments` (createServerFn-Stack unter
`src/lib/admin/`, Dry-Run + Commit + Audit). **Keine** Edge Function.

Quellfelder pro Zeile: `alt_staff_id`, `first_name`, `last_name`, `nickname`,
`perso_nr`, `hourly_rate`, `employment_start`. `contracted_hours` ist im Alt
bei allen leer (Spalte wird trotzdem angelegt, bleibt NULL).

Erwartete Bilanz: **42 MA · 42 staff-Updates · 42 comp-UPSERTs · 1 skipped**
(der namenlose Geist-Datensatz `6756a58e…`, ohne `staff_identity_map`-Treffer).

### Teil A — Migration (Schema)

Eine Datei, reine Spalten-Ergänzung an `public.staff`:

- `ADD COLUMN perso_nr integer NULL`
- `ADD COLUMN contracted_hours_per_month numeric NULL`

Keine neuen Tabellen, keine RLS-Änderung, kein neuer Trigger.
`staff_compensation` (mit `hourly_rate`, `valid_from`, Unique auf `staff_id`)
existiert bereits und bleibt unverändert. Bestehende staff-Tests bleiben
unbeeinflusst (additive Spalten, NULL-default).

### Teil B — `importStaffPersonalData` (Server-Fn-Stack)

Fünf Dateien analog zu `importStaffAssignments`:

- `src/lib/admin/import-personal.ts` — pures Mapping/Diff, keine I/O.
  Eingabe je Zeile:
  `{ altStaffId, firstName, lastName, nickname, persoNr, hourlyRate, employmentStart }`.
  Liefert `PersonalPlan` mit `perStaff[]` (Felder vorher/nachher, Flag
  `compFallback`) + `skippedRows[]` + `totals`.
- `src/lib/admin/import-personal-core.ts` — I/O. Auflösung über
  `staff_identity_map` (gleiche Logik wie `import-assignments-core.ts`),
  lädt bestehende `staff`- und `staff_compensation`-Zeilen, ruft das
  Mapping, schreibt im Commit-Pfad. Schreibt **kein** audit_log selbst.
- `src/lib/admin/import-personal.functions.ts` — `createServerFn`,
  `.middleware([requireSupabaseAuth])`, `runGuarded(caller, 'admin', …)` +
  `writeAuditLog`, `mode: 'dry_run' | 'commit'`. Bei 0/0/0 kein Audit
  (Log-Hygiene wie bei Assignments).
- `src/lib/admin/import-personal.test.ts` — Unit (rein).
- `src/lib/admin/import-personal.db.test.ts` — DB-Integration.

#### Verarbeitung je Zeile

1. `altStaffId` → COCO `staff_id` via `staff_identity_map`
   (`source_system='tagesabrechnung'`, `confirmed_at NOT NULL`).
   Kein Treffer → `skippedRows` mit `reason='unknown_alt_staff'`. Der
   Geist landet hier (erwartet).
2. `staff`-Update (nur wenn Diff vorhanden):
   - `first_name` 1:1 aus CSV, **inkl.** Klammer-Spitzname wie
     `"Phattanaphol (ANDI)"` — nicht aufsplitten, nicht rausparsen.
   - `last_name` 1:1.
   - `display_name` = alt `nickname` (1:1, auch bei leer → leer).
   - `perso_nr` 1:1 (integer; leer in CSV → NULL).
3. `staff_compensation`-UPSERT (Unique auf `staff_id`):
   - `hourly_rate` 1:1, **auch `0`** (NET hat 0 — bewusst, keine
     Sonderbehandlung, kein Skip).
   - `valid_from = employment_start` aus CSV.
   - Fallback: `employment_start` leer (Andre, NET) →
     `valid_from = current_business_date()` (heute, in Berlin-TZ via
     bestehender DB-Function). Im `PersonalPlan` als
     `compFallback: true` markiert, im Dry-Run-Bericht hervorgehoben.
   - Eintrag existiert (per `staff_id`) → UPDATE; sonst INSERT.

#### Eingabe-Schema (Zod, in `import-personal.functions.ts`)

```ts
{
  rows: [{ altStaffId: string, firstName: string, lastName: string,
           nickname: string, persoNr: number|null,
           hourlyRate: number, employmentStart: string|null }],
  mode: 'dry_run' | 'commit',
  sourceSystem: 'tagesabrechnung'  // default
}
```

#### Bericht (`PersonalPlan`)

- `totals`: `staff`, `nameUpdates`, `compInserts`, `compUpdates`,
  `compFallbacks`, `skippedCount`.
- `perStaff[]`: `staffId`, `nameDiff` (alt → neu pro Feld),
  `compDiff` (alt → neu Lohn + valid_from), `compFallback`.
- `skippedRows[]`: `{ reason, altStaffId, … }`.

#### Idempotenz & Audit

- Zweiter Commit identischer Eingabe = 0 Schreib-Ops, kein Audit.
- Audit-Eintrag (nur bei Schreib-Bilanz > 0):
  `action='staff.import_personal_data'`, `entity='staff'`, `meta` mit
  Zählern + `inputHash` (gleicher `hashInput`-Helper wie Assignments).

### Teil C — UI-Erweiterung

Bestehende Route `/admin/import-zuordnungen` um einen zweiten Abschnitt
**„Personaldaten (Welle 1)"** erweitern (Datei bleibt
`src/routes/_authenticated/admin/import-zuordnungen.tsx`):

- Eigener CSV-Upload (Spalten siehe Quellfelder, Semikolon-Trenner, BOM-Strip).
- Eigener Parser unter `src/lib/admin/import-personal-csv.ts` + Unit-Test.
- Eigener Dry-Run-Button → eigener Commit-Button (disabled bis Dry-Run
  durchlief und `window.confirm` mit Bilanz bestätigt wurde).
- Bericht analog `PlanReport`, mit Fallback-Markierung.
- Beide Abschnitte unabhängig (eigene `useMutation`-Paare).

### Tests

- **Unit (`import-personal.test.ts`)**:
  (a) Namens-Update inkl. Klammer-Spitzname bleibt erhalten;
  (b) `hourlyRate=0` wird als UPSERT geschrieben, nicht geskippt;
  (c) `employment_start` leer → `compFallback=true`, `valid_from=heute`;
  (d) unbekannte `altStaffId` → `skippedRows`;
  (e) Idempotenz: zweiter Lauf mit identischer Eingabe + gleichem
      Bestand liefert 0 Ops.
- **DB (`import-personal.db.test.ts`)**:
  (f) Namen-Update inkl. Klammer-Spitzname tatsächlich in `staff` sichtbar;
  (g) `staff_compensation` UPSERT-Pfad: erst INSERT (neuer MA), dann
      UPDATE (geänderter Stundenlohn) — Unique `staff_id` greift;
  (h) `valid_from`-Fallback bei leerem `employment_start`;
  (i) Geist (kein identity_map-Treffer) → `skippedRows`,
      `staff`/`staff_compensation` unverändert;
  (j) Role-Guard: non-admin Aufruf wirft `ForbiddenError`, kein
      Schreibvorgang, kein Audit-Eintrag.
- **CSV-Parser-Test** (`import-personal-csv.test.ts`):
  Klammer-Spitzname bleibt im `first_name`-Feld; leere `hourly_rate` →
  Fehler/Warnung (Pflichtfeld); leeres `employment_start` ist erlaubt.

### Explizit NICHT in Welle 1

SV-Nummer, `tax_id`, IBAN/BIC, `date_of_birth`, Adresse, Krankenkasse,
`employment_type`, Urlaubs-/Kranktage-Salden → **Welle 2**, eigenes
Schema mit strengerer RLS (z. B. nur Admin lesend), separater Plan,
separater Commit.

### Erfolgs-Gate

- Migration additiv, idempotent, ohne RLS-Aufweichung.
- `eslint --fix` vor Commit, `tsc` grün.
- CI `check` + `db-integration` grün inkl. (a)–(j).
- Bilanz im Dry-Run mit den echten 43 Zeilen: 42 MA / 42 staff-Updates /
  42 comp-UPSERTs / 1 skipped (Geist). Abweichung → melden, nicht
  schlucken.

### Offene Fragen vor Bau-Freigabe

1. `display_name` = `nickname` 1:1 (auch leer übernehmen) — bestätigt?
   Alternative: bei leerem `nickname` `display_name` unangetastet lassen.
2. `perso_nr` leer in CSV → NULL schreiben (überschreibt ggf. bestehende
   Nicht-NULL) oder bei leer **nicht** anfassen? Empfehlung: bei leer
   **nicht** anfassen (defensiv, kein Datenverlust) — bestätigt?
3. Fallback-Datum bei fehlendem `employment_start`: heute
   (`current_business_date()`) statt z. B. `2026-01-01`? Empfehlung:
   heute, damit klar erkennbar „Schätzwert, bitte nachtragen" —
   bestätigt?
