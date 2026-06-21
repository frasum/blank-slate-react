## Neue KPI-Kacheln im Tagesabschluss (kasse.tsx)

Zwei kleine Kacheln zwischen `TipPoolCard` und dem "Tag finalisieren"-Block einfügen.

### Kachel 1 — Trinkgeld-Quote
- **Wert**: `Trinkgeld-Pool gesamt / In-House-Umsatz × 100`, eine Nachkommastelle, z. B. `4,3 %`
- **Trinkgeld-Pool gesamt**: `computeTipTotalCents(activeSettlements)` (= Küche + Service, wie im Pool)
- **Sublabel**: `Pool €X,XX / Umsatz €Y,YY` (klein, muted)

### Kachel 2 — Ø Umsatz pro Gast
- **Wert**: `In-House-Umsatz / guest_count`, formatiert als €
- **Sublabel**: `N Gäste` (klein, muted)
- Fehlt `guest_count` → `–` und Hinweis "Gästeanzahl fehlt"

### In-House-Umsatz (einheitliche Basis)
`vectron_daily_total_cents − delivery_vectron` (Take-away-Anteil im Vectron-Tagesumsatz herausgerechnet; Sojus/Wolt sind nicht Teil von `vectron_daily_total_cents` und müssen daher nicht abgezogen werden).

Bei Wert ≤ 0 → Kacheln zeigen `–`.

### Umsetzung
Reine Frontend-Änderung in `src/routes/_authenticated/admin/kasse.tsx`:
- Werte aus `ovQ.data` (Settlements + Session + ChannelAmounts) lokal berechnen.
- Neue kleine Komponente `DayKpiTiles` inline oder unter `src/components/cash/DayKpiTiles.tsx`, zwei `Card`-Kacheln nebeneinander (`grid md:grid-cols-2 gap-3`), groß, monospace für Zahlen, konsistent mit bestehender Card-Optik.

Kein Backend, keine Migration, keine Logikänderung an Pool/Settlement.