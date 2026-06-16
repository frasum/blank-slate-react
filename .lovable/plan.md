## Ziel

Mitarbeiter können sich nur einstempeln/ausstempeln bzw. EasyOrder nur dann auslösen, wenn ihre aktuelle GPS-Position innerhalb des Geofence-Radius des Standorts liegt.

- Stempeluhr: gegen den (per `staff_locations` aufgelösten) Default-Standort des Mitarbeiters.
- EasyOrder: gegen den im UI ausgewählten Standort.
- Radius pro Standort, Default 100 m.
- Koordinaten werden aus der Adresse (`street`/`postal_code`/`city`) per Google-Maps-Geocoding ermittelt; manuelles Override möglich.
- Bei fehlendem GPS-Fix oder `accuracy > radius`: harte Blockade mit klarer Fehlermeldung. Kein Override, keine Umgehung.

## Voraussetzung

Google-Maps-Platform-Connector muss verlinkt sein (Geocoding über Gateway). Falls noch nicht vorhanden, wird er beim ersten Schritt verlinkt.

## Schritte

### 1. Migration: Geo-Spalten an `locations`

Neue Spalten:
- `latitude double precision NULL`
- `longitude double precision NULL`
- `geofence_radius_m integer NOT NULL DEFAULT 100` (CHECK 10–5000)
- `geocoded_at timestamptz NULL`
- `geocoded_address text NULL` (zum Erkennen veralteter Geocodes)

Keine RLS-Änderung — `locations` hat schon Policies. Datentyp `double precision` (kein PostGIS).

### 2. Reines Modul `src/lib/geo/`

- `haversine.ts` — `distanceMeters(lat1, lng1, lat2, lng2)`. Reine Funktion + Unit-Tests (bekannte Fixpunkte, < 0,5 % Abweichung).
- `geofence.ts` — `isWithinGeofence({ point, accuracyM, fence }) → { ok, reason }`. Reasons: `ok | no_fix | accuracy_too_low | outside`.
- Tests decken: exakter Mittelpunkt, Rand innen/außen, accuracy genau = radius, NaN-Inputs.

### 3. Server-Func `src/lib/admin/locations.functions.ts` erweitern

- `geocodeLocation({ locationId })` — admin-only:
  - Lädt Adresse, ruft Google-Maps Geocoding via Gateway (`maps/api/geocode/json`).
  - Schreibt `latitude`, `longitude`, `geocoded_at`, `geocoded_address`.
  - Audit-Log-Eintrag.
- `updateLocationGeo({ locationId, latitude, longitude, geofenceRadiusM })` — manuelles Override + Radius pflegen.

### 4. Admin-UI `src/routes/_authenticated/admin/locations.tsx`

Pro Standort:
- Anzeige aktueller lat/lng + `geocoded_at`.
- Button „Aus Adresse geocodieren".
- Inputs für lat/lng (manuelles Override) und Radius (m).
- Hinweis, wenn `geocoded_address` von aktueller Adresse abweicht.

### 5. Geofence-Helper für Server-Funcs

`src/lib/geo/server-check.ts` — `assertWithinFence({ admin, locationId, point, accuracyM })`. Lädt lat/lng/radius, ruft `isWithinGeofence`. Wirft sprechende Fehler:
- „Standort hat keine GPS-Koordinaten hinterlegt. Bitte Manager kontaktieren."
- „Kein GPS-Signal. Bitte Standortfreigabe im Browser/Gerät prüfen."
- „GPS zu ungenau (±X m, erlaubt ±Y m). Bitte im Freien erneut versuchen."
- „Du bist Z m vom Standort entfernt (erlaubt: Y m)."

### 6. `clockIn` / `clockOut` erweitern

`src/lib/time/time.functions.ts`:
- Beide Funktionen bekommen `inputValidator` mit `{ latitude, longitude, accuracyM }` (clockOut zusätzlich `breakMinutes`).
- Vor dem Insert/Update: `resolveDefaultLocation` zwingend → wenn `null`, Fehler „Kein eindeutiger Standort zugeordnet, Geofence nicht prüfbar."
- `assertWithinFence(...)` aufrufen.
- Audit-Meta um `geo: { lat, lng, accuracyM, distanceM }` ergänzen.

### 7. `placeEasyOrder` erweitern

`src/lib/bestellung/easyorder.functions.ts` → `placeEasyOrderCore`-Input um `geo: { latitude, longitude, accuracyM }`:
- Nach Schritt 1 (Location-Berechtigung) `assertWithinFence` gegen `input.locationId`.
- Audit-Meta ergänzen.
- `getMyEasyOrderContext`/`getEasyOrderCatalog` bleiben unverändert (reines Lesen).

### 8. Client-Helper `src/lib/geo/client.ts`

- `getCurrentPosition({ timeoutMs = 10000, maximumAge = 0 }) → Promise<{ latitude, longitude, accuracyM }>` (Wrapper um `navigator.geolocation.getCurrentPosition`, `enableHighAccuracy: true`).
- Klare Error-Typen für „permission_denied", „position_unavailable", „timeout".
- Kein Caching älterer Positionen (`maximumAge: 0`), damit niemand alte Fixes recyclen kann.

### 9. UI-Wiring

- `src/routes/_authenticated/zeit/index.tsx`:
  - Vor `doClockIn()`/`doClockOut(...)`: `await getCurrentPosition()`, Loading-State „GPS wird ermittelt…".
  - Bei Fehler: `toast.error` mit der jeweiligen Server-/Client-Meldung. Kein Stempel.
- `src/routes/_authenticated/admin/bestellung.easyorder.tsx`:
  - Analog vor dem Bestell-Submit: GPS holen, mitsenden.

### 10. Tests

- `geo/haversine.test.ts`, `geo/geofence.test.ts` — reine Logik.
- `time/time-entries.db.test.ts` erweitern: clockIn ohne Geo → Fehler; mit Geo innerhalb → ok; außerhalb → Fehler; ohne Standort-Geo-Daten → Fehler.
- `bestellung/easyorder.db.test.ts` erweitern: placeEasyOrder analog.

## Technische Details

- Geocoding-Aufruf ausschließlich serverseitig über Gateway (`https://connector-gateway.lovable.dev/google_maps/maps/api/geocode/json`); kein Browser-Key nötig.
- Kein PostGIS — Haversine in JS reicht für 100-m-Radius mit > 1 m Genauigkeit.
- `latitude`/`longitude` nicht `NOT NULL`, damit Bestandsdaten nicht kaputtgehen; Geofence-Check blockiert dann ehrlich.
- Reihenfolge der Schritte: Migration → Geo-Modul + Tests → Admin-Funcs/UI → Stempel-/EasyOrder-Funcs → Client-Helper → UI-Wiring. Admin pflegt Koordinaten bevor Stempelpflicht greift, sonst sperrt sich alles selbst aus.

## Offen / nicht enthalten

- Keine pauschalen Ausnahmen (z. B. „bestimmte Mitarbeiter umgehen Geofence"). Falls gewünscht, separater Bauplan-Schritt.
- Keine Hintergrund-Wiederholung des Geocodings bei Adressänderung — Admin klickt bewusst „neu geocodieren".
