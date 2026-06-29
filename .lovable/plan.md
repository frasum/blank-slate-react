## Ziel
Öffentliches Display (`/display/:locationId?token=…`) von Ein-Tages-Kartenliste auf rollendes **31-Tage-Gitter** (Zeilen = MA, Spalten = Tage) umbauen. Read-only, Token-Auth unverändert.

## Scope
Drei Dateien — alles andere (Token-Prüfung, `service-marker.ts`, `roster.functions.ts`, Admin-Grid, Schema/RLS) bleibt unangetastet.

### 1) NEU: `src/lib/display/cell.ts` + `cell.test.ts`
Reine Funktion `resolveCellKind` mit Priorität **Schicht > Urlaub > Krank > Wunsch > Verfügbar > leer**. Tests decken alle 6 Pfade ab (Spec-Wortlaut übernommen).

### 2) Umbau Endpoint `src/routes/api/public/display.$locationId.ts`
- **Unverändert lassen:** Token-Block (`safeCompare`/`timingSafeEqual`/`node:*`-Imports), Laden von `display_settings`, `is_enabled`-Check, `locations`-Lookup, Geburtstags-Logik.
- **Entfällt:** `periods` + `roster_releases` Gating, Ein-Tages-`roster_shifts`-Block, alter `ShiftDto`/`DisplayPayload`.
- **Neu nach `locations`-Lookup:**
  1. `days` = `rollingDays(todayIso(), 31)`; `windowStart`/`windowEnd` = erste/letzte.
  2. Zeilenbasis: `role_assignments` (payroll-IDs ausschließen) + `staff_locations` join `staff` (org+locationId, `is_active !== false`). `mappedArea = department==="kitchen" ? "kitchen" : "service"`. Dedupe `(staffId, mappedArea)`. MA mit beiden Departments erscheint in beiden Blöcken.
  3. `roster_shifts` im Fenster (org+locationId) → Map `staffId|date|blockArea → skill_id` (Eintrag mit gesetztem `skill_id` bevorzugt).
  4. `skills` (id, name, color) batch.
  5. Overlays org-weit (nicht standort-gefiltert), im Fenster: `roster_absence` → Map → `urlaub|krank`; `day_off_wishes` → Set; `roster_availability` → Set.
  6. Pro Block (`kitchen`, `service`, gefiltert nach `show_areas`): pro Zeile × Tag Zelle via `resolveCellKind` zusammensetzen. `skill` nur bei `shift`; `color` nur bei `shift && area==="kitchen"`. `shiftCount` (pro Zeile) + `dayCounts[i]` (pro Block/Tag) summieren.
  7. Payload-Typ ersetzt (`DisplayCell`/`DisplayRow`/`DisplayBlock`/`DisplayPayload` mit `windowStart/windowEnd/days/blocks/...`). Geburtstage unverändert, `cache-control: no-store`.

### 3) Umbau Route `src/routes/display.$locationId.tsx`
- **Bleibt:** Fetch/Polling/Error-Handling/Clock, `searchSchema`, Dark-Theme (`bg-slate-950`), Geburtstags-Banner, Custom-Message, Header (Standort+Uhr).
- **Entfällt:** Rotation, `RotationColumn`, `Column`, `PlaceholderColumn`, gruppierte Hash-Karten.
- **Neu:** Pro Block horizontal scrollbare Tabelle:
  - Sticky linke Namens-Spalte, 31 Tag-Header (`weekday short` + `D.M.`), heute hervorgehoben, Wochenenden dezent.
  - Σ-Spalte rechts = `shiftCount` pro MA.
  - Unten je Block eine „Arbeitet"-Zählzeile aus `dayCounts`.
  - Zell-Darstellung gemäß Tabelle in der Anweisung: Küche=farbige Pille mit `style={{ backgroundColor: cell.color ?? undefined }}` + Skill-Name; Service=`serviceMarker(cell.skill)` Buchstabe; `urlaub`=`<Umbrella>` grün; `krank`=`<Thermometer>` orange; `wish`=`<Heart>` lila gestrichelt; `available`=`○` grau; `empty`=`−` grau.
  - Footer-Legende wenn `showFooter`.
- Imports: `serviceMarker` aus `@/lib/roster/service-marker`, `Umbrella/Thermometer/Heart` aus `lucide-react`.

## Gates
- `npx prettier --write` + `npx eslint --fix` auf die drei Dateien.
- `tsc --noEmit` = 0, `eslint --max-warnings=5` grün, `vitest run` grün inkl. neuer `cell.test.ts`.
- Manueller E2E: 31 Spalten ab heute, Küche+Service-Blöcke, Pillen/Marker/Overlays korrekt, Σ + Zählzeile + Heute-Highlight + Legende sichtbar; falscher Token → unveränderte Fehlerseite.

## Nicht-Ziele
Keine Migration, kein Schema, keine RLS-Änderung, kein Eingriff in `roster.functions.ts`/Admin-Dienstplan, keine Änderung der Token-/Settings-Pfade.
