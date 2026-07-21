## Diagnose

- Die Datenbank enthält aktuell viele Cross-Booking-Fälle im Display-Zeitraum, z. B. für das aktive Display `spicery`; es gibt also echte Daten, bei denen Punkte erscheinen müssten.
- Im aktuellen Quellcode ist die DP1-Logik grundsätzlich vorhanden: `buildDisplayData` berechnet `crossBookingDates`, und `display.$locationId.tsx` rendert daraus einen kleinen Punkt.
- Die veröffentlichte Domain und die Preview-Domain liefern im statischen Display-Bundle aber keine auffindbaren Marker-Strings wie `crossBookingDates`/`anderer Einsatzort`. Das erklärt, warum das physische Display noch keine Punkte zeigt: Es läuft sehr wahrscheinlich noch mit einem Stand, in dem der neue Display-Code nicht ausgeliefert ist, oder der Reload-Handschlag greift erst nach einer Veröffentlichung mit neuem Bundle.

## Plan

1. **Rendering robuster machen**
   - Den Punkt nicht nur im kleinen Inline-Wrapper um das `−`, sondern zellfüllend/absolut in der Display-Zelle positionieren.
   - Dadurch bleibt er sichtbar, auch wenn Textgröße, Zellhöhe oder Display-Skalierung den bisherigen Mini-Punkt schwer erkennbar machen.

2. **Payload-/TRMNL-Nachzug prüfen**
   - Sicherstellen, dass `crossBookingDates` in allen Display-Ausgaben erhalten bleibt.
   - Falls das E-Ink/TRMNL-Dienstplan-HTML ebenfalls gemeint ist, den Punkt dort ebenfalls als Schwarzpunkt in leeren Zellen ergänzen; bisher ignoriert `buildRosterGrid` die Cross-Booking-Daten und gibt nur Marker zurück.

3. **Tests ergänzen**
   - Einen reinen Test ergänzen, der bestätigt: Eine leere Display-Zelle mit `crossBookingDates` erzeugt einen sichtbaren Cross-Booking-Marker.
   - Für TRMNL optional testen, dass Cross-Booking-Infos nicht beim Mapping verloren gehen.

4. **Nach Umsetzung verifizieren**
   - Den aktuellen Display-Endpoint bzw. gerenderte Vorschau gegen echte Display-Daten prüfen.
   - Wichtig für das reale Wanddisplay: Nach dem Fix muss die App veröffentlicht werden; erst dann kann das physische Display den neuen Bundle-Stand laden. DP2 lädt nur nach, wenn ein neuer veröffentlichter App-Stand verfügbar ist.