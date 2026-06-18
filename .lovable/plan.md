## Ziel

- Farbpunkte aus den Skill-Chips entfernen.
- Chip-Hintergrund nutzt die Skill-Farbe (gleiche Quelle wie Dienstplan).
- Skill-Farbe ist pro Skill individuell editierbar (Admin).
- Dienstplan-Pille liest künftig ausschließlich `skills.color` — die hartkodierten Farb-Maps in `ShiftPill` werden entfernt, damit eine Änderung überall greift.

## 1. Migration: bestehende Farben in `skills.color` zurückschreiben

Einmaliges UPDATE pro Organisation, das die heute hartkodierten Werte als Default in die DB schreibt (nur wenn `color IS NULL` oder leer — vorhandene custom Werte werden respektiert):

```text
VS          → #00bfff
PASS        → #ef4444
SPÜLEN      → #10b981
CO          → #f59e0b
SERVICE     → #ffffff   (Default-Service-Pille bleibt weiß/schwarz)
BAR         → #3b82f6
GL          → #f59e0b
Hausmeister → #10b981
19 Uhr      → #8b5cf6
```

Match per `lower(name)`, organisationsweit. Keine Schema-Änderung nötig (Spalte `color text` existiert bereits).

## 2. Neue Server-Function `updateSkillColor`

Datei: `src/lib/admin/skills.functions.ts`

- `createServerFn({ method: "POST" })` + `requireSupabaseAuth`
- Input: `{ skillId: uuid, color: string | null }` (Validierung: `null` oder `^#[0-9a-fA-F]{6}$`)
- `loadAdminCaller(..., "admin")` → nur Admin
- `runGuarded` mit `writeAuditLog` (`action: "skill.update_color"`, entity `skill`, entityId, meta `{ color }`)
- Update via `supabaseAdmin` auf `skills`, gefiltert auf `organization_id = caller.organizationId` und `id = skillId`.

## 3. UI: Inline-Farb-Editor pro Chip (admin-only)

Datei: `src/routes/_authenticated/admin/staff.$staffId.tsx` (SkillsTab)

- Farbpunkt (`<span class="h-2.5 w-2.5 rounded-full">`) im Chip entfernen.
- Chip-Hintergrund = `sk.color` (mit gleicher `color-mix(... 85%, black)`-Logik wie `ShiftPill`, damit der Text lesbar bleibt). Aktiver Zustand: voller Hintergrund + weißer Text; inaktiv: nur dünner farbiger Rand + Text in Skill-Farbe, transparenter Hintergrund.
- Sonderfall „SERVICE" (weiß): wie in `ShiftPill` → schwarzer Text, kein color-mix.
- Neuer Hover-/Stift-Button am Chip, **nur wenn aktueller Nutzer Admin ist** (Rolle via vorhandenem `useAuthRole`/`adminQ`-Pattern im Tab abfragen; ansonsten `caller`-basiert über bestehenden Mechanismus). Klick öffnet kleinen Popover mit:
  - native `<input type="color">` (kein neues Dep)
  - „Zurücksetzen"-Button (setzt `color = null` → Chip wird neutral grau dargestellt)
  - „Speichern" ruft `updateSkillColor` via `useServerFn` auf
- Bei Erfolg: `queryClient.invalidateQueries({ queryKey: ["admin", "skills"] })` und `["skills"]` (Dienstplan-Cache), damit Dienstplan sofort die neue Farbe nutzt.

Klick auf Stift darf **nicht** das Chip-Toggle (an/aus-Auswahl) auslösen → `stopPropagation`.

## 4. ShiftPill aufräumen

Datei: `src/components/roster/ShiftPill.tsx`

- `serviceColorMap` und `kitchenColorMap` entfernen.
- `bg` = `shift.skillColor ?? "#9ca3af"` (Service-Default „X" bleibt weiß/schwarz wie bisher, basierend auf `label === "X"`).
- Restliche Logik (color-mix, isDefaultService, isPlanned) unverändert.

Damit ist die einzige Quelle für Skill-Farben künftig `skills.color`. Die Migration in Schritt 1 stellt sicher, dass das Dienstplan-Erscheinungsbild unverändert bleibt.

## 5. Verifikation

- `bunx tsc --noEmit`
- Dienstplan visuell: Pillen sehen identisch aus.
- Skills-Tab: keine Punkte mehr, Chips farbig hinterlegt, Stift-Icon nur für Admin, Farbänderung wirkt sofort in Dienstplan + Chips.

## Technisches

- Kein Schemawechsel, nur DATA-UPDATE → über die `insert`-Tool-Variante (Daten-Update), nicht über `migration` (Doku-Regel: Migrations nur für Schema). Migration wird also **nicht** benötigt.
- Audit-Log-Action `skill.update_color` ist neu — folgt dem bestehenden Muster (kein Enum-Constraint auf `audit_log.action`).
- `useServerFn`, `useQuery`, `useMutation` analog zum bestehenden SkillsTab.
- Popover: bestehendes shadcn `Popover` aus `@/components/ui/popover` (falls verfügbar) oder einfaches `<details>`-Element — entscheiden beim Bauen anhand vorhandener Komponenten.
