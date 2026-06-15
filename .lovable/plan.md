
# Plan: Dienstplan-Bedienung im Stil von Restaurant Hub

Übernimmt die Bedienlogik & Optik des Hub-Rosters in den bestehenden COCO-Dienstplan (`/admin/dienstplan`). Schema und Server-Functions sind weitgehend vorhanden; nur eine zusätzliche Move-Function nötig. Kein neues Feature „Abwesenheiten" in diesem Schritt.

## Was sich für dich ändert

1. **Tabs Küche / Service** statt zwei Tabellen untereinander. Pro Tab ein eigenes Grid.
2. **Paint-Toolbar** über dem Grid: Skill auswählen → Cursor wird zum Pinsel → Klick in leere Zelle legt sofort eine Schicht mit diesem Skill an. Radiergummi-Modus löscht per Klick. Skills im Pool sind nach Kategorie sortiert (kitchen vs service/gl/other je nach aktivem Tab).
3. **Drag & Drop**: Bestehende Schicht-Pille auf eine andere Zelle ziehen verschiebt sie (anderer Mitarbeiter, anderer Tag, anderer Bereich). Lock + Kollision werden geprüft.
4. **Skill-Filter-Chips** über dem Grid: nur Mitarbeiter mit gewähltem Skill zeigen (Mehrfachauswahl, „ODER").
5. **Density-Umschalter** (kompakt / normal / komfortabel / fit). „fit" rechnet die Zeilenhöhe so, dass alles ohne vertikalen Scroll passt.
6. **Header-Zähler & Σ-Spalte**: pro Tag steht die Anzahl Schichten unter dem Datum; rechts Σ-Spalte mit Monatssumme pro Mitarbeiter. Tooltip auf Σ zeigt Cross-Restaurant-Aufschlüsselung („8× Plauen Küche, 4× Hof Service" o. ä.).
7. **Pillen-Optik 1:1**: Küche = bunte Pille mit Skill-Farbe + Skill-Abkürzung. Klick auf bestehende Pille öffnet `PillConfirmPopover` mit Skill-Wechsler, Status-Toggle (geplant/bestätigt), Pencil/Trash.
8. **Heute / Wochenende** farblich hervorgehoben (heute = Akzent-Ring, Wochenende = grauer Hintergrund).

## Was MUSS erhalten bleiben (Erhaltungs-Constraints)

Der Umbau darf diese vier bereits funktionierenden Features nicht verlieren:

1. **Realtime-Subscription** auf `roster_shifts` (`postgres_changes` → `invalidateQueries`). Nach Paint / Move / Delete aktualisiert das Grid live bei allen Clients.
2. **Cross-Booking-Warnung**: roter Punkt in leeren Zellen, wenn der Mitarbeiter an dem Tag woanders (anderer Bereich/Standort) eine Schicht hat, mit Hover-Tooltip „Bereits: <Standort> · <Bereich> · <Skill>". `getStaffCrossBookings` bleibt unverändert.
3. **Service-Symbol-Darstellung**: Im Service KEINE farbigen Pillen, sondern Marker aus `service-marker.ts` (SERVICE→X, GL→GL, BAR→B, 19 Uhr→19h, Hausmeister→H). Küche behält farbige Skill-Pillen. `service-marker.ts` wird nicht angefasst.
4. **GL→Service-Mapping**: Kein eigener GL-Abschnitt. `department='gl'` wird im Service-Tab gezeigt. Mitarbeiter mit kitchen UND service erscheinen in beiden Tabs (Dedupe bleibt nur innerhalb desselben Bereichs).

## Was nicht Teil dieses Schritts ist

- Abwesenheiten (Urlaub/Krank) als Banner — eigener späterer Bauschritt.
- Virtualisiertes Scrollen — bei <50 Mitarbeitern pro Standort nicht nötig; später als 1-Datei-Tausch nachrüstbar.
- Cycle-Navigator-Buttons (Vor/Zurück) — Periode bleibt Dropdown wie heute.

## Technische Umsetzung

### Neue Pakete
- `@dnd-kit/core` (Drag & Drop). `sonner` und Lucide-Icons sind vorhanden.

### Neue Server-Function
`moveRosterShift({ id, staffId, shiftDate, area })` in `src/lib/roster/roster.functions.ts` (additiv — bestehende Funktionen bleiben unverändert):

- WRITE_ROLES (`manager`, `admin`).
- **Lock-Check auf BEIDEN Daten**: `assertShiftDateUnlocked(snap.shift_date)` UND `assertShiftDateUnlocked(data.shiftDate)`. Eine Schicht darf weder in noch aus einer gesperrten Periode verschoben werden.
- **Konflikt-Pre-Check**: SELECT auf `(staff_id, location_id, shift_date, area)` der Zielzelle. Falls belegt → `throw new Error("Mitarbeiter ist an diesem Tag in diesem Bereich bereits eingeteilt.")`. Kein unbehandelter Unique-Violation-Fehler.
- UPDATE der Felder `staff_id`, `shift_date`, `area`.
- Audit `roster_shift.move` mit `meta.before` / `meta.after`.

### Neue Komponenten (alle in `src/components/roster/`)
- `PaintToolbar.tsx` — Skill-Pool (kategoriefiltriert nach aktivem Tab) + Eraser-Toggle, Active-State.
- `CellQuickPopover.tsx` — Quick-Anlage in leerer Zelle (Skill-Buttons; bei aktivem Paint-Tool direkt anlegen statt Popover).
- `PillConfirmPopover.tsx` — Klick auf Pille: Skill ändern, Status-Toggle, löschen (Pencil/Trash).
- `ShiftPill.tsx` — wiederverwendbare Pille; Service nutzt `serviceMarker()`, Küche nutzt Skill-Farbe + Abkürzung. `useDraggable` aus dnd-kit.
- `RosterGrid.tsx` — Grid mit `<Tabs>`, Density-Berechnung, Header mit Tag-Zählung + Σ-Spalte (Tooltip mit Cross-Restaurant-Breakdown), `useDndMonitor` für Move.
- `SkillFilterChips.tsx` — Multi-Toggle-Chips.
- `DensityToggle.tsx` — 4-State-Segmented-Control.

### Bestehende Datei
`src/routes/_authenticated/admin/dienstplan.tsx` wird auf eine schlanke Page reduziert: lädt Periode/Standort, rendert Toolbar + Filter + Density + Grid, wickelt alles in `<DndContext>`. **Realtime-Subscription, Lock-Banner, Cross-Booking-Index und Periode-Wechsel bleiben in identischer Form erhalten.**

### Datenflüsse
- Tages-/Monatszählungen werden clientseitig aus den bereits geladenen `shifts` aggregiert — keine zusätzliche Query.
- Cross-Restaurant-Aufschlüsselung nutzt die existierende `getStaffCrossBookings` (unverändert).
- Realtime-Channel invalidiert nach Move/Paint automatisch.

### Tests
- Unit für Paint-Pool-Filter pro Area (analog zu bestehendem `service-marker.test.ts`).
- Optional Konflikt-/Lock-Pfade in `moveRosterShift` als Server-Fn-Test.

## Nicht anfassen
- `src/lib/roster/service-marker.ts`
- Bestehende Lese-Functions in `roster.functions.ts` (`getRosterShifts`, `getStaffForRoster`, `getStaffCrossBookings`, `listSkills`) — nur `moveRosterShift` ergänzen.
- `time_entries`, `zeit-uebersicht`, `cash-*`, `tip-pool`, `shift-hours`.
- Alle bestehenden Tests und Migrations.

## Erfolgs-Gate (vor Abschluss prüfen)

- [ ] Tabs Küche/Service funktionieren, GL erscheint im Service-Tab, Mehrfach-Bereich-Mitarbeiter in beiden Tabs.
- [ ] Paint-Modus legt Schichten per Klick an, Eraser löscht.
- [ ] Drag & Drop verschiebt Schichten zwischen Zellen.
- [ ] `moveRosterShift` blockiert bei gesperrter alter ODER neuer Periode.
- [ ] `moveRosterShift` zeigt Klartext-Fehler bei Ziel-Kollision.
- [ ] Realtime: Zweiter Browser-Tab sieht Änderungen live.
- [ ] Cross-Booking-Punkt + Hover-Tooltip in leeren Zellen funktionieren.
- [ ] Service-Marker (X/GL/B/19h/H) erhalten, Küche bleibt farbig.
- [ ] `npx prettier --write` + `npx eslint --fix` über geänderte Dateien gelaufen.
- [ ] `npx eslint src/ --max-warnings=0` grün.
- [ ] `npx vitest run` grün.
- [ ] `tsc` (durch CI) grün.

## Aufwand & Reihenfolge

```text
1. Pakete installieren (@dnd-kit/core).
2. Server-Fn moveRosterShift (Lock alt+neu, Konflikt-Pre-Check, Audit).
3. ShiftPill + PillConfirmPopover + CellQuickPopover.
4. PaintToolbar + SkillFilterChips + DensityToggle.
5. RosterGrid (Tabs, Header-Zähler, Σ + Cross-Tooltip, DnD-Monitor).
6. dienstplan.tsx umbauen — Realtime, Lock, Cross-Booking-Index,
   Service-Marker, GL→Service unverändert übernehmen.
7. Tests + Prettier + ESLint + Vitest grün.
8. Erfolgs-Gate Punkt für Punkt abhaken.
```
