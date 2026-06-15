## Ziel

Admin/Manager kann auf `/admin/kasse` Kellner-Abrechnungen **manuell anlegen** (zusätzlich zur bestehenden Korrektur-Funktion). Reine Geld-Erfassung, **kein Auto-Clockout**, Kitchen-Tip-Rate aus aktuellen Org-Settings.

## Geltungsbereich (UI/Logik)

Nur Frontend + ein neuer Server-Fn. Keine Schema-Migration nötig — `waiter_settlements` hat bereits alle benötigten Spalten. Bestehende Korrektur-Logik (`correctWaiterSettlement`) und Submit-Logik (`submitWaiterSettlement`) bleiben unangetastet.

## Änderungen

### 1) `src/lib/cash/cash.functions.ts` — neuer Server-Fn `adminCreateWaiterSettlement`

- Input (Zod): `sessionId`, `staffId`, `posSalesCents`, `cardTotalCents`, `hilfMahlCents`, `openInvoicesCents`, `cashHandedInCents`, `reason` (min. 3 Zeichen, Pflicht).
- `loadAdminCaller(..., "manager")` + `runGuarded` (gleicher Wächter wie `correctWaiterSettlement`).
- Session laden (`loadSessionWithLock`), `assertCashWritable` mit Wasserlinie der Session-Location (gleiche Regeln wie Korrektur: erlaubt bei open/finalized, gesperrt bei locked/Wasserlinie).
- Validierung: Staff muss zur `session.location_id` gebunden sein (`assertStaffBoundToLocation`).
- Duplikate verhindern: existiert für `(session_id, staff_id)` bereits eine Zeile mit `status != 'superseded'`, Fehler `WaiterSettlementAlreadyExistsError` (klare Meldung "Bitte Korrektur statt Neuanlage verwenden").
- Berechnung über `calcWaiterSettlement` mit `kitchenTipRate` aus aktuellen `organization_settings` (kein Snapshot eines Originals — es gibt keins).
- Insert: `status = 'submitted'`, `submitted_at = now()`, **kein** `auto_clockout_time_entry_id`, **kein** `corrected_from_id`.
- Audit: `action: "cash.settlement.admin_created"` mit `meta: { businessDate, sessionId, staffId, reason }`.

### 2) `src/routes/_authenticated/admin/kasse.tsx` — UI

- Neuer Button "Neue Abrechnung" im Header von `SettlementsCard`, disabled wenn `!correctable`.
- Neuer State `createSettlement` (analog zu `correct`), neuer Dialog mit:
  - Select für Kellner (aus `staffQ.data`, gefiltert auf an Session-Location gebundene aktive Staff).
  - 5 Geld-Inputs (POS / Karte / Hilf / Offen / Bargeld) — wiederverwendetes Layout der Korrektur.
  - Grund-Feld (Pflicht, min. 3 Zeichen).
- `useMutation` ruft neuen `adminCreateWaiterSettlement` Server-Fn auf, anschließend `invalidate()` + Toast.
- Bei `WaiterSettlementAlreadyExistsError`: Hinweis-Toast "Existiert bereits — bitte Korrektur verwenden".

## Tests

- Neuer DB-Test `cash-admin-create-settlement.db.test.ts`:
  - (a) Happy Path: Insert → Zeile mit `status='submitted'`, korrekt berechnete `differenz_cents` / `kitchen_tip_cents`.
  - (b) Duplikat → `WaiterSettlementAlreadyExistsError`.
  - (c) Staff nicht an Location gebunden → `StaffLocationNotBoundError`.
  - (d) Wasserlinie aktiv → `CashLockedError`.
  - (e) Kein Auto-Clockout: `auto_clockout_time_entry_id IS NULL`.

## Bewusst NICHT enthalten

- Keine Schema-Migration.
- Keine Änderung an `submitWaiterSettlement` / `correctWaiterSettlement`.
- Kein Auto-Clockout (per Userentscheid).
- Keine Änderung am Layout/Optik der bestehenden Tabelle.
