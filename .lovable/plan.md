## Ziel
`src/routes/_authenticated/admin/kasse.tsx` (2.189 Z.) in mehrere Dateien aufteilen. **Reine Datei-Extraktion**, byte-identische Funktionskörper, keine Verhaltensänderung.

## Vorgehen

### 1. Helper-Modul `src/lib/cash/kasse-helpers.ts` (neu)
Wörtlich aus `kasse.tsx` extrahieren (named exports):
- `parseEuroToCents` (Z. 78) — diese Variante (erlaubt negative Werte, leer → 0), **nicht** mit anderen Projekt-Varianten mergen
- `fmtTime` (Z. 87)
- `fmtSignedCents` (Z. 896)
- `focusNextInput` (Z. 1740)

`fmtCents`/`todayIso` bleiben unverändert importiert aus `@/lib/format`.

### 2. Typen-Modul `src/lib/cash/kasse-types.ts` (neu)
- `import { getCashOverview } from "@/lib/cash/cash.functions"`
- `export type Overview = Awaited<ReturnType<typeof getCashOverview>>`
- `export type SettlementRow = Overview["settlements"][number]`

Einfach-genutzte Typen wandern mit ihrer Komponente:
- `UpdatePayload` → `SessionFieldsCard.tsx`
- `CashSummaryMisc` → `CashSummaryBlock.tsx`
- `StaffListItem`, `ManualDraft` → `TipPoolCard.tsx`

`CorrectState`/`CreateState` bleiben in `kasse.tsx`. `ChannelKind` weiterhin aus `@/lib/cash/session-channels` importieren.

### 3. Sub-Komponenten nach `src/components/cash/` (named exports, byte-identisch)

| Neue Datei | Komponente(n) |
|---|---|
| `SettlementWarningsBanner.tsx` | `SettlementWarningsBanner` |
| `SettlementsCard.tsx` | `SettlementsCard` |
| `SessionFieldsCard.tsx` | `SessionFieldsCard` (Kompositions-Knoten) |
| `CashSummaryBlock.tsx` | `CashSummaryBlock` |
| `ExcelRows.tsx` | `ExcelSectionHeader`, `ExcelInputRow`, `ExcelReadonlyRow` |
| `ExpenseForm.tsx` | `ExpenseForm` |
| `AdvanceForm.tsx` | `AdvanceForm` |
| `TipPoolCard.tsx` | `TipPoolCard` |

Import-Verdrahtung:
- `SessionFieldsCard` → `./AdvanceForm`, `./ExpenseForm`, `./CashSummaryBlock`, `./ExcelRows`
- `CashSummaryBlock` → `./ExcelRows`
- `ExcelInputRow` → `focusNextInput` aus `@/lib/cash/kasse-helpers`
- `fmtSignedCents`/`fmtTime`/`parseEuroToCents` → `@/lib/cash/kasse-helpers`
- `fmtCents` → `@/lib/format`
- `Overview`/`SettlementRow` → `@/lib/cash/kasse-types`

### 4. `kasse.tsx` bereinigen
- Verschobene Definitionen löschen
- Imports der neuen Module ergänzen
- `KassePage` (Z. 115–895) + Route-Definition + `CorrectState`/`CreateState` **unverändert**

### 5. Vor Commit
`npx prettier --write` und `npx eslint --fix` auf allen neuen/geänderten Dateien.

## Nicht angefasst
- `KassePage`-Logik (States/Queries/Mutations/Effects)
- Server Functions, DB, Sicherheitsmodell
- Andere `parseEuroToCents`-Varianten
- Keine Memoization/Optimierung

## Erfolgs-Gate
`tsc --noEmit` 0, `eslint .` 0, `prettier --check .` sauber, `vitest run` = 685 Tests unverändert, `kasse.tsx` < ~950 Z., Bodies byte-identisch.

## Geänderte / neue Dateien
**Neu (10):** `src/lib/cash/kasse-helpers.ts`, `src/lib/cash/kasse-types.ts`, `src/components/cash/{SettlementWarningsBanner,SettlementsCard,SessionFieldsCard,CashSummaryBlock,ExcelRows,ExpenseForm,AdvanceForm,TipPoolCard}.tsx`
**Geändert:** `src/routes/_authenticated/admin/kasse.tsx`
