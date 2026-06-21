## Ziel
Union-Literale `StaffDepartment` und `SkillCategory` an genau einer Stelle halten. Reiner Typ-Refactor via Re-Export — keine Verhaltensänderung, keine Importer-Datei wird angefasst.

## Vorprüfung (erledigt)
Alle 5 Deklarationen sind wertgleich:
- `StaffDepartment = "kitchen" | "service" | "gl"` (3×: skill-eligibility.ts, tip-pool.ts, import-assignments.ts)
- `SkillCategory = "kitchen" | "service" | "gl" | "other"` (2×: skill-eligibility.ts, skills.functions.ts)

→ Stop-Bedingung greift nicht, Konsolidierung kann erfolgen.

## Schritte

### 1. Neue Datei `src/lib/staff-domain.ts`
Kanonische Definitionen mit Doc-Kommentar (Spiegel der Postgres-Enums).

### 2. Vier Hub-Dateien auf Re-Export umstellen
Jeweils lokale `export type …`-Zeile durch `import type … from "@/lib/staff-domain"` + `export type { … }` ersetzen:
- `src/lib/admin/skill-eligibility.ts` (Z. 9–10) — beide Typen
- `src/lib/admin/skills.functions.ts` (Z. 15) — `SkillCategory`
- `src/lib/cash/tip-pool.ts` (Z. 22) — `StaffDepartment`
- `src/lib/admin/import-assignments.ts` (Z. 7) — `StaffDepartment`

`export type { … }` (type-only) für `verbatimModuleSyntax`-Sauberkeit.

## Nicht angefasst
Keine Importer-Dateien, keine Logik, kein Schema, keine UI.

## Gate
- `prettier --write src/` + `eslint --fix src/`
- `tsc --noEmit` sauber, `eslint .` 0 Fehler
- `vitest run` weiterhin **738 grün** (Beweis für Verhaltensgleichheit)

## Commit
`Refactor: StaffDepartment/SkillCategory in src/lib/staff-domain.ts konsolidiert`
