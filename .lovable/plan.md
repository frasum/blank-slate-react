## Ziel
Nicht verfügbare, **leere** Zellen im Dienstplan-Grid bekommen statt der Schraffur eine dezente, gefüllte graue Box (wie im thaitime-Vorbild). Zellen mit Schicht-Pille bleiben unverändert (Pille gewinnt).

## Änderung (nur `src/components/roster/RosterGrid.tsx`)

**`DropCell` (~Zeile 397–459):**
- Prop `unavailable` wird nicht mehr für die `<td>`-Hintergrundgrafik verwendet.
- Schraffur-Logik (`hatchBg`, `backgroundImage`, `backgroundColor` für unavailable) entfernen.
- Stattdessen: wenn `unavailable === true` UND keine Pille vorhanden (= `children` ist eine `EmptyCell`), wird **innerhalb** der `<td>` ein absolut positionierter grauer Block gerendert:
  - `absolute inset-1 rounded-md` mit `backgroundColor: hsl(var(--muted-foreground)/0.22)`
  - `pointer-events-none`, `z-0` (unter Cross-Booking-Punkt und Popover-Trigger)
- Tooltip "Nicht verfügbar" bleibt wie gehabt um die `<td>` gewickelt.
- Weekend-Sonderfall `weekend && !unavailable` wieder zu `weekend && "bg-muted/40"` vereinfachen (Box überdeckt Weekend-Tönung optisch ohnehin nicht störend, und bei Pille bleibt Weekend sichtbar).

**Erkennung „leere Zelle"**: Die DropCell weiß nicht direkt, ob ein Pill drin ist. Einfachste saubere Lösung: neue optionale Prop `hasShift: boolean` von `RosterGrid` an `DropCell` durchreichen (`hasShift={!!shift}`). Box nur rendern wenn `unavailable && !hasShift`.

**Cross-Booking-Punkt**: liegt bereits in `EmptyCell` als absolut positionierter roter Dot. Sicherstellen, dass die graue Box dahinter liegt (`z-0` für Box, Dot behält sein vorhandenes `z`/Stacking – im DOM später = höher).

## Nicht angefasst
- `roster.functions.ts`, Migrations
- `EmptyCell`, `ShiftPill`, `PillConfirmPopover`, `CellQuickPopover`
- Realtime, Locks, Paint, Drag&Drop

## Abschluss
`npx prettier --write` + `npx eslint --fix` auf die geänderte Datei; CI grün (tsc/eslint/vitest).

## Erfolgs-Gate
- [ ] Leere nicht-verfügbare Zelle: gefüllte graue, abgerundete Box (sichtbar, dezent)
- [ ] Nicht-verfügbare Zelle mit Pille: keine Box, Pille normal sichtbar
- [ ] Roter Cross-Booking-Punkt bleibt oben rechts sichtbar
- [ ] Tooltip "Nicht verfügbar" bleibt
- [ ] Keine Schraffur mehr
- [ ] CI grün
