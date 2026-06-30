Änderungen in `src/routes/display.$locationId.tsx` (nur Display, dunkles Theme):

## 1. Zebra-Streifen für Datenzeilen
- `<tr>` der Datenzeilen erhält `group/row even:bg-slate-900/40`.
- Linke sticky Namens-Spalte (`bg-slate-950`) erhält zusätzlich `group-even/row:bg-slate-900` damit der sticky-Hintergrund deckend bleibt.
- Rechte sticky Namens-Spalte (style right:64): gleiches Pattern.
- Σ-Spalte (sticky right-0): gleiches Pattern.
- Wochenend- und Heute-Hervorhebung in den Zellen bleibt — überschreibt den Zeilen-Hintergrund weiterhin.

## 2. Tages-Schichtzahl in den Spalten-Header verlegen
Wie im Dienstplan-Grid: pro Tagesspalte zusätzlich zur `Wd / dm` eine dritte Zeile mit der Anzahl an Schichten dieses Bereichs an diesem Tag (`block.dayCounts[i]`).
- Im `<thead>` jeder `BlockTable`: dritter `<div>` mit `tabular-nums font-semibold text-[10px]`, gleiche Heute/Wochenend-Logik wie bisher.
- 0 → dezenter Punkt (`text-slate-600`), sonst `text-slate-200` (Heute: `text-sky-100`).

## 3. „Arbeitet"-Footer-Zeile entfernen
Den gesamten `block.rows.length > 0 && (<tr>…Arbeitet…</tr>)`-Block in `BlockTable` löschen — Daten kommen jetzt aus dem Header.

Daten/Realtime/Sticky-Offsets/CellView/Pillen unverändert; Grid wird nicht angefasst.
