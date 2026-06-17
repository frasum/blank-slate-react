## Ziel

Der „Tagesabrechnung exportieren"-Button auf `/admin/kasse` soll dasselbe einseitige, zweispaltige Layout drucken wie das Tagesabrechnung-Projekt im hochgeladenen YUM-Screenshot — statt der heutigen vertikalen Tabellenliste.

## Scope

- **Ausschließlich Präsentation.** Keine neue Server-Function, kein neuer Endpoint, keine DB-Änderung, keine Migration, keine Änderung der bestehenden SFN-/Lohn-Module.
- Datenquelle bleibt unverändert: `getCashOverview` + `listRevenueChannels` + `listPaymentTerminals` + `listStaff`. Daten liegen bereits in `kasse.tsx` vor und werden schon heute in `generateDailySummaryPdf({...})` geschoben.
- Eine Seite, A4 hoch. Kein Mehrseiten-Anhang (Vorschuss-Quittungen werden nicht gebaut — das ist eigene Stufe).

## Layout (Reihenfolge wie im Screenshot)

Header (zentriert): `«Standortname» · «Wochentag, T. Monat»`, darunter klein „Erstellt von … · Export TT.MM.JJJJ HH:MM von …".

Zwei Spalten unter dem Header:

**Linke Spalte — Sektionen (alle Beträge €):**
- **Umsatz** — POS-Umsatz (= Summe channelAmounts mit `kind = "pos"`). Falls `session.guest_count > 0`: kleine Zeile „Gäste: N · ⌀ X,XX € / Gast" (POS / Gäste).
- **Kartenzahlung** — KK (Terminal) = Summe `terminalAmounts`.
- **Take Away** — je eine Zeile pro vorhandenem Lieferkanal (`delivery_souse`, `delivery_wolt`, `delivery_vectron`) mit Channel-Label aus `listRevenueChannels`.
- **Gutscheine & Abzüge** — Gutscheine EL (`voucher_redeemed`), Gutschein Verkauf (`voucher_sold`), FineDine (`finedine`, nur wenn ≠ 0), Offen (= Σ `open_invoices_cents` aktiver Settlements), Personal (= Σ `advances.amountCents`), Einladung (`einladung`), Sonstige Einnahmen (`sonstige`), Bar Ausgaben (= Σ `expenses.amountCents`).
- **Ergebnis** — Tages-Bargeld (grün/rot je Vorzeichen), Hilf Mahl (= Σ `hilf_mahl_cents`), darunter umrahmt fett „Differenz zum Wechselgeldbestand".

Formel Tages-Bargeld (rein clientseitig, identisch zur Logik der Vorlage):
```
bargeld = Σ kassiert_brutto  (POS + Σ Settlements.cash_handed_in_cents wenn vorhanden)
        − Σ open_invoices − Σ hilf_mahl
        − advances − einladung − ausgaben
        + sonstige_einnahme − voucher_sold + voucher_redeemed
```
(Exakte Reproduktion der Vorlagen-Formel aus dem Quellprojekt; die hier verwendeten Felder sind alle bereits im `getCashOverview`-DTO vorhanden.)

**Rechte Spalte:**
- Tabelle **Mitarbeiter · Umsatz · Abgabe · Geänd. · TG** — eine Zeile je Settlement (Partner wird als zusätzlicher Eintrag mit halbiertem Umsatz dargestellt, wie in der Vorlage). „Abgabe" = `submitted_at` HH:MM, „Geänd." = `corrected_from_id ? updated_at : "---"`, „TG" = anteiliges Trinkgeld aus Tip-Pool (falls keine Tip-Pool-Daten vorhanden, leer lassen — siehe Offene Punkte).
- Darunter zweizeilig: „Mitarbeiter-Pool: X € · Küchen-Pool: Y €" und fett „Ø Trinkgeld: Z € von U € Umsatz = P,P %". Beide Pool-Zahlen kommen aus den existierenden Settlements (`kitchen_tip_cents`-Summe, Mitarbeiter-Pool-Summe aus `session_tip_pool_entries`, falls in `ov` enthalten — sonst aus den Settlements).
- Optional: Ausgaben-Liste und Vorschuss-Liste, identisches Schema wie in der Vorlage, aber **nur wenn vorhanden**.

Unter beiden Spalten:
- Gestrichelte Schnittlinie über die volle Breite.
- Zentriert groß fett: **`Wechselgeldbestand: X,XX €`** (= `session.cash_actual_cents`, sonst weglassen).
- Darunter klein grau: `TT.MM.JJJJ um HH:MM Uhr – Abrechnung von «Name»`.

## Umsetzung

**Eine Datei rewriten:** `src/lib/cash/pdfExport.ts`
- Funktionssignatur `generateDailySummaryPdf(data: PdfExportData)` bleibt — Aufrufer in `kasse.tsx` bleibt damit unverändert. Rückgabewert `{ blobUrl, blob, fileName }` bleibt.
- `PdfExportData` wird minimal erweitert um die Felder, die der neue Layout braucht und die bereits im Aufrufer verfügbar sind:
  - `channels: { id; label; kind: ChannelKind }[]` (kind ergänzen — kommt aus `listRevenueChannels`)
  - `tipPool?: { waiterPoolCents: number; kitchenPoolCents: number; perShareCents: number }` (optional; wird im Aufrufer aus `getTipPoolOverview` befüllt — siehe nächster Punkt)
- In `src/routes/_authenticated/admin/kasse.tsx` nur **eine Stelle** anpassen: `handleExportPdf` reicht zusätzlich `channels` mit `kind` durch und übergibt das bereits geladene `tipPoolQ.data` (falls vorhanden). Keine neue Query, kein neuer State.
- Komplette Wiederverwendung von `jspdf` + `jspdf-autotable` (bereits installiert, siehe heutiger `pdfExport.ts`). Keine neuen Deps, `bun.lock` unverändert.

**Test/Verify:**
- `npx tsc --noEmit` → 0 Fehler
- `npx eslint . --max-warnings=5` → 0 Fehler
- Manuelle Sichtprüfung: PDF aus `/admin/kasse` exportieren, gegen YUM-Vorlage vergleichen (Header, beide Spalten vollständig, eine Seite, Schnittlinie + Wechselgeldbestand-Footer sichtbar).
- Keine neuen Unit-Tests notwendig (reine Layout-Änderung, keine Geld-Formel-Änderung). Bestehende `cash-read.db.test.ts` läuft unverändert.

## Bewusst NICHT enthalten (eigene Schritte)

- Vorschuss-Quittungsseiten als Folgeseiten (Vorlage hat das — wird Stufe später, falls gewünscht).
- HTML-Druckansicht / Preview-Komponente im UI.
- Änderungen an der Geld-Logik, an `cash-ledger`, an Settlements, an SFN.

## Offene Punkte (vor Build kurz bestätigen)

1. **Trinkgeld-pro-Kopf-Spalte „TG":** Die Vorlage zeigt pro Kellner den Pool-Anteil. coco hat `session_tip_pool_entries` + `getTipPoolOverview`. Soll ich diesen Reader im Export-Aufruf mit verwenden (gibt die im Screenshot sichtbaren 94,41 €), oder reicht zunächst die Spalte leer / „---" und wir liefern den Tip-Pool-Wert in einer Folgestufe nach?
2. **Standortname im Header:** Nehme ich den `locations.name` (so wie heute). Falls du wie im Screenshot („YUM") einen separaten Kurzcode willst, sag bitte welches Feld.
