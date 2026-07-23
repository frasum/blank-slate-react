## Ziel
In der Personalliste (`/admin/staff`) am Ende jeder Skill-Zell-Zeile ein kleines Plus-Symbol anzeigen, damit sofort sichtbar ist: „hier können weitere Skills hinzugefügt werden". Das gilt nur, wenn der Mitarbeiter bereits mindestens einen Skill hat — der Leerzustand zeigt weiterhin den bestehenden Hinweis „+ Skills wählen".

## Scope
Rein visueller Zusatz in genau einer Datei. Kein Verhalten, keine Server-Änderungen, keine Migration. Klick auf die Zelle (inkl. Plus) öffnet weiterhin den bestehenden `SkillAssignPopover` — die Zelle ist bereits ein einziger Button.

## Änderung

**Datei:** `src/routes/_authenticated/admin/staff.index.tsx` (Zeilen ~621–641, Skill-Chip-Rendering im Admin-Zweig)

- Wenn `heldSkills.length > 0`: nach der `.map(...)` einen kleinen, dezenten Plus-Indikator anhängen — gestrichelter Rahmen, `text-muted-foreground`, gleiche Höhe/Rundung wie die Chips (`min-w-[36px]`, `rounded-md`, `px-2 py-0.5`), Inhalt `+`, `aria-hidden`, damit Screenreader nur den Zellen-Button-Aria-Label lesen.
- Leerzustand (`heldSkills.length === 0`) bleibt unverändert („+ Skills wählen").
- Kein Extra-Handler nötig — der äußere `<button>` öffnet den Popover bereits.
- Nicht-Admin-Zweig (nur-lesend) bleibt unverändert.

## Gates vor Commit
`tsgo --noEmit`, `vitest run`, `eslint . --max-warnings=0`, `prettier --check .` — wie üblich.
