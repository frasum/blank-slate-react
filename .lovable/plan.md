## Telegram-Anbindung Variante B (pro Mitarbeiter)

Ziel: Jeder Mitarbeiter kann seinen persönlichen Telegram-Chat mit seinem Staff-Account verknüpfen; später können Server-Funktionen gezielt an einzelne Staff-IDs pushen (Freigabe-Benachrichtigungen etc.).

---

### 1. Schema (Migration)

**Tabelle `staff_telegram_links`** (append-only pro Staff):

| Spalte              | Typ            | Zweck                                                           |
| ------------------- | -------------- | --------------------------------------------------------------- |
| `id`                | uuid pk        |                                                                 |
| `organization_id`   | uuid not null  | Mandant                                                         |
| `staff_id`          | uuid unique    | 1:1 Staff ↔ Chat (später auf n:1 erweiterbar)                   |
| `telegram_chat_id`  | bigint         | von Telegram gelieferte Chat-ID (leer bis Verknüpfung fertig)   |
| `telegram_username` | text           | @handle, nur zur Anzeige                                        |
| `link_token`        | text unique    | 32 Byte Base64URL, wird beim /start eingelöst                   |
| `token_expires_at`  | timestamptz    | 15 min gültig                                                   |
| `linked_at`         | timestamptz    | gesetzt, wenn Verknüpfung erfolgreich                           |
| `created_at`        | timestamptz    |                                                                 |

RLS:
- Staff darf eigene Zeile (`staff_id = current_staff_id()`) lesen/löschen.
- Admin: alles (via `is_admin()`).
- INSERT/UPDATE nur über Server-Funktion (service role) — kein direkter Client-Write.
- GRANTs: `SELECT, DELETE ON authenticated`; `ALL ON service_role`.

**Bot-Username** als Org-Setting hinterlegen (für Deep-Link `https://t.me/<botname>?start=<token>`):
- neue Spalte `telegram_bot_username text` in `organization_settings`. Wert wird einmalig über Admin-UI gesetzt (bekannt aus BotFather, z. B. `coco_platform_bot`).

---

### 2. Server-Funktionen (`src/lib/telegram/telegram.functions.ts`)

- **`startTelegramLink()`** — auth, ermittelt eigenen `staff_id`, generiert `link_token` (32 Byte, `crypto.randomBytes`), speichert (upsert per staff_id, alte Zeile wird ersetzt). Liefert `{ token, deepLink, expiresAt }`.
- **`unlinkTelegram()`** — auth, löscht eigene Zeile.
- **`getMyTelegramLink()`** — auth, liest eigenen Status (`linked | pending | none`, Chat-Handle wenn verlinkt).
- **`sendTelegramToStaff({ staffId, text })`** — nur intern/admin, ruft Gateway `POST /sendMessage`. Kein direkter Frontend-Call — wird von künftigen Server-Funktionen (Freigabe-Benachrichtigung etc.) genutzt.

Alle nutzen `requireSupabaseAuth`; `sendTelegramToStaff` prüft zusätzlich `has_role('admin')` bzw. wird nur aus anderen Server-Funktionen aufgerufen. `TELEGRAM_API_KEY` und `LOVABLE_API_KEY` werden nur im Handler-Body gelesen.

---

### 3. Webhook-Route

**Datei: `src/routes/api/public/telegram/webhook.ts`**

- POST-Handler, verifiziert `X-Telegram-Bot-Api-Secret-Token` via `sha256('telegram-webhook:' + TELEGRAM_API_KEY)` (base64url) — gleicher Trick wie im Knowledge-File, kein zusätzliches Secret nötig.
- Parst `update.message.text`, erwartet `/start <token>`.
- Bei Match: findet `staff_telegram_links` per Token (nicht abgelaufen), setzt `telegram_chat_id`, `telegram_username`, `linked_at = now()`, `token_expires_at = null`.
- Sendet Bestätigungsnachricht („✅ Verknüpft mit <Vorname>") zurück über Gateway.
- Idempotent per `update_id` (nur logisch: doppelte /start mit demselben Token sind ein no-op).
- Alle anderen Message-Typen: 200 OK, ignoriert (kein Chatbot).
- Load `supabaseAdmin` per `await import(...)` innerhalb des Handlers.

**Webhook registrieren:** einmalig per curl aus dem Sandbox (macht der Agent) mit URL
`https://project--a9a57e34-6bcd-4c59-9526-a8d67e2c7859-dev.lovable.app/api/public/telegram/webhook`
(stabile Dev-URL) und `allowed_updates: ["message"]`.

---

### 4. UI

**Neuer Bereich im Staff-Profil** (eigenes Profil des Mitarbeiters, unter „Persönlich" oder „Benachrichtigungen"):

- Status „Telegram: nicht verknüpft" + Button **„Mit Telegram verknüpfen"**
  → ruft `startTelegramLink`, öffnet `deepLink` in neuem Tab, zeigt „Bitte im geöffneten Telegram-Chat auf ‚Start' tippen. Läuft in 15 min ab."
- Nach Verknüpfung: „Telegram: @handle verknüpft am tt.mm.jjjj" + Button „Trennen".
- Polling per `useQuery` alle 5 s, solange Status `pending`, damit UI nach /start automatisch umspringt.

**Admin-Setting**: kleines Feld im bestehenden `organization_settings`-Bereich für den Bot-Username (Textfeld, einmalig pflegen).

---

### 5. Nicht in diesem Schritt

- Versand-Trigger für Freigabe-Benachrichtigungen (kommt separat).
- Nachrichten empfangen/parsen jenseits von `/start` (der Bot ist reines Push-Ziel).
- Multi-Chat pro Staff.

---

### Technische Details

- Bibliotheken: keine neuen npm-Deps; `crypto` (Node built-in) reicht.
- Env-Variablen: `TELEGRAM_API_KEY` (Connector, da), `LOVABLE_API_KEY` (da), `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY` (da).
- Neue Secrets: keine.
- Tests: Charakterisierungstest für Token-Verifikation (base64url SHA256) und für den `/start <token>`-Parser.

Bitte bestätige, dann setze ich das in einer Migration + Code-Änderung um.