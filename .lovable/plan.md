## Problem

Beim Klick auf „Öffnen" in `/lohn` erscheint im Vordergrund ein leerer Tab, im Hintergrund lädt die PDF.

Ursache in `src/routes/_authenticated/lohn.tsx` (`open`-Handler):
1. Wir öffnen **synchron** `window.open("about:blank", "_blank")` — nötig als iOS-Safari-Workaround, damit der Popup nicht als „nach `await` = keine User-Geste" blockiert wird.
2. Danach holen wir per `await` die Signed-URL und setzen `win.location.href = res.url`.

Auf Desktop-Browsern (Chrome/Safari/Firefox) fokussiert der Browser den frisch geöffneten Tab **sofort** — der Nutzer sieht kurz `about:blank`, dann lädt die PDF darin. Das wirkt wie „leere Seite im Vordergrund".

## Fix

Den `about:blank`-Trick nur dort einsetzen, wo er wirklich gebraucht wird (iOS Safari / iPadOS). Auf allen anderen Plattformen zuerst die Signed-URL holen und dann `window.open(res.url, "_blank", "noopener")` mit der echten URL öffnen — dann gibt es keinen leeren Zwischenschritt.

### Änderungen (nur `src/routes/_authenticated/lohn.tsx`, `open`-Funktion)

1. Kleine Helper-Funktion `isIosSafari()`: prüft `navigator.userAgent` auf iPhone/iPad/iPod **und** Safari (ohne CriOS/FxiOS/EdgiOS).
2. Zwei Pfade:
   - **iOS Safari:** wie bisher — `window.open("about:blank", "_blank", "noopener")` sofort, dann URL setzen. (Ist dort akzeptabel, da mobil ohnehin Tab-Wechsel-Animation.)
   - **Sonst:** erst `callOpen(...)` awaiten, dann `window.open(res.url, "_blank", "noopener")`. Fallback auf `location.href = res.url`, wenn `window.open` `null` liefert (Popup-Blocker).
3. Fehlerbehandlung bleibt (`try/catch`, `alert`). Im iOS-Pfad bei Fehler weiterhin `win.close()`.

Keine anderen Dateien betroffen. Keine Server- oder Businesslogik-Änderung. Reines UX-Polishing im Frontend.

## Erfolgs-Kriterien

- Desktop (Chrome/Safari/Firefox): Klick auf „Öffnen" → neuer Tab öffnet direkt mit PDF-URL, kein leerer Zwischen-Tab.
- iOS Safari: unverändert funktional (Regression-Schutz — der Grund für den ursprünglichen Workaround bleibt dokumentiert im Kommentar).
- Popup-Blocker-Fall: PDF öffnet im aktuellen Tab statt lautlos zu scheitern.
- Prettier/ESLint sauber.
