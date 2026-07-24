## Ziel

Safari soll PDF, Excel und CSV nicht mehr aus dem eingebetteten Lovable-Preview-Frame herunterladen müssen. Stattdessen wird beim Klick ein echter neuer Browser-Tab geöffnet und der Export per POST dorthin geschickt. Der bestehende `/api/export/download`-Endpunkt bleibt unverändert als Attachment-Auslieferung.

## Warum dieser Ansatz

Die Diagnose zeigt `HTTP 200` und korrekte Attachment-Header. Der Endpunkt funktioniert also. Dass Safari trotzdem keinen Download startet, passt zu Safaris strenger Behandlung von Downloads aus eingebetteten Frames/Preview-Umgebungen. Deshalb wechseln wir den Browser-Kontext, nicht den Dateityp oder die Serverantwort.

## Umsetzung

1. **Neuen Safari-sicheren Download-Flow in `weekly-export.ts` bauen**
   - Direkt im Button-Klick synchron einen neuen Tab öffnen (`window.open`).
   - Während PDF/Excel/CSV erzeugt wird, bleibt der Tab mit einer kurzen Warteseite offen.
   - Danach wird ein verstecktes POST-Formular mit `target` auf diesen Tab an `/api/export/download` gesendet.
   - Die Antwort ist weiterhin `Content-Disposition: attachment`, aber jetzt in einem echten Top-Level-Tab statt im Preview-Frame.

2. **Fallback beibehalten**
   - Falls Safari/Browser den neuen Tab blockiert, fällt der Code auf den bisherigen Formular-Submit zurück.
   - Fehler beim Erzeugen des Exports werden im geöffneten Tab sichtbar gemacht, damit nicht wieder nur „nichts passiert“.

3. **Alle Export-Buttons auf denselben Helfer lassen**
   - PDF, Excel und CSV nutzen weiterhin denselben `downloadBlobAsAttachment`-Pfad.
   - Keine getrennten Sonderlösungen pro Format.

4. **Diagnose-UI vorerst behalten**
   - Der Diagnose-Button bleibt drin, bis du Safari erfolgreich bestätigt hast.
   - Danach können wir ihn separat entfernen.

5. **Prüfung**
   - HTTP-Endpunkt weiterhin auf `200`/Attachment prüfen.
   - Chromium-Baseline für PDF/Excel/CSV-Download prüfen.
   - Safari kann ich hier nicht nativ ausführen; der relevante Unterschied ist aber explizit adressiert: Download nicht mehr aus dem eingebetteten Preview-Frame, sondern aus einem echten neuen Tab.

## Dateien

- `src/lib/time/weekly-export.ts`
- Falls nötig nur kleine Anpassung in `src/routes/_authenticated/admin/zeit-uebersicht.tsx`, damit der Button-Klick den neuen synchronen Tab-Flow sauber anstößt.