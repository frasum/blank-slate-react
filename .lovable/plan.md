## Ziel

In den Tabs **Zusammenfassung** und **Buchhaltung** (`/admin/zeit-uebersicht`) erscheint unter jedem Rufnamen in der Mitarbeiter-Spalte eine kleinere Zweitzeile mit `Vorname Nachname`. Exporte (PDF/Excel/CSV) bleiben unverändert.

## Umfang

- Betroffen: `src/routes/_authenticated/admin/zeit-uebersicht.tsx` — nur die zwei Tabs `summary` und `payroll`.
- Nicht betroffen: Wochenplan-Tab, Perioden-Tab, Brutto-Tab, alle Export-Funktionen (`buildBuchhaltungPdf`/`Xlsx`/`Csv`), `time-admin.functions.ts`, DB.

## Umsetzung

1. In der Komponente einen Lookup `fullNameByStaffId: Map<string, string>` aus `staffAllQ.data` bilden (`listStaff` liefert bereits `firstName`/`lastName`). Voller Name = `[firstName, lastName].filter(Boolean).join(" ").trim()`.
2. Anzeige-Regel: Zweitzeile nur rendern, wenn der volle Name nicht leer UND nicht case-insensitiv gleich dem `displayName` ist (verhindert Duplikate wie „APPEL / Appel").
3. Zusammenfassung-Tab: In der `MITARBEITER`-Zelle den bestehenden `displayName` als Haupttext lassen und darunter ein `<div class="text-xs text-muted-foreground">{fullName}</div>` einfügen.
4. Buchhaltung-Tab: Analog in der `Mitarbeiter`-Zelle der Render-Tabelle. Der Export-Input (`buchhaltungExportInput`) wird nicht verändert — dort bleibt `displayName` einzeilig, damit PDF/Excel/CSV wie bisher aussehen.

## Tests & Gates

Reine Präsentationsänderung, kein neuer Unit-Test nötig. Vor Commit:

- `tsgo --noEmit` (0 Fehler)
- `bunx eslint . --max-warnings=0`
- `bunx vitest run` (weiter grün; kein neuer Test erwartet)
- `bunx prettier --check .`

## Erfolgs-Gate

- Zusammenfassung + Buchhaltung: unter jedem Rufname steht in kleiner Schrift der volle Name; keine Zweitzeile, wenn `first_name`/`last_name` fehlen oder identisch zum Rufnamen sind.
- Buchhaltungs-Export (PDF/Excel/CSV) unverändert (nur Rufname).