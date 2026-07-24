## Ziel
Die drei Export-Pfade (PDF, Excel, CSV) auf macOS Safari nachweislich prüfen und ein Ergebnisprotokoll mit Browser-/Versionsinfos liefern.

## Einschränkung vorab
Die Sandbox hat nur Headless-Chromium (Playwright). Echtes macOS Safari lässt sich hier nicht instrumentieren — ein „automatisch verifiziert" auf Safari ist technisch nicht möglich. Der Plan liefert deshalb zwei Bausteine:

1. Was ich hier automatisiert prüfen kann (Chromium-Referenzlauf + Code-Audit des Safari-Pfads).
2. Ein präzises, kurzes Checkskript für dich auf dem Mac, dessen Ergebnisse ich anschließend in eine Tabelle gieße.

## Schritt 1 — Code-Audit `src/lib/time/weekly-export.ts`
- Bestätigen, dass nach dem letzten Fix kein `window.open`/Data-URL-Sonderweg mehr existiert und alle drei Exportarten denselben `downloadBlobWithAnchor`-Helfer verwenden.
- Aufrufer prüfen: `src/routes/_authenticated/admin/zeit-uebersicht.tsx` (PDF/Excel/CSV in „Zusammenfassung"), `src/components/zeit/PayrollTab.tsx` (Buchhaltung), `src/lib/lohn/lohn-excel-export.ts` (Lohn).
- Ergebnis: EIN Download-Pfad, `a.click()` in Nutzergeste-Kette, `URL.revokeObjectURL` nach 60 s.

## Schritt 2 — Chromium-Referenzlauf (Playwright, headless)
- Login-Session aus `LOVABLE_BROWSER_SUPABASE_*` restaurieren, `/admin/zeit-uebersicht` öffnen, KW/Monat wählen.
- Je Tab (Zusammenfassung, Buchhaltung) den entsprechenden Button klicken und via `page.expect_download()` prüfen:
  - Dateiname (`Wochenplan_*.xlsx`, `Buchhaltung_*.pdf`, `Buchhaltung_*.csv`)
  - MIME/Größe > 0
  - Kein „Export wird vorbereitet"-Tab öffnet sich (Regressionscheck).
- Ergebnis dient als Baseline: „In Chromium klappt jeder Pfad, ohne Popup".

## Schritt 3 — Manuelle Safari-Verifikation (durch dich)
Ich stelle dir ein Mini-Checkskript (5 Klicks, ~2 Min). Du meldest je Zeile „ok" / „leer" / „Fehler". Ich trage es dann in die Ergebnistabelle ein.

```text
Safari-Version:  Safari > Über Safari  →  z. B. 17.5 (19618.2.12)
macOS-Version:   Apple-Menü > Über diesen Mac  →  z. B. Sonoma 14.5

Test 1 — Zusammenfassung → PDF-Export        →  Datei geladen? [ ]
Test 2 — Zusammenfassung → Excel-Export      →  Datei geladen? [ ]
Test 3 — Zusammenfassung → CSV-Export        →  Datei geladen? [ ]
Test 4 — Buchhaltung    → PDF-Export         →  Datei geladen? [ ]
Test 5 — Buchhaltung    → Excel-Export       →  Datei geladen? [ ]
Test 6 — Buchhaltung    → CSV-Export         →  Datei geladen? [ ]
Beobachtung: öffnet sich noch ein leerer Tab? [ja/nein]
Safari-Einstellung „Downloads": Fragen / Nachfragen / Automatisch?  ______
```

## Schritt 4 — Ergebnistabelle
Sobald deine Rückmeldung da ist, erstelle ich:

```text
Browser            | Version    | PDF | Excel | CSV | Leerer Tab
Chromium (headless)| Playwright | ok  | ok    | ok  | nein
Safari macOS       | <deine>    | ?   | ?     | ?   | ?
```

Plus, wenn ein Pfad in Safari nicht funktioniert: konkreter Folge-Fix-Vorschlag (z. B. FileSaver.js-Fallback oder Server-Route `/api/public/export/*` mit `Content-Disposition: attachment`, was Safari zuverlässig als Download akzeptiert).

## Was ich in diesem Turn nach Freigabe tue
- Code-Audit (Schritt 1) durchführen und Ergebnis kurz zusammenfassen.
- Playwright-Skript unter `/tmp/browser/export-check/` schreiben und laufen lassen (Schritt 2).
- Das Checkskript aus Schritt 3 als Chat-Text an dich zurückgeben.
- KEIN Code ändern — nur Verifikation.

Wenn du danach die Safari-Ergebnisse zurückmeldest, folgt in einem zweiten Plan entweder „alles grün, dokumentieren" oder ein gezielter Fix.
