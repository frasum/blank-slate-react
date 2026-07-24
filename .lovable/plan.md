## Plan

Der Diagnose-Screenshot zeigt `HTTP 403 Forbidden`. Im Code ist die Ursache nachvollziehbar: `/api/export/download` akzeptiert aktuell nur `Origin`, die mit `APP_URL` beginnen (`https://cocoplatform.online`). In der Preview/Safari kommt der Request aber von der Preview-Domain, deshalb wird er vor der eigentlichen Export-Erzeugung blockiert.

### Änderung

1. **Origin-Härtung korrigieren, ohne sie zu entfernen**
   - In `src/routes/api/export/download.ts` den Check von „nur `APP_URL`“ auf „same-origin zum aktuellen Request oder kanonische `APP_URL`“ ändern.
   - Konkret: `new URL(request.url).origin` als erlaubten Origin aufnehmen.
   - Fremde Webseiten bleiben geblockt, Preview/Custom Domain/Published Domain funktionieren.

2. **403-Antwort diagnostisch hilfreicher machen**
   - Die Antwort bleibt `403`, aber mit `Cache-Control: no-store` und klarem Text wie `Forbidden: invalid origin`.
   - Keine sensiblen Header oder Tokens ausgeben.

3. **Diagnose unverändert nutzbar lassen**
   - `probeExportEndpoint` und die Anzeige in `zeit-uebersicht.tsx` bleiben fachlich gleich.
   - Nach der Änderung sollte dort `HTTP 200` mit `Content-Disposition: attachment; ...` erscheinen.

4. **Validierung**
   - Per HTTP-Test prüfen, dass ein Request mit Preview-/Same-Origin akzeptiert wird.
   - Zusätzlich prüfen, dass ein fremder Origin weiterhin `403` bekommt.
   - Danach die Formatierung für `download.ts` laufen lassen.