## Bargeldübersicht: Tabelle ohne horizontalen Scrollbalken

Die Tabelle hat 14 Spalten und sprengt aktuell die Breite des Containers (Admin-Layout ist auf ~1280 px begrenzt, Tabelle braucht ~1500 px → Scrollbalken).

### Vorgehen — alles in `src/routes/_authenticated/admin/kasse-saldo.tsx`

1. **Spaltenbreite über Zell-Padding & Schrift reduzieren** (nur diese Seite, kein globaler Eingriff):
   - Header- und Body-Zellen mit `px-2 py-2 text-xs` (statt Default `p-4 text-sm`).
   - Footer-Zeile genauso.
   - `tabular-nums whitespace-nowrap` bleibt — Zahlen brechen weiter nicht um.
2. **Header-Beschriftungen leicht kürzen**, damit die Zahlenspalten schmal werden dürfen:
   - „Kreditkarten" → „KK"
   - „OrderSmart" → „OS"
   - „Gutsch. EL" → „Gut. EL"
   - „Gutsch. VK" → „Gut. VK"
   - „Offene RE" → „Off. RE"
   - „Tagesumsatz", „Take-Away", „Wolt", „FineDine", „Einladung", „Vorschuss", „Ausgaben", „Bargeld", „Datum" bleiben.
3. **Container fluid statt scrollend:** den `<Card>`-Wrapper voll auf die verfügbare Breite ziehen (`w-full`), die Tabelle selbst mit `w-full table-fixed` rendern, sodass Tailwind die Spalten gleichmäßig verteilt und die Schrift sich an die Breite anpasst. Wenn das Layout-Wrapper-Element (Admin-Shell) eine `max-w-*` setzt, lokal mit `-mx-…` / `max-w-none` aufheben (nur diese Route).
4. **Fallback für sehr schmale Viewports** (< 1024 px): nur dort `overflow-x-auto` zulassen — auf Desktop-Bildschirmen (≥ 1280 px) ist alles sichtbar, kein Balken. Mobil/Tablet bleibt scrollbar (sonst zerquetscht).

### Nicht anfassen
- Datenpfad, Berechnung, Excel-Export, Spaltenreihenfolge, Werte/Formatierung.

### Erfolgs-Gate
- Auf 1440 px breitem Bildschirm (und größer): keine horizontale Scrollbar, alle 14 Spalten sichtbar.
- Auf < 1280 px: horizontale Scrollbar erlaubt.
- Zahlen brechen nirgendwo um; Footer-Summen bleiben lesbar.
- `tsc --noEmit`, `eslint . --max-warnings=5` grün.
