## Ziel
Zebra-Streifen für die Buchhaltungs-Tabelle (Screenshot: `PayrollTab`) — Mitarbeiterzeilen abwechselnd hell/leicht getönt, damit die Zeilen bei vielen Spalten (Rate / Dauer-Notiz rechts) besser als Einheit lesbar bleiben.

## Umfang
- **Nur** `src/components/zeit/PayrollTab.tsx` (die Ansicht im Screenshot).
- Analog **auch** `src/routes/_authenticated/admin/zeit-uebersicht.tsx` (Zusammenfassung), damit beide großen Tabellen konsistent aussehen.
- Keine anderen Tabellen anfassen (Kasse-Saldo, Trinkgeld-Rest, Provision etc. bleiben wie sie sind — dort wurde kein Wunsch geäußert).

## Umsetzung
1. Zebra nur auf **Datenzeilen** je Abteilung, nicht auf Header-/Summenzeilen:
   - Innerhalb jedes Abteilungs-Blocks (`kitchen`/`service`/…) beim `.map((s, idx) => …)` eine Klasse an `<TableRow>` hängen: `idx % 2 === 1 ? "bg-muted/30" : ""`.
   - Der Zebra-Zähler startet pro Abteilung neu (klarer visueller Bruch am Abteilungs-Header „KÜCHE" etc.).
2. Abteilungs-Kopfzeilen (`DEPT_BG[dept]`), Zwischen-/Gesamtsummen (`bg-muted/50`, `bg-muted font-semibold`) bleiben unverändert — Zebra wirkt nur auf Mitarbeiterzeilen und stört die Hierarchie nicht.
3. Hover-Verhalten unverändert lassen (kein neuer Hover-Override nötig, weil `bg-muted/30` < shadcn-Hover deckt).
4. Keine Style-Änderung an Chips („Miete 280, Pfändung"), Zellinhalten, Spalten, Sortierung, Logik.

## Gates
`tsgo --noEmit`, `eslint . --max-warnings=0`, `vitest run`, `prettier --check .` — alles muss grün bleiben. Rein visueller Patch, es sind keine Testanpassungen zu erwarten.

## Nicht enthalten
- Keine Änderung an Farbschema/Location-Themes.
- Keine Änderung an anderen Reitern (Wochenplan/Perioden/Brutto/Netto/Provision).