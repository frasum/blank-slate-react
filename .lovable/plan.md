## Plan: Safari-Export reparieren

**Ziel:** PDF-, Excel- und CSV-Exports sollen in Safari nicht mehr ins Leere laufen, sondern zuverlässig als Datei heruntergeladen werden.

### 1. Download-Strategie ändern
- Den aktuellen reinen Browser-Download (`Blob` + `<a download>` + `a.click()`) nicht mehr als einzigen Weg verwenden.
- Für die Arbeitszeiten-/Buchhaltung-Exports einen echten HTTP-Download einführen, weil Safari serverseitige Downloads mit `Content-Disposition: attachment` deutlich zuverlässiger behandelt.

### 2. Export-Dateien serverseitig ausliefern
- Eine TanStack-Server-Route für Downloads anlegen, z. B. unter `/api/public/export/...` oder app-internem `/api/export/...`.
- Die Route gibt die Datei mit diesen Headern zurück:
  - `Content-Type` passend zu PDF/XLSX/CSV
  - `Content-Disposition: attachment; filename="..."`
  - `Cache-Control: no-store`
- Eingaben werden validiert; keine Personaldaten in URL-Parametern.

### 3. UI-Buttons auf servergestützten Download umstellen
- PDF-, Excel- und CSV-Buttons in **Zusammenfassung** und **Buchhaltung** erzeugen weiter dieselben Daten.
- Statt Blob direkt per Safari-anfälligem Klick herunterzuladen, wird die Datei über die neue Download-Route ausgeliefert.
- Der vorhandene Browser-Helfer bleibt als Fallback für andere einfache Exporte bestehen, aber die betroffenen Arbeitszeiten-/Buchhaltung-Buttons nutzen den robusten Weg.

### 4. Fehler sichtbar machen
- Wenn die Übergabe an die Download-Route fehlschlägt, erscheint ein Toast statt „es passiert nichts“.
- Die alte leere „Export wird vorbereitet“-Popup-Logik bleibt entfernt.

### 5. Prüfung
- Chromium lokal als Baseline prüfen.
- Safari selbst kann ich hier nicht direkt ausführen; nach Implementierung bekommst du eine kurze Testmatrix mit: Chrome/Chromium geprüft, Safari manuell zu prüfen auf PDF/XLSX/CSV.