## Ziel
In der Mitarbeiter-Matrix (`src/routes/_authenticated/admin/staff.index.tsx`) bekommen die drei Abteilungs-Pills im **aktiven** Zustand departments-spezifische Farben:
- **S** (service) → blau
- **K** (kitchen) → gelb
- **GL** (gl) → rot

Inaktive Pills bleiben unverändert (neutraler Rahmen, kein Fill).

## Umsetzung

### 1. Semantische Tokens in `src/styles.css`
Drei neue OKLCH-Token-Paare im `:root`-Block (und `.dark`-Variante, falls vorhanden), passend zum bestehenden System:
- `--dept-service` / `--dept-service-foreground` (blau, weißer Text)
- `--dept-kitchen` / `--dept-kitchen-foreground` (gelb, dunkler Text für Kontrast)
- `--dept-gl` / `--dept-gl-foreground` (rot, weißer Text)

Im `@theme inline`-Block die passenden `--color-dept-*`-Aliase ergänzen, damit Tailwind-Klassen `bg-dept-service` etc. generiert werden.

### 2. `staff.index.tsx`
Neue Map neben `DEPARTMENT_SHORT`:
```ts
const DEPARTMENT_ACTIVE_CLASS: Record<StaffDepartment, string> = {
  service: "border-dept-service bg-dept-service text-dept-service-foreground",
  kitchen: "border-dept-kitchen bg-dept-kitchen text-dept-kitchen-foreground",
  gl: "border-dept-gl bg-dept-gl text-dept-gl-foreground",
};
```
Im `className`-Block des Pill-Buttons (Zeile ~478–484) den aktiven Zweig durch `DEPARTMENT_ACTIVE_CLASS[dept]` ersetzen statt `border-primary bg-primary text-primary-foreground`. Inaktiver Zweig + Disabled-Opacity unverändert.

### 3. Scope-Grenzen
- Reine UI-/Farb-Änderung; keine Logik-, Daten- oder Verhaltensänderung.
- `PillSelect`, `LocationPills` und andere Pill-Stellen werden **nicht** angefasst (Abteilungs-Pills sind speziell zur Mitarbeiter-Matrix).
- Tests müssen unverändert grün bleiben.

### 4. Verifikation
- `npx tsc --noEmit`, `npx eslint . --max-warnings=5`, `npx prettier --check .`, `npx vitest run` (738) grün.
- Visuelle Kontrolle via Playwright-Screenshot auf `/admin/staff`: aktive S blau, K gelb, GL rot; inaktive Pills neutral.
