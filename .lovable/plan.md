## Ziel
Payroll und Admin können in Wochenplan, Zusammenfassung und Buchhaltung auf den Mitarbeiternamen klicken und landen direkt in den Stammdaten des Mitarbeiters. Auf der Stammdaten-Seite erscheint ein „Zurück"-Button, der zurück zur vorherigen Ansicht führt.

## Umsetzung

**1. Rollen-Gate**  
Nur Rollen `admin` und `payroll` erhalten den Klick-Link. Andere Rollen (manager, staff …) sehen den Namen unverändert als Text — kein Rechtebruch.

**2. Rücksprung-Mechanik**  
Route `/_authenticated/admin/staff/$staffId` bekommt einen optionalen Search-Parameter `from` (String, URL-kodierter Rücksprung-Pfad inkl. Query). Beim Klick auf einen Namen setzen wir `from=<aktuelle URL inkl. Search>`. Ein neuer Zurück-Button (oben links auf der Stammdaten-Seite) navigiert per `useNavigate` auf `from`, wenn vorhanden; sonst Fallback auf `/admin/staff`.

**3. Klickbare Namen**
- `src/routes/_authenticated/admin/dienstplan.tsx` (Wochenplan): Zellen mit `r.displayName` in der Mitarbeiter-Spalte → `<Link>` (nur wenn admin/payroll).
- `src/routes/_authenticated/admin/zeit-uebersicht.tsx` (Zusammenfassung, Zeile ~1557): `s.displayName` → `<Link>`.
- `src/components/zeit/PayrollTab.tsx` (Buchhaltung, Zeile 384 `PayrollRow`): `row.displayName` → `<Link>`. Rollen-Flag als Prop `canOpenStaff` durchreichen (aus `zeit-uebersicht.tsx`, wo `identity` bereits verfügbar ist).

Optik: identisch zur bestehenden Konvention aus `staff.index.tsx` (`className="font-medium text-foreground hover:underline"`). Der zweizeilige „Vor- und Nachname"-Untertext bleibt Text.

**4. Zurück-Button auf Stammdaten**
`src/routes/_authenticated/admin/staff.$staffId.tsx`:
- `validateSearch: (s) => ({ from: typeof s.from === "string" ? s.from : undefined })`.
- Oben im Header (vor `<h1>`) neuer Button „← Zurück" mit `useNavigate({ from })` — falls `from` fehlt, Link zu `/admin/staff`. Immer sichtbar, damit auch der bisherige Einstieg über die Mitarbeiterliste unverändert funktioniert (führt dann zur Liste zurück).

## Nicht angefasst
- Keine Änderungen an bestehendem Rechte-Modell, keine Server-Funktionen, keine DB-Migrationen.
- Rendering des Namens in anderen Bereichen (Kasse, Urlaub etc.) bleibt unverändert — der Auftrag adressiert nur die drei genannten Ansichten.
- Der bestehende Einstieg über `staff.index.tsx` bleibt gleich (Zurück-Button geht dann zur Liste).

## Offene Klärung
Soll der Zurück-Button auch dann erscheinen, wenn man die Stammdaten wie bisher direkt über „Mitarbeiter" öffnet (dann Fallback auf `/admin/staff`), oder nur, wenn der Nutzer wirklich aus Wochenplan/Zusammenfassung/Buchhaltung kommt (also `from` gesetzt ist)? Ich schlage Variante 1 (immer sichtbar mit Fallback) vor — okay?