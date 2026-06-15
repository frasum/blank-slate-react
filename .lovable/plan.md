## Ziel
Die Kasse-Seite (`/admin/kasse`) auf den gewohnten **Tagesabrechnung**-Look bringen – gleiche Überschriften, Reihenfolge, Datums-Picker, PDF-Export – plus drei neue Felder, die das Team aus der alten App kennt: **Gästezahl**, **Gutscheine verkauft**, **Gutscheine eingelöst**.

## Empfehlungen zu den offenen Punkten
- **Layout:** *Sektionen-Variante* (nicht 1:1 das alte `ExcelLayout`). Vertraute Begriffe und Reihenfolge in unserem flexiblen Cent-Schema.
- **Datenfelder:** Bestehende `revenue_channels` (POS/SOUSE/Wolt/Vectron) und `payment_terminals` weiternutzen + **3 neue Spalten in `sessions`**.
- **Umfang:** PDF + DateSelector (◀ Kalender ▶ Heute) – beides.

## Schema-Änderung (eine Migration)
`ALTER TABLE public.sessions ADD COLUMN`:
- `guest_count integer NOT NULL DEFAULT 0` – Gästezahl
- `vouchers_sold_cents integer NOT NULL DEFAULT 0` – Gutschein-Verkauf (€-Cents)
- `vouchers_redeemed_cents integer NOT NULL DEFAULT 0` – Gutschein-Einlösung (€-Cents)

CHECK-Constraints: `>= 0`. Keine neuen Policies (sessions hat schon RLS). Cent-Konvention bleibt projektweit konsistent.

## Server-Functions (minimal-invasiv)
Bestehende `updateSession` in `src/lib/cash/cash.functions.ts` um die drei optionalen Felder erweitern (gleiches Schreib-Gate `status='open' && !underWaterline`). `getCashOverview` liefert sie automatisch mit `select *` zurück; im DTO ergänzen.

## UI-Umbau `src/routes/_authenticated/admin/kasse.tsx`
Reiner Frontend-Refactor; Reihenfolge wie in der alten Tagesabrechnung:

```text
Header:  Kasse · Mittwoch, 15. Juni 2026
         [DateSelector ◀ Kalender ▶ Heute]  [PDF Export]
         Erstellt von … · Zuletzt bearbeitet von …

[SessionLockedBanner – nur wenn gesperrt]

StatCards-Reihe:  Kassiert · Karten · Lieferdienste · Bargeld

▸ Gäste & Gutscheine          ← NEU: guest_count, vouchers_sold, vouchers_redeemed
▸ Umsätze (Kanäle)            – revenue_channels
▸ Karten-Terminals            – payment_terminals
▸ Kellner-Abrechnungen        – waiter_settlements (unverändert)
▸ Trinkgeld-Pool              – TipPoolOverview (unverändert)
▸ Vorschüsse                  – session_advances
▸ Ausgaben                    – session_expenses
▸ Banktresor / Übergaben      – session_register_transfers + bank_deposits
▸ Notizen
▸ Status & Abschluss          – finalize/lock-Buttons (unverändert)
```

Neue/portierte Komponenten (rein präsentational, in `src/components/cash/`):
- `DateSelector.tsx` – 1:1 Port (ChevronLeft / Popover-Kalender / ChevronRight / „Heute"). Geschäftstag-Cutoff 03:00 Europe/Berlin via kleinem `businessDate.ts`-Helper.
- `StatCard.tsx` – KPI-Kachel (Label, Wert, optional Differenz-Pille).
- `SectionCard.tsx` – Karten-Wrapper mit gewohntem Titel-Stil.
- `GuestsVouchersSection.tsx` – Zahl-Input (Gäste) + zwei `CurrencyInput` (Gutscheine verkauft/eingelöst), Auto-Save via `updateSession`-Mutation.

## PDF-Export
Neue Server-Function `exportDailySummaryPdf` in `src/lib/cash/pdf.functions.ts`:
- liest `getCashOverview` + `getTipPoolOverview` server-seitig,
- rendert mit `pdf-lib` (Worker-kompatibel; kein jsPDF/DOM nötig),
- gibt Bytes als `Uint8Array` zurück.

Client zeigt das PDF im bestehenden `Dialog` als Vorschau (Blob-URL im iframe) und bietet Download `Tagesabrechnung_YYYY-MM-DD.pdf`. PDF-Inhalt: Kopf (Datum, Standort, Ersteller) · **Gäste & Gutscheine** · Umsätze · Karten · Kellner · Trinkgeld-Pool · Ausgaben/Vorschüsse · Saldo.

## Bewusst NICHT enthalten
- Kein Spicery-Zähler, keine weiteren Sonderfelder (erst auf Bestellung).
- Keine Änderung an `cash.functions.ts`-Signaturen außer `updateSession`-Payload.
- Kein Eingriff in Dienstplan, Zeiterfassung, Auth oder `kasse-saldo.tsx`.

## Akzeptanz
- Drei neue Felder erscheinen oben in „Gäste & Gutscheine" und sind speicher-/sperr-kompatibel.
- Header zeigt Datum als `EEEE, d. MMMM yyyy` (de) + DateSelector ◀ Kalender ▶ Heute.
- Sektions-Überschriften und Reihenfolge entsprechen der alten Tagesabrechnung.
- PDF-Export-Button öffnet Vorschau, listet auch Gäste & Gutscheine.
- Build grün, eine neue Migration, keine RLS-Lücken.
