## Ziel
`exceljs` (~900 KB) aus den Route-Chunks ziehen und nur beim ersten Excel-Export nachladen. Alle Build-Funktionen sind bereits `async … Promise<Blob>` → reiner dynamic import, keine Aufrufstellen- oder Logikänderung.

## Verifikation gegen HEAD
- 4 statische `import ExcelJS from "exceljs"`-Treffer: `bargeld-export.ts`, `weekly-export.ts`, `buchhaltung-export.ts`, `lohn-excel-export.ts`.
- `lohn-excel-export.ts` nutzt zusätzlich `ExcelJS.Worksheet` als Typ in zwei Helfer-Signaturen (Z. 27, 45) und `new ExcelJS.Workbook()` als Wert (Z. 53).

## Nicht anfassen
- jsPDF / jspdf-autotable (sync, separater späterer Schritt).
- recharts (braucht React.lazy, separater Schritt).
- Funktionssignaturen, Aufrufstellen, Sheet-Aufbau.

## Änderungen

### Fall A — reine Wert-Nutzung
`src/lib/cash/bargeld-export.ts`, `src/lib/time/weekly-export.ts`, `src/lib/time/buchhaltung-export.ts`:
- Top-Level `import ExcelJS from "exceljs";` entfernen.
- In der jeweiligen async XLSX-Funktion (`buildBargeldXlsx`, `buildWeeklyXlsx`, `buildBuchhaltungXlsx`) als **erste Zeile**:
  ```ts
  const ExcelJS = (await import("exceljs")).default;
  ```
- jsPDF/autoTable-Importe in `weekly-export.ts` / `buchhaltung-export.ts` bleiben unverändert.

### Fall B — Wert + Typ
`src/lib/lohn/lohn-excel-export.ts`:
- `import ExcelJS from "exceljs";` → `import type ExcelJS from "exceljs";` (Typ-Import wird zur Laufzeit entfernt; `sheet: ExcelJS.Worksheet`-Annotationen bleiben gültig).
- In `buildLohnXlsx` als erste Zeile:
  ```ts
  const ExcelJSRuntime = (await import("exceljs")).default;
  ```
- `new ExcelJS.Workbook()` → `new ExcelJSRuntime.Workbook()`. Typ-Annotationen unverändert.
- Fallback falls `import type ExcelJS` nicht typt: `import type { Worksheet } from "exceljs";` und `ExcelJS.Worksheet` → `Worksheet` in den beiden Signaturen (tsc entscheidet).

## Vor dem Commit
`npx prettier --write` + `npx eslint --fix` über die 4 geänderten Dateien.

## Erfolgs-Gate
- `tsc --noEmit` 0, `eslint .` 0, `prettier --check .` sauber.
- `vitest run` = 685 Tests unverändert (reiner Lade-Mechanismus).
- `grep -rn 'import ExcelJS from "exceljs"' src/` → 0 Treffer (nur `import type` + `await import` erlaubt).
- Build erzeugt separaten `exceljs`-Chunk (nicht mehr in `kasse-saldo`/`zeit-uebersicht`/`lohnrechner`/`weekly`-Route-Chunks).
- Manuell: ein Excel-Export (z. B. `/admin/zeit-uebersicht` Buchhaltung oder `/admin/lohnrechner`) erzeugt die Datei wie bisher.

## Geänderte Dateien
- `src/lib/cash/bargeld-export.ts`
- `src/lib/time/weekly-export.ts`
- `src/lib/time/buchhaltung-export.ts`
- `src/lib/lohn/lohn-excel-export.ts`
