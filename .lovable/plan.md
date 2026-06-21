## Tip-Spalte in „Kellner-Abrechnungen" auf Gesamt-Tipp umstellen

**Problem:** Die aktuelle Spalte „Tip" zeigt nur `kitchen_tip_cents` (= 2 % POS, geht an die Küche). Die neue Spalte „Tip %" basiert auf diesem Wert und ist deshalb für die Kellner-Sicht falsch.

**Definition Gesamt-Tipp pro Kellner** (konsistent mit `pdfExport.ts`, „Ø Trinkgeld"):
`tipTotal = kitchen_tip_cents + max(0, differenz_cents)`
(Küchen-Anteil + Überschuss, der in den Mitarbeiter-Pool fließt; Fehlbeträge zählen nicht negativ.)

### Änderung in `src/components/cash/SettlementsCard.tsx`
- Spalte **„Tip"** zeigt künftig `tipTotal` statt `kitchen_tip_cents`.
- Spalte **„Tip %"** zeigt `tipTotal / pos_sales_cents × 100` (eine Nachkommastelle, Komma, `–` wenn POS ≤ 0).
- Header-Label bleibt „Tip" / „Tip %".

Reine Frontend-Änderung, keine Logik in `waiter-settlement.ts` oder `cash.functions.ts`, keine Migration.