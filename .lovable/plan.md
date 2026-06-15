## Ziel

Display-Anzeige pro Filiale, die ohne Login per öffentlicher Token-URL aufrufbar ist (z. B. für TV/Tablet in der Küche). Anzeige: heutige Schichten der Filiale, gruppiert nach Bereich (Kitchen/Service), mit Mitarbeitername und Skill.

Scope = **Minimum** (laut Bestätigung):
- Öffentliche URL mit Sicherheits-Token
- Anzeige des Dienstplans (heute, optional Wochenansicht)
- Token im Admin sehen + neu generieren (Copy-Link)

Bewusst NICHT in diesem Schritt: QR-Code, Druck/Download, Work-Areas-Filter, Rotation, Custom-Message, Dark-Mode-Zeiten.

## Was gebaut wird

### 1. Datenbank-Migration: `display_settings`

Neue Tabelle scoped pro Filiale (`location_id`, `organization_id`), mit:
- `display_token` (32-Byte Hex, default `encode(gen_random_bytes(32),'hex')`, einzigartig)
- `is_enabled` (bool)
- `refresh_interval_seconds` (default 60)
- `created_at`, `updated_at`

RLS:
- `SELECT/INSERT/UPDATE/DELETE`: nur Manager+Admin der Organisation (über `has_min_permission('manager')` + `organization_id = current_organization_id()`).
- Token-Validierung läuft serverseitig im öffentlichen Endpoint (RLS-bypass), niemals direkt vom Client gegen die Tabelle.
- `GRANT`s gemäß Projektregel; kein `anon`-Grant.

### 2. Öffentlicher Server-Route-Endpoint

Datei: `src/routes/api/public/display.$locationId.ts`

- `GET` ohne Auth (Pfad `/api/public/*` bypasst Login).
- Liest `?token=...` aus der Query.
- Lädt `display_settings` per `supabaseAdmin` und vergleicht Token **timing-safe**.
- Wenn ok und `is_enabled=true`: lädt Location, alle aktiven Staff der Filiale, `roster_shifts` für heute (+ optional Woche), `skills`.
- Liefert ein schlankes DTO: `{ location, shifts: [{staffName, area, skillName, status}], generatedAt, refreshIntervalSeconds }`.
- Keine PII außer Vorname/Nachname (gewollt: das ist der Dienstplan).
- Antworten: 401 bei falschem/fehlendem Token, 403 wenn disabled, 200 sonst.

### 3. Öffentliche Anzeige-Route

Datei: `src/routes/display.$locationId.tsx` (oben in `src/routes/`, **nicht** unter `_authenticated`).

- Fetcht den Endpoint aus Schritt 2 alle `refreshIntervalSeconds`.
- Vollbild-Layout, dunkler Hintergrund, große Schrift.
- Header: Filialname + aktuelle Uhrzeit + Datum.
- Body: zwei Spalten (Küche / Service), je Liste der Mitarbeitenden mit Skill-Badge.
- Loading / Error / Disabled-States.

### 4. Admin-UI: Display-Einstellungen

In `src/routes/_authenticated/admin/locations.tsx` pro Filiale Button „Display" → Dialog:
- Status (aktiv/inaktiv) togglen.
- Anzeige-URL `https://…/display/{locationId}?token=…` mit „Kopieren"-Button.
- „Neuen Token generieren" (widerruft alte URL).
- Refresh-Intervall (Sekunden).

Serverlogik in `src/lib/display/display.functions.ts`:
- `getDisplaySettings(locationId)`
- `upsertDisplaySettings(locationId, patch)`
- `regenerateDisplayToken(settingsId)`
Alle mit `requireSupabaseAuth` + Rolle ≥ manager.

## Technische Details

- Stack: TanStack Start, `createServerFn` für Admin-Ops, `createFileRoute` mit `server.handlers.GET` für den öffentlichen Endpoint.
- `supabaseAdmin` nur **innerhalb** des Handlers importieren (`const { supabaseAdmin } = await import('@/integrations/supabase/client.server')`), nicht auf Modul-Ebene.
- Token-Vergleich: `crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b))` nach Längencheck.
- Kein Realtime im Minimum — Auto-Refresh per Polling reicht.
- Token wird **nie** geloggt (Projektregel).

## Aus thaitime übernommen, an tococo angepasst

| thaitime | tococo |
|---|---|
| `branch_id` | `location_id` |
| `schedule_entries` (mit start/end time) | `roster_shifts` (nur `shift_date` + `area` + `skill_id`) |
| Edge Function `schedule-display` | TSS Server-Route `/api/public/display/$locationId` |
| `/display/:branchSlug` | `/display/$locationId` |
| `react-router-dom` | `@tanstack/react-router` |

Keine 1:1-Kopie der Komponenten — die thaitime-Anzeige enthält Geburtstage, Rotation, Abwesenheiten, Schichtzähler usw., die hier bewusst weggelassen werden.

## Reihenfolge

1. Migration erstellen (Tabelle + RLS + Grants).
2. Server-Functions + öffentlicher Endpoint.
3. Öffentliche Anzeige-Route.
4. Admin-Dialog in Locations-Seite.
5. Manuell testen: Token kopieren → in privatem Fenster öffnen → Anzeige + Auto-Refresh.
