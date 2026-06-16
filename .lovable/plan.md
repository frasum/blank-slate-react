# Paar-Abrechnung für Kasse (COCO-Schnitt, a/a)

## Entscheidung

- **Max. 2 Kellner** pro Abrechnung (Haupt + optionaler Partner) als FK auf `staff`.
- **Kein** `participates_in_pool`-Flag — Pool-Teilnahme bleibt allein über Stunden (`time_entries`) bzw. `session_tip_pool_entries` gesteuert. Beide Kellner zählen damit als reguläre Pool-Teilnehmer mit ihren eigenen Stunden.
- **Anlage** über ein optionales Feld „Partner-Kellner" im bestehenden Dialog „Neue Abrechnung" / Korrektur.

## Abgrenzung zu Tagesabrechnung (bewusst anders)

| Aspekt | Tagesabrechnung | COCO (geplant) |
|---|---|---|
| Anzahl Kellner | 1 Haupt + 1 zweiter + Liste „weitere" | max. 2 (Haupt + Partner) |
| Speicherung | freie Namen (TEXT, TEXT[]) | FK auf `staff` (uuid) |
| Pool-Opt-out | `participates_in_pool` boolean | keine — Pool aus Stunden/Pool-Einträgen |

## Umsetzung

### 1. Migration

- `ALTER TABLE public.waiter_settlements ADD COLUMN partner_staff_id uuid NULL REFERENCES public.staff(id) ON DELETE RESTRICT;`
- CHECK: `partner_staff_id IS NULL OR partner_staff_id <> staff_id`.
- Partieller Unique-Index, damit der Partner nicht doppelt aktiv ist:
  ```sql
  CREATE UNIQUE INDEX waiter_settlements_active_partner_unique
    ON public.waiter_settlements (session_id, partner_staff_id)
    WHERE partner_staff_id IS NOT NULL AND status <> 'superseded';
  ```
- Server-seitiger Cross-Check in der SFN: keine aktive Zeile mit `staff_id = NEW.partner_staff_id` und keine mit `partner_staff_id = NEW.staff_id` in derselben Session.
- Index `ws_partner_idx` auf `(organization_id, partner_staff_id)`.
- RLS-Policy `ws_select_own_staff` um `OR partner_staff_id = public.current_staff_id()` erweitern, damit der Partner die gemeinsame Zeile lesen darf. Insert-/Update-Policies bleiben strikt auf den Haupt-Kellner (`staff_id`) gebunden.

### 2. Server-Functions (`src/lib/cash/cash.functions.ts`)

- `createWaiterSettlement` / `correctWaiterSettlement`: optionales `partnerStaffId` im Zod-Schema. Validierungen:
  - Partner aktiv, gleiche Org, gleiche Location.
  - Partner ≠ Haupt-Kellner.
  - Keine kollidierende aktive Settlement → klarer Fehlertext.
- `overview` / Tip-Pool-SFNs: `partner_staff_id` mit selektieren; im Mapping `staffName` als „Haupt + Partner" zusammensetzen (z. B. `"Andi + Kriss"`).
- **Reine Berechnungs-Module bleiben unverändert** (`waiter-settlement.ts`, `cash-ledger.ts`, `tip-pool.ts`, `safe-balance.ts`). Die Pool-Auflösung führt den Partner schlicht als zweiten regulären Teilnehmer mit seinen eigenen Stunden zu.

### 3. UI (`src/routes/_authenticated/admin/kasse.tsx`)

- Dialog „Neue Abrechnung": zusätzlicher Select „Partner-Kellner (optional)" unter dem Kellner-Select, gleiche Filter (aktiv, location), Option „—" = kein Partner.
- Korrektur-Dialog analog mit vorbelegtem Partner.
- `SettlementsCard`-Tabelle, Spalte „Kellner": zeigt `"Haupt + Partner"`, kleines dezentes Badge „Paar".
- Trinkgeld-Pool-Karte: keine Änderung am Verhalten — beide Kellner erscheinen ohnehin als separate Zeilen über Stunden/Pool-Einträge.

### 4. Tests (vitest)

- Bestehende Tests bleiben grün (reine Rechenmodule unverändert).
- Neue DB-Tests in `src/lib/cash/*.db.test.ts`:
  - Paar-Abrechnung anlegen → eine Zeile, beide IDs gesetzt, Differenz wie ohne Partner.
  - Kollision: Partner hat bereits aktive eigene Settlement → klarer Fehler.
  - Kollision: zweiter Versuch denselben Partner zu nutzen → Unique-Verstoß abgefangen.
  - Korrektur einer Paar-Abrechnung → neue Zeile, beide IDs, alte = `superseded`.
  - RLS: Partner kann die gemeinsame Zeile lesen, aber nicht ändern.
  - Tip-Pool: beide Kellner mit eigenen Stunden im Pool sichtbar.

### 5. Gates vor Commit

- `npx prettier --write` auf geänderte Dateien
- `npx tsc --noEmit` → 0
- `npx eslint . --max-warnings=5` → 0
- `npx vitest run` → grün

## Bewusst NICHT enthalten

- Keine `additional_waiters`-Liste (>2 Kellner).
- Kein `participates_in_pool`-Flag.
- Keine Änderung an `cash-ledger`, `tip-pool`, `safe-balance`, `waiter-settlement` (reine Berechnung).
- Keine UI-Änderungen außerhalb von `kasse.tsx`.
- Keine Datenmigration bestehender importierter Anzeigenamen wie „Andi + Kriss" in Paar-Form — separater Auftrag.
