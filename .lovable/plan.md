## Ziel
1. Standort-Präfix (`spicery:`, `yum:`, `tsb:`) aus dem Besonderheiten-Feld entfernen — Zusammenfassung + Buchhaltung.
2. Zwei neue Notiz-Arten neben der bestehenden Freitext-Notiz je Periode:
   - **Ratennotiz** — läuft über N Abrechnungsperioden und verschwindet danach automatisch (z.B. „Darlehen 500 €/Monat, 6 Raten").
   - **Dauer-Notiz** — bleibt permanent bei jedem Lohnlauf sichtbar, bis sie aktiv beendet wird (z.B. „Pfändung", „Lohnabtretung", „VWL 40 €").

## Änderung 1 — Standort-Präfix raus
`src/routes/_authenticated/admin/zeit-uebersicht.tsx`, Merge in `notesByStaff` (~Z. 512): beim „Alle Standorte"-Zusammenführen KEIN `${loc.name}: …` mehr. Mehrere nicht-leere Notizen weiterhin mit ` · ` verbunden. Vorschuss-Summe unverändert. Kein Server-/Schema-Eingriff.

## Änderung 2 — Wiederkehrende und Dauer-Notizen

### Datenmodell (eine Tabelle für beide Arten)
Neue Tabelle `public.payroll_recurring_notes`:
- `id uuid pk`, `organization_id uuid`, `staff_id uuid`, `location_id uuid null` (null = alle Standorte)
- `kind text check (kind in ('rate','dauer'))`
- `text text not null` (max 200), z.B. „Darlehen Rate 500 €" oder „Pfändung Amtsgericht Köln"
- `first_period_start date not null` — ab welcher Periode erstmals anzeigen
- `periods_total int null` — nur für `kind='rate'` gesetzt (1–60); bei `kind='dauer'` NULL = unbegrenzt
- `canceled_at timestamptz null` — beendet die Notiz vorzeitig (für beide Arten)
- Audit-Felder + Constraint: `(kind='rate' and periods_total is not null) or (kind='dauer' and periods_total is null)`

RLS: `organization_id`-Scoping analog `payroll_notes`; SELECT für manager/admin/payroll, INSERT/UPDATE (cancel) nur manager/admin. GRANTs authenticated + service_role.

### Aktive-Berechnung (rein)
Neues Modul `src/lib/time/recurring-notes.ts`:
- `isActive(rec, currentPeriodStart, periodsElapsed)`:
  - `canceled_at` gesetzt → inaktiv
  - `currentPeriodStart < first_period_start` → inaktiv
  - `kind='dauer'` → aktiv
  - `kind='rate'` → aktiv, solange `periodsElapsed < periods_total`
- `periodsElapsed` = Index der aktuellen Periode zwischen `first_period_start` und heute, abgeleitet aus dem bestehenden Perioden-Generator (5/24–5/23), damit unregelmäßige Längen egal sind.
- Anzeige-Format:
  - `rate` → `"<text> · <n>/<total>"`
  - `dauer` → `"<text>"` (kein Zähler)
- Tests: Rate 1/6, 6/6, 7/6 = inaktiv; Dauer bleibt aktiv über beliebig viele Perioden; canceled = inaktiv; Standortbindung respektiert.

### Server-Funktionen (in `time-admin.functions.ts`)
- `listRecurringNotes({ periodStart, periodEnd, locationId? })` — liefert alle aktiven Einträge inkl. `displayText`, `kind`, `remainingPeriods|null`.
- `createRecurringNote({ staffId, locationId|null, kind, text, firstPeriodStart, periodsTotal? })` — Zod-validiert, Audit `payroll_recurring_note.create`.
- `cancelRecurringNote({ id })` — setzt `canceled_at`, Audit `payroll_recurring_note.cancel`.
Alle nur manager/admin.

### UI in `PayrollTab`
Im Besonderheiten-Cell drei Schichten übereinander:
1. Aktive Ratennotizen als Badge mit Zähler `3/6`.
2. Dauer-Notizen als Badge in klar unterscheidbarer Optik (z.B. anderer Ton + Icon „Pin"), damit „läuft dauerhaft" auf einen Blick erkennbar ist.
3. Editierbares Freitext-Feld wie bisher.

Kleiner „+"-Button öffnet Popover mit Auswahl **Rate | Dauer**:
- Rate: Text, Anzahl Perioden (1–24), Startperiode (default aktuelle).
- Dauer: Text, Startperiode (default aktuelle) — kein Perioden-Feld.
„X" pro Chip → cancel (mit Bestätigungsdialog bei Dauer-Notizen, um versehentliches Beenden zu vermeiden).

Für payroll-Rolle: nur Anzeige, kein +/X.

### Zusammenfassung + Buchhaltungs-Export
- `buchhaltung-export.ts`, `besonderheiten`-Feld: bestehende Kombination `absenceNote` + Freitext um `recurringText` ergänzen (` · `-getrennt); Rate und Dauer werden dabei gleich behandelt — Unterscheidung ist rein UI, für den Lohnbüro-Export zählt der Textinhalt.
- Zusammenfassungs-Tab in `zeit-uebersicht.tsx` analog anzeigen.

## Betroffene Dateien
- Migration: neue Tabelle + RLS + Grants + Check-Constraint
- `src/lib/time/recurring-notes.ts` (neu) + Test
- `src/lib/time/time-admin.functions.ts` (list/create/cancel)
- `src/lib/time/buchhaltung-export.ts` (zusätzlicher Textteil)
- `src/routes/_authenticated/admin/zeit-uebersicht.tsx` (Präfix raus, Notes-Merge, Zusammenfassung)
- `src/components/zeit/PayrollTab.tsx` (Chips Rate/Dauer + Popover)
