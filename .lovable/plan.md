## Plan: Repo-Reset verlässlich abschließen

1. **Nicht weiter implementieren**
   - Keine neuen Migrationen, keine Codeänderungen, keine „Korrektur obendrauf“.
   - Grund: Der aktuelle GitHub-HEAD ist laut Prüfung noch `a4f8cce "Migration D"` und enthält weiterhin Phase-2/Realtime/D-Dateien. Weiterbauen würde den falschen Stand verfestigen.

2. **Reset auf `fedb2e0` über Lovable auslösen**
   - Entweder über Lovable History/Versionsverlauf auf den Stand `fedb2e0` zurücksetzen.
   - Oder den Reset-Prompt explizit an Lovable geben, mit Erfolgskriterium: GitHub muss danach denselben Tree wie `fedb2e0` haben.

3. **GitHub als Wahrheit prüfen**
   - Nach dem Restore nicht nur den Editor anschauen, sondern im verbundenen GitHub-Repo prüfen, ob ein neuer Sync/Commit angekommen ist.
   - Erfolgskriterium:
     ```text
     git diff fedb2e0..HEAD
     ```
     muss leer sein.

4. **Dateien prüfen, die verschwinden müssen**
   - Die folgenden nachgezogenen Dateien dürfen nach dem Reset nicht mehr im GitHub-HEAD sein:
     ```text
     supabase/migrations/*075820*   # Staff/Claim
     supabase/migrations/*080455*   # Realtime
     supabase/migrations/*081844*   # gestapelte Migration D
     src/routes/_authenticated/zeit/aufgaben.tsx
     ```

5. **Erst danach neu starten**
   - Wenn GitHub wirklich auf `fedb2e0` steht, kann Migration D sauber neu umgesetzt werden — als einzelner, überprüfbarer Schritt ohne die gestapelten Phase-2/Realtime-Änderungen.

## Was du jetzt konkret tun solltest

Nutze den Lovable-Versionsverlauf und restore auf `fedb2e0`. Danach warte auf den GitHub-Sync und lass erneut gegen GitHub prüfen. Wenn der Diff weiterhin nicht leer ist, ist der Restore nicht im Repo angekommen — dann den Reset-Prompt als expliziten Lovable-Auftrag ausführen lassen.