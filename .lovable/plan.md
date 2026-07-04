## Ziel

Zeit-Zellen im Wochenplan sollen sich wie eine Tabellen-Tastatur bedienen lassen: Klick markiert den Wert (Overtype), Tab/Pfeile navigieren zur nächsten Zelle, das Feld dort ist wieder markiert. Der bekannte „blinkende Cursor" (Fokus-Ping-Pong) darf nicht wiederkommen. Zahlen bekommen die gleiche Optik wie in Zusammenfassung/Buchhaltung.

## Änderungen (nur `WeeklyPlan` in `src/routes/_authenticated/admin/zeit-uebersicht.tsx`)

### 1. Font der Zeiten angleichen

- Zellen `TableCell` und Input: `font-mono text-sm` → `tabular-nums text-sm` (identisch zu Zusammenfassung/Buchhaltung — System-Font, Ziffern gleichbreit).
- Alles andere (Padding, Breite `w-[62px]`, Höhe `h-6`) bleibt.

### 2. Klick markiert den Wert (kein blinkender Cursor)

- `autoFocus` durch einen **Ref-basierten Fokus** ersetzen: `useRef<HTMLInputElement>(null)`; in einem einzigen `useEffect([edit?.staffId, edit?.iso, edit?.field])` genau dann `ref.current?.focus()` **und** `ref.current?.select()` aufrufen, wenn ein neues Edit-Target aktiv wird.
- Das State-Objekt `EditState` bekommt keine zusätzliche Rerender-Quelle; der Effect hängt nur an der Ziel-Zelle (nicht am `from`/`to`-Text), damit jeder Tastenanschlag NICHT re-fokussiert. Genau das war die Ursache des Cursor-Flackerns in der früheren Version.
- Beim erneuten Klick in dieselbe Zelle (anderes Feld) läuft der Effect erneut → Wert wird wieder markiert.

### 3. Navigation mit Tab und Pfeiltasten

In `onKeyDown` zusätzlich zu Enter/Escape:

- **Tab / Shift+Tab**: nächste bzw. vorherige Zeile (Mitarbeiter darunter/darüber), **gleicher Tag, gleiches Feld** (`from`/`to`). Am Ende der Gruppe in die nächste Abteilung überspringen; am Tabellenrand: Commit + Fokus verlassen. `ev.preventDefault()`, damit der Browser-Tab nicht die Tabelle verlässt.
- **ArrowUp / ArrowDown**: identisch zu Shift+Tab / Tab (Zeile hoch/runter).
- **ArrowLeft / ArrowRight**: vorheriges/nächstes Feld in Leserichtung — `from → to → from(nächster Tag) → to → …`; über Tages- und Zeilenränder hinweg.
- Vor jedem Sprung: `commit(edit)` (nur wenn valide oder unverändert; ungültig → Toast wie bisher, Sprung findet nicht statt).
- Nach dem Sprung: `startEdit(nextStaffId, nextIso, nextField)` — der Effect aus (2) fokussiert und markiert.
- Übersprungen werden: Zellen außerhalb der Periode (`dm.outOfPeriod`), Zellen mit mehreren Schichten (`multi`, aktuell nicht editierbar), gesperrte Zeilen. Bei Sackgasse endet die Navigation still.

### 4. Reihenfolge für die Navigation

Reihenfolge wird aus den bereits gerenderten Daten abgeleitet: flach über alle Gruppen (`groups.flatMap(g => g.rows)`) für die Zeilen-Achse, `weekDays` für die Tages-Achse. Kein zusätzlicher State, kein neuer Datenfluss.

### 5. Nicht anfassen

- Datenfluss (`onUpdateInline`, `onCreateInline`, `parseHHMM`, Mitternachtsüberlauf).
- Layout, Spaltenbreiten, S/U/K-Ordnung, Marker, Sperren.
- Zusammenfassung, Buchhaltung, Exporte.
- Keine Migration, kein SQL.

## Erfolgs-Gate

- `tsc` 0, ESLint 0, Prettier sauber, Vitest grün.
- Manueller E2E (Frank): Zelle anklicken → Wert ist selektiert, `1530` überschreibt sofort. Tab springt in die nächste Zeile (gleicher Tag), Wert dort selektiert. Pfeil-links/rechts wechselt zwischen Anf. und Ende, Pfeil hoch/runter zwischen Zeilen. Kein Cursor-Flackern beim Tippen. Zahlen-Optik identisch zu Zusammenfassung.