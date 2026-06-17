## Befund

- Die veröffentlichte `/auth`-Seite lädt inzwischen mit HTTP 200.
- Beim PIN-Login wird aber keine erfolgreiche `validatePin`-Ausführung erreicht.
- Alte direkte Aufrufe auf den sprechenden ServerFn-Pfad schlagen mit `Server function info not found` fehl; die aktuell veröffentlichte Client-Datei nutzt stattdessen Hash-IDs.
- Ein direkter Test gegen die aktuelle Hash-ID der PIN-Server-Function liefert HTTP 500 mit `Seroval Error (step: 3)`.
- Die temporären `[pin-login] ...` Logs erscheinen nicht. Das heißt: Der Fehler passiert sehr wahrscheinlich vor oder beim ServerFn-Transport/Serialisieren, bevor die Kandidatensuche sauber loggt.

## Plan

1. **ServerFn-Transport sauber reproduzieren**
   - Den aktuellen veröffentlichten ServerFn-Aufruf exakt mit den Browser-Headern/Payloads prüfen.
   - Zusätzlich Preview/dev-Logs gegen `Seroval Error`, `validatePin` und `pin-login` vergleichen.

2. **Wahrscheinlichste Codeursache isolieren**
   - `src/lib/auth/auth-flows.functions.ts` auf server-function-splitting-Probleme prüfen: lokale Helper (`failed`, `ensureShadowUser`, `generateSessionTokenHash`) werden im selben `.functions.ts`-Modul von Handlern genutzt; genau dieses Muster kann bei TanStack Start zur Runtime-Fehlauflösung/Serialisierung führen.
   - Die `.or(...ilike...)`-Filter-Syntax prüfen, weil sie nach Transport-Fix sonst die Kandidatensuche brechen kann.

3. **Minimaler Fix ohne Logikänderung am Login-Verhalten**
   - Helper aus `auth-flows.functions.ts` in ein getrenntes Server-Helper-Modul verschieben/importieren, damit `validatePin`/`resolveBadgeToken` als dünne ServerFn-Wrapper bleiben.
   - Kandidatensuche weiterhin exakt case-insensitive auf `first_name` oder `display_name`, aber mit robuster PostgREST-Filter-Syntax.
   - Temporäre Diagnose-Logs zunächst drinlassen, bis der echte Login einmal bestätigt wurde.

4. **Validierung**
   - `validatePin` gegen den veröffentlichten/Preview-ServerFn-Pfad erneut auslösen und prüfen, dass `[pin-login]`-Logs oder ein erfolgreicher Token zurückkommen.
   - Danach Browser-E2E auf `/auth`: PIN-Tab, `Andre` + `1111`; anschließend `Gerard` + `1111`.
   - Wenn der ServerFn dann läuft, aber Login noch fehlschlägt, anhand der dann sichtbaren `[pin-login]`-Logs gezielt die Datenursache beheben.

## Nicht enthalten

- Keine Änderung an Rollen, RLS, PIN-Hash-Logik oder UI-Texten.
- Keine neue Feature-Arbeit außerhalb des PIN-Login-Debuggings.