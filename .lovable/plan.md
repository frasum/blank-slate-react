## Ziel
Die Sub-Tabs (Wochenplan, Zusammenfassung, Buchhaltung, Perioden, Brutto/Netto, Provision) in `src/routes/_authenticated/admin/zeit-uebersicht.tsx` sollen optisch identisch zu den Top-Tabs (Arbeitszeiten, Dienstplan, …) aus `NavTab`/`TabButton` sein — inkl. Location-Farbthema über `--loc-accent`.

## Änderung (nur eine Datei)
`src/routes/_authenticated/admin/zeit-uebersicht.tsx`

1. `TabsList`/`TabsTrigger`-Import entfernen; stattdessen `TabButton` aus `@/components/ui/nav-tab` importieren.
2. Den `<Tabs value=… onValueChange=…>`-Wrapper und alle `<TabsContent>`-Blöcke unverändert lassen (Content-Umschaltung bleibt state-gesteuert).
3. Den `<TabsList>`-Block ersetzen durch eine horizontale Leiste im Look der Top-Tabs:
   - Container: `flex flex-wrap gap-1 border-b border-border mb-4` (analog zu bestehenden Sub-Navs).
   - Jede Sektion als `<TabButton active={activeTab === "…"} onClick={() => setActiveTab("…")}>Label</TabButton>`.
   - Bestehende `!isPlaner`-Sichtbarkeitsregeln beibehalten; für Planer nur „Wochenplan" mit `active={true}`.

## Nicht ändern
- Keine Logik, keine Query-, Export- oder Aggregations-Änderungen.
- `TabsContent`-Struktur, IDs (`weekly`, `summary`, `payroll`, `periods`, `lohnrechner`, `provision`) und State bleiben identisch.
- Keine anderen Dateien.

## Ergebnis
Sub-Tabs übernehmen dasselbe Pill-Design mit Standort-Akzentfarbe (Spicery gelb, Ja rot, TSB blau) wie die obere Admin-Navigation.