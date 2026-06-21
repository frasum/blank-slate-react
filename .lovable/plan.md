## Ziel

Standort-Auswahl in COCO konsistent als Pill-Buttons darstellen — nicht mehr als Dropdown. Zugrundeliegende Komponente generisch („einzige Pflicht-Auswahl mit wenigen Optionen"), damit wir sie später auch für Rolle/Zeitraum/Kategorie nutzen können, ohne erneut zu refaktorieren.

## 1. Neue UI-Primitive

**`src/components/ui/pill-select.tsx`** — generische, kontrollierte Pill-Gruppe.

API:
```ts
type PillSelectOption<T extends string> = { value: T; label: string };
type Props<T extends string> = {
  options: PillSelectOption<T>[];
  value: T | null;
  onChange: (value: T) => void;
  ariaLabel: string;        // statt visuellem Label
  size?: "sm" | "md";       // md default
  className?: string;
};
```

Verhalten:
- `role="radiogroup"`, jede Pille `role="radio"` mit `aria-checked`.
- Aktiv: `bg-primary text-primary-foreground` (Primärfarbe, voll gefüllt).
- Inaktiv: `border-border bg-card text-foreground hover:bg-muted`.
- Tastatur: Pfeiltasten wechseln Auswahl (analog Radiogroup-Pattern).
- Flex-wrap, kompakter Container (`gap-2`), kein äußerer Rahmen (anders als die ältere zeit-uebersicht-Variante, damit es zwischen H1 und Filtern leicht wirkt).
- Bei `options.length === 0`: rendert `null`.
- Optionaler Spezialfall „Alle": Aufrufer reicht eine extra Option `{ value: "__all__", label: "Alle" }` selbst durch — die Komponente bleibt rein generisch.

Kein neues Theme-Token nötig; nutzt vorhandene Tailwind-Semantik.

## 2. Standort-Wrapper

**`src/components/shared/LocationPills.tsx`** — dünner Wrapper, der `PillSelect` mit Standorten füttert und die wiederkehrende „erste Location automatisch wählen"-Logik wegnimmt.

```ts
type Props = {
  locations: { id: string; name: string }[];
  value: string;                  // "" = noch nichts gewählt
  onChange: (id: string) => void;
  includeAll?: boolean;           // default false; rendert zusätzlich "Alle" mit value "__all__"
  className?: string;
};
```

Aufrufer behalten ihre `useEffect`-Default-Auswahl (Verhalten unverändert).

## 3. Umstellung der Aufrufstellen

Alle drei `SelectTrigger`-Standortwähler ersetzen:

1. **`src/routes/_authenticated/admin/aufgaben.tsx`**
   - Select oben rechts entfernen.
   - `<LocationPills>` zwischen Headerblock (H1 + Untertitel) und der Kategorie-Filterleiste platzieren, linksbündig.
   - Layout: H1 oben links, „+ Neue Aufgabe" oben rechts (Button bleibt); darunter `Standort:` + Pillen; darunter `Kategorie:` + Kategorie-Pillen (bestehend).

2. **`src/routes/_authenticated/zeit/aufgaben.tsx`**
   - Identisch: Pillen über den Kategorien, Dropdown entfällt.

3. **`src/routes/_authenticated/admin/kasse.tsx`** (Zeile ~375)
   - Standort-Select durch Pillen ersetzen. Label „Standort" als kleine Überschrift (`text-xs text-muted-foreground`) darüber, damit es zu den anderen Filtern der Kassen-Toolbar passt.

4. **`src/routes/_authenticated/admin/kasse-saldo.tsx`** (Zeile ~194)
   - Pillen inkl. `includeAll`. Vorhandener `__all__`-Sentinel bleibt.

5. **`src/routes/_authenticated/admin/zeit-uebersicht.tsx`** (Zeile ~793)
   - Inline-Pill-Code (Card mit Label „Standort" + „Alle"-Pill) durch `<LocationPills includeAll />` ersetzen. Card-Wrapper + Label bleiben für Layout-Konsistenz mit „Periode" daneben.

6. **`src/routes/_authenticated/admin/bestellung.easyorder-verwaltung.tsx`** (Zeile ~390)
   - Das ist ein Standort-Select **innerhalb eines Dialogs** (Zuweisung Mitarbeiter→Standort). Hier bleibt es bewusst beim Dropdown — Pillen brauchen horizontalen Platz, im Dialog mit ggf. vielen Standorten in einer engen Spalte unpassend. Im Plan ausdrücklich ausgenommen.

Andere `SelectTrigger`-Funde betreffen Mitarbeiter, Lieferanten, Rollen mit potenziell vielen Optionen — nicht Teil dieses Schritts (Schwelle: ≤ ~6 Optionen + Pflicht).

## 4. Nicht angefasst

- Logik der Seiten (Queries, Defaults, Mutations).
- Task-RPCs / Migrationen.
- Skill-Filter im TaskCreateDialog (separater laufender Task).
- Mitarbeiter-/Rollen-/Lieferanten-Selects.

## 5. Verifikation

- `tsc --noEmit`, `eslint`, `prettier --check`, `vitest run` grün.
- Preview: Aufgaben (Admin + Zeit), Kasse, Kasse-Saldo, Zeit-Übersicht — Standort lässt sich per Pill wechseln, Default-Auswahl wie vorher, keine Layoutbrüche bei 1–6 Standorten.
- Konsistenzcheck per Screenshot: aktive Pille = `primary` Vollfläche, inaktive = neutraler Rahmen, identisch über alle Seiten.

## 6. Memory-Update (nach Approval)

Neue Core-Regel in `mem://index.md`:
> Standort-Auswahl (und vergleichbare Pflicht-Auswahlen mit ≤ 6 Optionen) als `PillSelect`/`LocationPills`, nicht als Dropdown.
