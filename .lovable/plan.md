## Ziel
Den Summen-Umschalter aus der Filterzeile in den Wochenplan-Header verlegen, dort vertikal gestapelt zwischen der Sonntag-Spalte und der Ges-Spalte, und "Abrechnungsmonat" zu "Monat" kürzen.

## Änderungen

### `src/components/zeit/WeeklyPlan.tsx`
- Neue optionale Prop `onTotalsScopeChange?: (v: "week" | "period") => void`.
- Das aktuell leere Spacer-`TableHead` zwischen Tagen und Ges (Zeilen 351–354, `w-[56px]` mit `border-l`) wird zum Container für den Toggle:
  - Zwei kleine, vertikal gestapelte Pill-Buttons ("Woche" oben, "Monat" unten).
  - Aktiver Button: gefüllt (bg-foreground/text-background), inaktiver: outline.
  - Klick ruft `onTotalsScopeChange` auf. Fällt die Prop weg, bleibt die Zelle leer (Read-only-Fallback).
  - Breite bleibt 56px, `rowSpan={2}` bleibt, damit das Grid unverändert bleibt.

### `src/routes/_authenticated/admin/zeit-uebersicht.tsx`
- Den `PillSelect`-Block in der Filterzeile (Zeilen 1037–1046) entfernen; PDF-/Excel-Buttons bleiben rechtsbündig.
- `onTotalsScopeChange={setTotalsScope}` an `<WeeklyPlan …/>` durchreichen.

## Nicht angefasst
- Perioden-Aggregatslogik, Overview-Batch, Sternchen/Tooltips an Ges/20–24/24–x/SF, Export-Buttons, sonstige Filter.
