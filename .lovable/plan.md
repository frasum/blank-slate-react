## Ziel
Safari soll PDF-, Excel- und CSV-Exporte zuverlässig starten — ohne Blob-Link, ohne verstecktes iframe, ohne leere Hilfsseite.

## Beobachtung
Der aktuelle Code erzeugt die Datei im Browser und sendet sie danach per verstecktem iframe/Form-POST an `/api/export/download`. Bei Safari kommt offenbar nicht einmal ein sichtbarer Request an bzw. der Download wird weiter blockiert. Deshalb wechseln wir auf einen Safari-stabileren Top-Level-Form-Submit.

## Plan
1. **Download-Helfer umbauen**
   - `downloadBlobAsAttachment` bleibt der zentrale Exportpfad.
   - Statt `target` auf ein verstecktes iframe zu setzen, wird das Formular als echter Top-Level-POST ohne `target` abgeschickt.
   - Safari behandelt das dann wie einen normalen Datei-Download mit `Content-Disposition: attachment`.
   - Ergebnis: keine leere Seite, keine versteckte iframe-Abhängigkeit.

2. **Fehlerpfad sichtbar machen**
   - Wenn die Datei-Erzeugung vor dem Absenden scheitert, bleibt die Toast-Fehlermeldung wie bisher.
   - Der Server-Endpunkt gibt bei ungültigem Payload weiterhin Klartextfehler zurück.

3. **Export-Endpunkt beibehalten, aber prüfen**
   - `/api/export/download` bleibt app-intern und liefert weiterhin:
     - `Content-Disposition: attachment`
     - korrekten `Content-Type`
     - `Cache-Control: no-store`
   - Keine Änderung an den Exportinhalten/Formeln.

4. **Aufräumen**
   - iframe-spezifische Hilfsfunktion entfernen.
   - Sicherstellen, dass PDF, Excel und CSV weiterhin denselben Helfer nutzen.

5. **Verifikation**
   - HTTP-Test des Endpunkts auf `Content-Disposition: attachment`.
   - Browser-Baseline in Chromium für PDF/XLSX/CSV.
   - Danach bitte Safari einmal hart neu laden und testen; falls Safari dann trotzdem nicht lädt, ist der nächste Schritt keine weitere Browsertechnik, sondern echte serverseitige Dateierzeugung mit GET-Link pro Exportart.