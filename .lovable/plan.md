## Ziel

Auf iOS Safari erscheint kurz ein „leerer" Tab, bevor die PDF geladen ist. Diesen Zwischen-Zustand mit einem sichtbaren Hinweis „Öffne PDF…" versehen, damit er nicht mehr leer wirkt.

## Änderung

Nur `src/routes/_authenticated/lohn.tsx`, `open()`-Handler, iOS-Safari-Pfad:

1. Statt `window.open("about:blank", …)` einen `data:`-URL mit minimalem HTML öffnen — z. B.:
   ```html
   <!doctype html><meta charset="utf-8"><title>Lohnabrechnung wird geladen…</title>
   <style>html,body{height:100%;margin:0;font:16px -apple-system,system-ui,sans-serif;
   background:#fff;color:#111;display:flex;align-items:center;justify-content:center}</style>
   <p>Öffne PDF…</p>
   ```
2. Sobald die Signed-URL da ist, wie bisher `win.location.href = res.url` setzen — der Hinweis wird durch die PDF ersetzt.
3. Bei Fehler weiterhin `win.close()` + `alert(...)`.

Desktop-Pfad und Popup-Blocker-Fallback bleiben unverändert.

## Erfolgs-Kriterien

- iOS Safari: neuer Tab zeigt sofort „Öffne PDF…" (kein weißer Leer-Zustand mehr), danach lädt die PDF.
- Desktop-Verhalten unverändert (kein leerer Zwischen-Tab, wie im vorigen Fix).
- Prettier/ESLint sauber.
