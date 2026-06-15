## Ziel

Klick auf eine Anf./Ende-Zelle im Wochenplan öffnet **kein** Dialog mehr, sondern macht die Zelle direkt editierbar (HH:MM-Input). Speichern passiert per Enter / Tab / Blur. Dialog wird für den Standard-Fall (max. 1 Schicht pro Tag) komplett ersetzt.

## Verhalten

**Leerer Tag**
- Klick auf Anf.-Zelle → Input mit Default `15:00`, automatisch fokussiert + markiert.
- Klick auf Ende-Zelle → Input mit Default `23:00`.
- Nach Eingabe Anf. + Tab → Cursor springt in die Ende-Zelle (noch kein Save).
- Sobald **beide** Werte (Anf. und Ende) vorhanden + valide sind und Blur/Enter passiert → `createShiftMut` feuert.
- Esc verwirft die Eingabe.

**Tag mit genau einer Schicht**
- Klick auf Anf./Ende → Wert wird zum Input, vorbelegt mit aktuellem Wert.
- Enter/Blur → `setShiftMut` mit der zugehörigen `id`, dem unveränderten anderen Wert und dem neuen.
- Esc verwirft.

**Tag mit mehreren Schichten / Cross-Location**
- Bleibt **read-only** (kein Inline-Edit, kein Dialog), wie heute bereits durch `findEntries(...).length === 1`-Guard.

## Validierung

- Pattern: `^([01]\d|2[0-3]):[0-5]\d$`. Bei ungültigem Wert: Input rot umranden, kein Save, Toast `Ungültige Uhrzeit`.
- Datumsteil aus `day.iso` + Zeit → ISO-String wie bisher in `ShiftEditorDialog` zusammengebaut. Logik 1:1 aus dem Dialog (`combineDateTimeISO`) in eine kleine Helper-Fn ziehen, um Doppelung zu vermeiden.
- Bei `setShift` für eine bestehende Schicht: den nicht-editierten Wert (z. B. `endedAt` beim Bearbeiten von Anf.) aus der Quelle nehmen.

## Tastatur

- Enter = Save + Blur.
- Tab = Save (falls Wert sich änderte) + nächste Zelle.
- Esc = Abbruch ohne Save.

## UI-Details

- Inputs: `w-[58px] h-7 text-center font-mono text-sm`, Border `border-primary/40`, Hintergrund passend zur Zelle (Sonntag/Feiertag-Bg beibehalten).
- Während laufender Mutation: Input disabled + Opacity 60 %.
- Hover-Affordance (`+` Symbol) bleibt für leere Zellen erhalten.

## Code-Änderungen (eine Datei)

`src/routes/_authenticated/admin/zeit-uebersicht.tsx`:

1. **`WeeklyPlan`** — neuen lokalen Zellen-State (`editingKey: \`${staffId}|${iso}|from|to\``, plus Draft-Werte `from`/`to` pro Zeile-Tag). Render-Logik in `renderShift` ersetzen: wenn `editingKey` matched → `<input>` statt Text.
2. **Save-Hooks** — `WeeklyPlan` bekommt zusätzliche Props `onCreateInline(staffId, locationId, iso, from, to)` und `onUpdateInline(id, iso, from, to)`. Im Parent (`ZeitUebersichtPage`) mit den bestehenden `createShiftMut`/`setShiftMut` verdrahten.
3. **Helper** — `combineDateTimeISO(iso, hhmm)` und `isValidHHMM` aus `ShiftEditorDialog` an das Modul-Top-Level ziehen, damit beide Stellen sie nutzen können.
4. **`onCreate` / `onEdit` Props** — bleiben für eventuelle Spezialfälle bestehen, werden aus dem Klick-Handler aber entfernt (`handleClick` löst nur noch das Inline-Editing aus). Wenn `found.length > 1` → Klick macht nichts (read-only).
5. **`ShiftEditorDialog`** — bleibt im File für zukünftige Wiederverwendung, wird aber nicht mehr gemountet (`<ShiftEditorDialog … />` wird entfernt, `editor`-State + Import-Block aufräumen). Falls du den Dialog behalten möchtest, sag Bescheid — ich kann ihn als "Erweitert"-Eintrag in einem Hover-Menü lassen.

## Nicht im Scope

- Multi-Schicht-Editor (mehrere Schichten pro Tag).
- Verschieben von Schichten zwischen Standorten.
- Pause/Notiz-Eingabe in der Grid-Zelle.
- Backend / Server-Funktionen (unverändert).
