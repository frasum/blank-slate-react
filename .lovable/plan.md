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
