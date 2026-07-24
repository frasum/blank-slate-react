## Plan

1. **Download-Helfer Safari-fest machen**
   - Den zentralen Helfer `downloadBlobWithAnchor` so umbauen, dass er den Download im direkten Button-Klick-Kontext startet.
   - Für Safari zusätzlich einen Fallback einbauen: wenn `<a download>` mit `blob:` nicht zuverlässig greift, wird die Datei in einem neuen Tab/Fenster geöffnet statt still nichts zu tun.
   - Die Aufräumzeit für `URL.revokeObjectURL` weiterhin verzögert lassen, damit Safari den Blob nicht zu früh verliert.

2. **CSV-Pfad angleichen**
   - Der CSV-Export nutzt aktuell `downloadBlob(...)`, PDF/Excel nutzen `prepareDownloadAnchor(...)` plus späteren Blob.
   - Ich gleiche das Verhalten so an, dass alle Exportarten denselben robusten Download-Helfer verwenden.

3. **Fehler sichtbar machen**
   - Falls Safari Popups/Downloads blockiert oder kein Fenster öffnen kann, wird eine klare Toast-Meldung angezeigt, statt dass „nichts passiert“.

4. **Prüfung**
   - Prüfen, dass die Buttons weiterhin denselben Dateinamen und Dateityp erzeugen.
   - Per Code-/Browserprüfung sicherstellen, dass kein Exportpfad mehr den alten stillen Safari-Fall nutzt.

## Technische Details

- Betroffen ist zentral `src/lib/time/weekly-export.ts` mit `downloadBlobWithAnchor` / `downloadBlob`.
- Betroffene Aufrufer liegen in `src/routes/_authenticated/admin/zeit-uebersicht.tsx` für Wochenplan, Zusammenfassung und Buchhaltung.
- Ich ändere keine Exportinhalte, keine Rundungslogik und keine Berechtigungen — nur den Browser-Download-Mechanismus.