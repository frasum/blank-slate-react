## Problem

Die Buttons **PDF / Excel / CSV** im Buchhaltungs-Tab (und dieselbe Mechanik in weiteren Exporten) tun im Preview scheinbar nichts. Instrumentierung zeigt: der Blob wird korrekt gebaut (CSV 1,7 KB, XLSX 8,9 KB), `URL.createObjectURL` liefert eine gültige URL, der `<a download="…">`-Klick wird ausgeführt — es entsteht nur keine Datei.

Ursache: `downloadBlob` in `src/lib/time/weekly-export.ts` setzt `a.target = "_self"`. Der Lovable-Preview-Iframe blockiert Blob-Downloads über `_self` (fehlendes `allow-downloads` in bestimmten Sandbox-Konstellationen). In der veröffentlichten App (Top-Level-Dokument) funktioniert derselbe Code, deshalb ist es bisher nicht aufgefallen.

## Fix (ein Commit, nur Frontend)

**Datei:** `src/lib/time/weekly-export.ts` — Funktion `downloadBlob`

- `a.target = "_self"` → `a.target = "_blank"` (und `rel = "noopener"` beibehalten).
- Kein weiterer Verhaltenswechsel: gleicher Dateiname, gleicher Blob, gleiches `URL.revokeObjectURL`-Timing.

Effekt: Der Klick wird als Top-Level-Navigation gewertet, die im Preview-Iframe erlaubt ist; der Browser übernimmt den Download regulär via `download`-Attribut. In der veröffentlichten App bleibt das Verhalten unverändert (kein sichtbares neues Tab, weil `download` gesetzt ist).

Das trifft automatisch alle Nutzer der Helper-Funktion: Wochenplan-Export, Bargeldübersicht, Buchhaltungs-Export (PDF/Excel/CSV), Provisions-CSV etc.

## Verifikation

- Preview neu laden, im Buchhaltungs-Tab je einmal PDF / Excel / CSV klicken → Datei landet in Downloads.
- Kein neues Tab bleibt offen (dank `download`-Attribut).
- Kurz gegenprüfen: Bargeldübersicht-Export und Wochenplan-Export weiterhin ok.

## Kein Scope

- Keine Änderungen an Datenaggregation, Rollen-Guards oder Export-Inhalten.
- Keine Doku-Nachzüge nötig (interner Bugfix, nicht arbeitsweisen-relevant).
