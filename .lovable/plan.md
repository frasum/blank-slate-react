## Ziel

Das deutliche „Pill"-Highlight für aktive Tabs aus `bestellung.tsx` (bg-primary/5, border-primary, font-semibold, rounded-t-md) wird zum **einheitlichen Tab-Stil** im gesamten System. Aktuell gibt es vier verschiedene Tab-Varianten — alle bekommen denselben Look.

## Betroffene Stellen

1. **`src/routes/_authenticated/admin/route.tsx`** — drei Nav-Bereiche:
   - Primary-Groups-Nav (Zeile 142–158): aktuell `border-b-2 border-foreground`
   - System-Groups-Nav (Zeile 164–179): aktuell `border-b-2 border-foreground` + gedimmtes inaktiv
   - Sub-Nav (Zeile 184–201): aktuell nur `font-medium text-foreground` ohne sichtbares Highlight
   - Payroll-Nav (Zeile 132–139): aktuell `border-b-2 border-foreground`

2. **`src/routes/_authenticated/admin/staff.$staffId.tsx`** (Zeile 53–78): Button-basierte Tabs (Stammdaten/Standorte/Skills/…), aktuell `border-b-2 border-primary`.

3. **`src/routes/_authenticated/admin/bestellung.tsx`** — bleibt unverändert (ist die Referenz).

## Vorgehen

- Eine gemeinsame Helper-Komponente `NavTab` (bzw. zwei Varianten: `<NavTab>` für `<Link>`, `<TabButton>` für `<button>`) in `src/components/ui/nav-tab.tsx` anlegen.
- Konstante Klassenpaare `tabBase` / `tabActive` exportieren, damit auch Stellen, die kein Link/Button-Wrapper nutzen wollen, denselben Stil bekommen.
- Aktive Klassen: `border-primary bg-primary/5 text-foreground font-semibold rounded-t-md`
- Inaktive Klassen: `border-b-2 border-transparent px-3 pb-2 pt-1 font-medium text-muted-foreground transition-colors hover:text-foreground`
- Beide bestehenden Tab-Container behalten ihre `border-b`-Linie als Tab-Bar.
- Die System-Groups (gedimmt) verlieren ihren Sonder-Inaktiv-Stil — Konsistenz schlägt Hierarchie; der `·`-Separator bleibt als visuelle Trennung.

## Nicht im Scope

- Keine Änderungen an Routen, Logik, Berechtigungen.
- Keine Änderungen an Komponenten außerhalb der genannten Nav-/Tab-Strukturen.
- Mobile-Verhalten bleibt wie gehabt (`flex-wrap`).
