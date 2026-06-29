## Ziel
Manager/Admin sollen im Dienstplan-Popover (leere Zelle) einen **Wunschfrei**-Eintrag für den jeweiligen Mitarbeiter und Tag manuell setzen/entfernen können. Die Datenquelle ist die bereits genutzte `day_off_wishes`-Tabelle und der bestehende `getDayOffWishes`/`wishMap`-Pfad. Nur die manuelle Manager-Erfassung fehlt.

Keine Änderungen an Schema, RLS, Mitarbeiter-Self-Service (`/zeit/wuensche`), Berechnungen oder anderen Popovern.

## Änderungen

### 1) `src/lib/roster/roster.functions.ts` — zwei neue Server-Fns
- `createDayOffWishFor({ staffId, wishDate, note? })`: nutzt `loadAdminCaller(..., "manager")`, schreibt per Upsert in `day_off_wishes` mit `organization_id` des Callers, `onConflict: "staff_id,wish_date"`. Optional `note` (max 200, trim → null).
- `deleteDayOffWishFor({ staffId, wishDate })`: Manager-Caller, löscht den passenden Eintrag in der Caller-Org.
- Beide schreiben einen Audit-Log-Eintrag (`runGuarded`-Muster wie bei anderen Manager-Aktionen im File, z. B. Release).

Bestehende `createDayOffWish`/`deleteDayOffWish` (Self-Service) bleiben unverändert.

### 2) `src/components/roster/CellQuickPopover.tsx` — neue Pille
Neue Props: `hasWish: boolean`, `onSetWish: () => void`, `onClearWish: () => void`.
Im Aktionen-Block (unter „Als nicht verfügbar", über/unter Urlaub/Krank) eine weitere Button-Zeile:
- Icon: `Heart` (lila, `text-purple-600`) — passt zum bestehenden „lila Herz"-Konzept der Wünsche.
- Label: `hasWish ? "Wunschfrei entfernen" : "Wunschfrei eintragen"`.
- Klick ruft entsprechend `onClearWish`/`onSetWish` auf, schließt das Popover.

### 3) `src/components/roster/RosterGrid.tsx` — Props durchreichen
- Neue Cell-Props `hasWish`, `onSetWish`, `onClearWish` aus den bestehenden Zellen-Render-Pfaden (`CellQuickPopover`-Aufruf bei Zeile 798–816). Lookup analog zu `isUnavailable`/`absenceType` über einen neuen `wishSet`/`wishMap`-Prop am Grid (Key `staffId|iso`).
- Grid-Top-Level-Prop: `wishSet: Set<string>`, `onSetWish(staffId, iso)`, `onClearWish(staffId, iso)`.

### 4) `src/routes/_authenticated/admin/dienstplan.tsx` — Mutationen + Verdrahtung
- `wishMap` existiert bereits → zusätzlich `wishSet` (Keys) ableiten oder vorhandene Map nutzen.
- Zwei `useMutation`s: `setWishM` (ruft `createDayOffWishFor`), `clearWishM` (ruft `deleteDayOffWishFor`). `onSuccess` → `qc.invalidateQueries({ queryKey: ["day-off-wishes"] })` und Toast.
- An `RosterGrid` durchreichen:
  - `wishSet`
  - `onSetWish: (staffId, iso) => setWishM.mutate({ data: { staffId, wishDate: iso } })`
  - `onClearWish: (staffId, iso) => clearWishM.mutate({ data: { staffId, wishDate: iso } })`
- Realtime-Subscription auf `day_off_wishes` ist schon vorhanden — UI aktualisiert sich automatisch.

## Stil/Fallen
- Nur Wunschfrei-Pille im **leeren** Cell-Popover (Bildkontext). PillConfirmPopover (bestehende Schicht) nicht anfassen.
- Keine Schema-/Migrations-Änderung — `day_off_wishes` und RLS existieren bereits.
- Audit-Log analog zu vorhandenen Manager-Mutationen, keine neuen Action-Namen außer `roster.wish.set_for` / `roster.wish.clear_for`.
- TypeScript strikt, kein `any`. Prettier + ESLint clean.

## Verifikation
- `bunx tsgo --noEmit`, `bunx eslint`, `bunx vitest run` grün.
- Manuell: leere Zelle anklicken → neue Pille „Wunschfrei eintragen" sichtbar; nach Klick erscheint lila Herz-Marker in der Zelle, Toggle-Text wechselt; Realtime-Update aus dem Self-Service-Pfad weiterhin funktional.
