## Problem

Du siehst nicht den Login-Screen, weil die **Preview gerade eine ältere/kaputte Build-Version** zeigt und darin die Supabase-Konfiguration nicht verfügbar ist. Der Hinweis oben im Screenshot sagt genau das: **„Preview is showing an earlier version of your app“**.

Der eigentliche Bildschirm **„Konfiguration unvollständig“** kommt aus dem Code, wenn `VITE_SUPABASE_URL` oder `VITE_SUPABASE_PUBLISHABLE_KEY` im laufenden Preview-Build fehlen. In der aktuellen Sandbox-Datei sind diese Werte vorhanden; deshalb ist es sehr wahrscheinlich ein **Preview-/Devserver-Stale-State**, nicht der eigentliche Login-Code.

## Plan zur Behebung

1. **Preview-Server sauber neu laden**
   - Devserver neu starten, damit die vorhandenen `.env`-Werte wieder in Vite/TanStack geladen werden.
   - Danach Preview hart neu prüfen.

2. **Falls der Fehler bleibt: Env-Ladepfad prüfen**
   - Kontrollieren, ob der Preview-Build wirklich aus `.env` liest.
   - Prüfen, ob `src/integrations/supabase/client.ts` in Browser/SSR-Kontexten robust genug auf `import.meta.env` und Server-Fallbacks zugreift.

3. **Nur wenn nötig: kleine Stabilisierung einbauen**
   - Keine Business-Logik ändern.
   - Nur die Konfigurationsprüfung so absichern, dass Preview/SSR nicht fälschlich in den Fehlerzustand fällt, wenn die Werte vorhanden sind.

4. **Verifizieren**
   - `/admin` bzw. `/auth` in der Preview öffnen.
   - Erwartung: Statt „Konfiguration unvollständig“ erscheint wieder der Login-Screen oder die Admin-Seite, falls du angemeldet bist.

## Was ich nicht ändere

- Keine Datenbankänderung.
- Keine Auth-Logik-Umbauten.
- Keine neuen Features.
- Keine Änderungen am gerade gebauten Versand-Log.