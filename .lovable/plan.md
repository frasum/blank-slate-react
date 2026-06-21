## Ziel

Mitarbeiterliste (`/admin/staff`) inline-bearbeitbar und schlanker machen.

## Spalten-Layout (neu)

| Name (klickbar) | Rolle (Inline-Select) | Skills (Inline-Multi-Select) | PIN | Aktiv |

- **Bearbeiten**-Spalte: weg
- **Badges**-Spalte: weg
- **Name**: wird zum Link auf `/admin/staff/$staffId` (ersetzt „Bearbeiten")
- Reihenfolge: Name → Rolle → Skills → PIN → Aktiv

## Inline-Editoren

**Rolle** (`PillSelect` mit Optionen `admin / manager / payroll / staff / —`):
- Speichert via bestehender `setStaffRole`-Server-Function
- Optimistic update + Invalidate `["admin", "staff"]`
- Letzter aktiver Admin bleibt geschützt (Server wirft, Toast zeigt Fehler)

**Skills** (Popover-Trigger „N Skills" / „Skills zuweisen", öffnet Checkbox-Liste gruppiert nach Kategorie):
- Lädt `listSkills` einmalig (Query-Cache org-weit)
- Aktuelle Auswahl pro Zeile aus `s.skillCategories` reicht nicht — wir brauchen die konkreten Skill-IDs. Daher `listStaff` um `staff_skills(skill_id)` erweitern und `skillIds: string[]` im Rückgabe-Typ ergänzen (`skillCategories` bleibt für bestehende Konsumenten — Aufgaben-Filter).
- Speichert via bestehender `assignStaffSkills`
- Optimistic update + Invalidate `["admin", "staff"]`
- Trigger-Label zeigt Anzahl: `3 Skills` (oder `Skills zuweisen` bei 0)

## Sonstiges

- Klick auf Name navigiert weiterhin in die Detailseite (für alles andere: Standorte, Personaldaten, PIN, Token)
- PIN-Spalte bleibt nur Anzeige (`gesetzt` / `—`)
- Aktiv-Spalte bleibt Anzeige (nicht editierbar in der Liste)
- „Inaktive anzeigen"-Toggle und „Neuer Mitarbeiter"-Button bleiben unverändert

## Technische Details

- `src/routes/_authenticated/admin/staff.index.tsx`: Spalten + Inline-Komponenten
- `src/lib/admin/staff.functions.ts` (`listStaff`-Handler): Select um `skill_id` erweitern, `skillIds` mappen
- Konsumenten von `listStaff` (Aufgaben-Filter via `skillCategories`) bleiben kompatibel — nur additives Feld
- Tests: bestehende grün halten; keine neue Geschäftslogik

## Gate

`prettier --write src/` + `eslint . --fix` → `tsc --noEmit`, `eslint .`, `prettier --check .`, `vitest run` alle grün.

## Nicht angefasst

- Keine Migration, keine RLS-Policy, keine neue Server-Function
- Keine Änderung an `setStaffRole`/`assignStaffSkills`-Logik
- Detailseite `staff.$staffId.tsx` unverändert
