# Batch-Weinrecherche (Welle 3-B)

## Ziel
Auf der Weinseite (Admin → Bestellung → Wein) eine Sammel-Recherche: für **alle Weine** hintereinander eine KI-Recherche laufen lassen. Ergebnisse zuerst als Vorschläge sammeln (Dry-Run), Frank prüft/hakt ab, dann Übernahme — auch für bereits befüllte Felder (Überschreiben erlaubt, ist der Sinn der Aktion).

## Umfang & Regeln
- **Alle Weine** (kein Filter auf leere Felder).
- Sequenziell, 1 Wein pro Aufruf, ~1 s Pause dazwischen (Firecrawl/Gemini-Ratelimit).
- Vorschläge sind Vorschläge: pro Feld eine Checkbox, die den **alten Wert** und den **neuen Wert** nebeneinander zeigt. Default-Anhaken:
  - leeres Feld → an
  - befülltes Feld + Vorschlag identisch → aus (nichts zu tun)
  - befülltes Feld + Vorschlag unterscheidet sich → **aus** (Frank muss aktiv „überschreiben" bestätigen)
- Manager+ (gleiche Schwelle wie `researchWine`).
- Kein Auto-Speichern: erst nach Franks Bestätigung → Sammel-Übernahme aller angehakten Vorschläge.
- Abbrechen-Button hält die Schleife an; bereits geholte Vorschläge bleiben sichtbar.

## Umsetzung

**1. Neue Server-Function** `researchWineById` in `src/lib/bestellung/wine-research.functions.ts`
- Input: `{ articleId: string }`.
- Lädt Artikel (Manager+, org-scoped, `category = 'Wein'`).
- Ruft intern die bestehende Recherche-Pipeline (Firecrawl + Gemini) mit `name` + Winzer/Herkunft als Hinweise.
- Gibt zurück: `{ articleId, name, current, suggestion, error? }` — `current` enthält die aktuellen Feldwerte für die Diff-Anzeige.
- Bei Firecrawl-„keine Treffer" / Rate-Limit: `error` statt Throw, damit der Batch weiterläuft.

**2. Neue UI-Sektion** auf `bestellung.wein.tsx` (oberhalb der Tabelle, einklappbar):
- Button **„🔎 Alle Weine recherchieren (N)"**.
- Fortschrittsanzeige: `x / N — aktuell: <Weinname>`, Abbrechen-Button.
- Ergebnisliste je Wein: pro Feld eine Zeile mit alt/neu, Checkbox (Default nach obiger Regel), Quellen-Links, Fehlerhinweise.
- Button **„Alle ausgewählten Vorschläge übernehmen"** → sequenziell `updateArticle` mit den angehakten Feldwerten (überschreibt).
- Ergebnisse sind Session-lokal (kein Speichern in DB); nach Reload weg.

**3. Kein Schema-Change, keine Migration.**

## Nicht-Ziel
- Kein automatisches Überschreiben ohne explizite Bestätigung pro Feld.
- Kein Parallelisieren (Kostenkontrolle, Ratelimit).
- Keine Änderung am Einzel-Recherche-Button.
- Keine neue Berechtigung.

## Erfolgs-Gate
- `tsc --noEmit`, ESLint, Prettier, Vitest grün.
- Manueller E2E: Recherche starten → Fortschritt läuft → Vorschläge mit alt/neu-Diff sichtbar → Default-Anhaken nur für Neuwerte, nicht für bestehende Werte → aktives Anhaken eines Konfliktfelds überschreibt beim Übernehmen → Abbrechen stoppt sauber.

## Technische Details
- Interne Recherche-Pipeline (`firecrawlSearch` + `extractWithGemini`) wird in einen wiederverwendbaren Helper extrahiert; `researchWine` und `researchWineById` nutzen ihn.
- Batch läuft im Browser (nicht als Server-Function-Loop), damit Fortschritt/Abbruch reaktiv sind und keine Worker-Timeouts drohen.
- State-Shape im Component: `Map<articleId, { status: 'pending'|'done'|'error', current?, suggestion?, error?, selected: Record<Feld, boolean> }>`.
- Übernahme baut pro Wein ein `patch`-Objekt nur mit angehakten Feldern und ruft das bestehende `updateArticle`.
