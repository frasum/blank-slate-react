## Problem

In `SessionFieldsCard` werden alle Eingaben (Umsatz-Kanäle, Terminals, Gutscheine, Gästeanzahl, Notiz, Bargeld-Ist) nur im lokalen React-State gehalten. Sie landen erst nach Klick auf **„Session speichern"** in der DB. Beim Tab-Wechsel oder Reload ist der lokale State weg → Eingaben verloren.

## Lösung: Auto-Save mit Debounce

Statt manuellem Speichern-Button wird jede Änderung automatisch gespeichert — ca. 800 ms nach der letzten Tastatureingabe (Debounce, damit nicht jedes Zeichen einen Request auslöst).

### Verhalten

- Tippen in irgendeinem Feld → nach 800 ms Stille läuft `onSave(payload)` automatisch.
- Beim Verlassen des Feldes (`onBlur`) und vor Unmount wird ein ausstehender Save sofort geflusht.
- Status oben rechts in der Card: „Gespeichert · HH:MM" / „Speichert…" / „Ungespeicherte Änderungen".
- Validierung wie bisher: Wenn ein Feld kein gültiger Euro-Wert ist, kein Save (Status zeigt „Eingabe ungültig"), restliche gültige Felder werden beim nächsten gültigen Zustand mitgesichert.
- Der **„Session speichern"**-Button bleibt erhalten als manueller Flush (für Nutzer-Sicherheit), wird aber zur Bestätigung statt Pflicht.
- Schreibgeschützte Sessions (`writable=false`): kein Auto-Save (bisheriges Verhalten).

### Technische Details

Geänderte Datei: `src/components/cash/SessionFieldsCard.tsx`

1. Neues kleines Hook-Modul `src/lib/use-debounced-effect.ts` (oder inline) für die Debounce-Logik mit Cleanup auf Unmount.
2. In `SessionFieldsCard`:
   - Effekt, der auf `chRows`, `tmRows`, `misc` lauscht, `build()` aufruft und bei gültigem Payload nach Debounce `onSave` triggert.
   - Initial-Mount überspringen (sonst sofortiger Save direkt nach Hydration mit `overview`-Reset).
   - Tracking eines „last-saved snapshot" (JSON-Stringify des Payloads), um Re-Saves bei identischem Inhalt zu vermeiden — besonders wichtig, da `useEffect`-Reset auf neue `overview`-Reads wieder feuert.
   - `beforeunload`-Handler: bei pendierendem Save sofort flushen (`navigator.sendBeacon`-Pfad ist Overkill — wir nutzen synchronen flush via Promise und Warnung im Browser, falls noch nicht fertig).
   - Statuszeile mit `lastSavedAt` (Date) und `isSaving` Boolean.

Andere Felder bleiben unverändert (Vorschüsse/Ausgaben gehen bereits direkt per `onAddAdvance`/`onAddExpense` und sind nicht betroffen).

### Was nicht geändert wird

- Keine LocalStorage-Persistenz — die DB ist die einzige Wahrheit. Auto-Save sichert direkt in der Session.
- Keine Änderung an `onSave` / Server-Funktion.
- Keine Änderung an Trinkgeld-Pool, Settlements oder PDF.
