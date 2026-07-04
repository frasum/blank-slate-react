## Ziel
Portierung des Tagesberichts auf TG1-Infrastruktur: Versand an angehakte verknüpfte Konten, DST-fester stündlicher Trigger mit Selbst-Gate, Berichtsinhalt aus den bestehenden Kassen-/DayInput-Helfern. pg_cron-Einrichtung bleibt Ops (Frank, außerhalb dieses Prompts).

## 1. Migration (Schema)
Datei: neue Migration via `supabase--migration`.

`organization_settings` erweitern:
- `telegram_report_enabled boolean NOT NULL DEFAULT false`
- `telegram_report_hour smallint NOT NULL DEFAULT 7 CHECK (0..23)`
- `telegram_report_flags jsonb NOT NULL DEFAULT '{"umsatz":true,"gaeste":true,"kontrolle":true,"kellner":true,"kueche":true,"notizen":true,"excludedLocationIds":[]}'`
- `telegram_report_last_sent date` (nullable)

`staff_telegram_links` erweitern:
- `receives_daily_report boolean NOT NULL DEFAULT false`

Keine Policy-Änderung (neue Spalten laufen unter bestehenden Policies). Kein pg_cron/pg_net. Nach Approval: Types werden auto-regeneriert.

## 2. Reines Modul `src/lib/telegram/telegram-report.ts` (+ Vitest)
- Exportiert Typen `ReportLocationInput`, `ReportInput`, `ReportFlags` und `buildDailyReport(input, flags): string` (Telegram-HTML).
- `escapeHtml` Helper wird auf **alle** dynamischen Strings angewandt (Standortnamen, Kellner/Küche-Namen, Notizen).
- Cents-Formatierung `de-DE` (Komma, „€"), Zeit `HH:MM` (24h, Berlin — Input-Timestamps sind ISO, Formatter mit `timeZone: "Europe/Berlin"`).
- Standort-Reihenfolge = Eingabe-Reihenfolge. `excludedLocationIds` filtert vorher; leere Standorte ergeben `<b>Name</b>\nKeine Daten`.
- Flag-schaltbare Blöcke: umsatz, gaeste, kontrolle, kellner, kueche, notizen.
- KONTROLLE-Reihenfolge exakt: Fehlbetrag Vortag → Ausgaben → Tages-Bargeld → Differenz zum Wechselgeldbestand → Wechselgeldbestand.
- Tests unter `telegram-report.test.ts`: HTML-Escaping (`<b>` in Notiz bleibt Text), jede Flag schaltet Block ab, `excludedLocationIds`, „Keine Daten"-Fall, Kanonik-Snapshot eines vollständigen Standorts mit synthetischen Cent-Beträgen.

## 3. Interner Endpoint `src/routes/api/internal/telegram/daily-report.ts`
POST, öffentlich erreichbar. Reihenfolge im Handler ist bindend:
1. `X-Cron-Secret` timing-safe gegen `process.env.TELEGRAM_CRON_SECRET` prüfen; fehlt Env → **503**, sonst falsch → **401**. Helper wird — analog TG1-Webhook — inline mit `timingSafeEqual` auf `Buffer.from(...)` implementiert.
2. Pro Organisation Einstellungen laden. `telegram_report_enabled=false` → `{ skipped:"disabled" }`.
3. **Stunden-Gate**: aktuelle Stunde in `Europe/Berlin` (`Intl.DateTimeFormat` mit `hour: "2-digit", hour12:false, timeZone:"Europe/Berlin"`) ≠ `telegram_report_hour` → `{ skipped:"wrong-hour" }`.
4. **Idempotenz**: heutiges Berlin-Datum ≤ `telegram_report_last_sent` → `{ skipped:"already-sent" }`.
5. **Erst danach** Daten laden: pro Standort der Org → gestriger Geschäftstag (Berlin) → aktive Session → `sessionToDayInput` → `computeDailyCash` / `computeWechselgeld`. Kellner aus `waiter_settlements` (Name + `submitted_at`), Küche aus `session_tip_pool_entries` (kategorie=kitchen, `shift_start`/`shift_end`), Notizen aus `sessions.notes`.
6. `buildDailyReport` bauen → an alle `staff_telegram_links` der Org mit `receives_daily_report=true AND linked_at IS NOT NULL` senden, per bestehendem `sendTelegramToStaff` (neuer Aufruf-Weg: neue interne Variante `sendTelegramHtmlToChat` als kleiner Nachbar-Export in `telegram.functions.ts`, damit `parse_mode:"HTML"` fließt — Signatur bleibt sonst unangetastet).
7. Empfänger-Fehler einzeln `try/catch` — ein toter Chat blockiert die anderen nicht; Zähler `deliveredCount`/`failedCount` in Response.
8. `telegram_report_last_sent = heute (Berlin)` per `supabaseAdmin` schreiben. Audit `telegram.report_sent` mit `{ business_date, recipients_total, recipients_delivered, locations_total }` — **keine Berichtsinhalte**.

Response JSON kompakt: `{ ok, results: [{orgId, skipped?, delivered?, failed?}] }`.

## 4. Server-Fns + Einstellungs-UI
Datei: `src/lib/telegram/telegram-report.functions.ts` (client-safe):
- `getTelegramReportSettings()` — admin only via `runGuarded`, liest die 4 neuen Spalten + `telegram_bot_username` + Empfängerliste (`staff_telegram_links` join `staff` für Name).
- `updateTelegramReportSettings({ enabled, hour, flags })` — Zod: `hour:int 0..23`, `flags: z.object({umsatz,gaeste,kontrolle,kellner,kueche,notizen: z.boolean(), excludedLocationIds: z.array(z.string().uuid())})`. Audit before/after.
- `setDailyReportRecipient({ staffId, receives })` — Update auf `staff_telegram_links.receives_daily_report`. Audit.
- `sendTestReport()` — baut gestern-Bericht und ruft den gleichen Bau/Sende-Kern wie der Endpoint, aber **ohne Stunden-Gate**, **ohne** `last_sent` zu setzen. Audit `telegram.test_report_sent`. Damit Endpoint und Test-Fn dieselbe Logik nutzen: gemeinsamer server-only Helper `runDailyReport({ organizationId, skipGate })` in `src/lib/telegram/telegram-report.server.ts`.

UI in `src/routes/_authenticated/admin/einstellungen.tsx` (bestehende Telegram-Sektion erweitern):
- Toggle „Tagesbericht aktiv".
- Number/Select 0–23 mit Hinweis „Europe/Berlin, stündlich vom Cron geprüft".
- Sechs Checkboxen (Umsatz/Gäste/Kontrolle/Kellner/Küche/Notizen).
- Multi-Select Standort-Ausschlüsse (bestehende Location-Liste, Pill-Toggle konsistent zur Projekt-Regel).
- Empfängertabelle: alle verknüpften Konten mit Häkchen „erhält Tagesbericht".
- Button „Testbericht jetzt senden" (Toast + Ergebnis-Zähler).

## 5. Doku
`docs/arbeitsweise.md` §53 um den TG2-Absatz gemäß Vorgabe ergänzen (Stand 04.07.2026).

## 6. Secret
`TELEGRAM_CRON_SECRET` als Runtime-Secret via `secrets--generate_secret` (32-Byte-Random) anlegen — die pg_cron-Konfiguration bekommt den Wert dann von Frank.

## 7. Nicht anfassen
TG1-Webhook, Verknüpfungs-Flow, `staff_telegram_links`-Policies, Kassen-/DayInput-Helfer (nur konsumieren), KONTROLLE-Block, PDF, `sendTelegramToStaff`-Signatur. Kein pg_cron/pg_net in Migrationen.

## 8. Erfolgs-Gate
- `bun run typecheck` grün (bzw. `tsgo`), Vitest neue Report-Tests grün.
- Endpoint-Aufruf ohne Secret → 401; mit Secret vor Berlin-Stunde → `wrong-hour`; nach erstem Erfolg innerhalb desselben Tages → `already-sent`.
- „Testbericht jetzt senden" liefert Nachricht mit Gestern-Zahlen; `last_sent` bleibt unverändert.
- Audit-Log enthält keine Berichtsinhalte.

## Datei-Diff-Übersicht
- Neu: `src/lib/telegram/telegram-report.ts` + `.test.ts`
- Neu: `src/lib/telegram/telegram-report.server.ts` (gemeinsamer Kern)
- Neu: `src/lib/telegram/telegram-report.functions.ts` (4 Server-Fns)
- Neu: `src/routes/api/internal/telegram/daily-report.ts` (Server-Route)
- Ergänzt: `src/lib/telegram/telegram.functions.ts` (kleiner HTML-Send-Helper)
- Ergänzt: `src/routes/_authenticated/admin/einstellungen.tsx` (UI-Block)
- Ergänzt: `docs/arbeitsweise.md` (§53-Absatz)
- Migration: 2 ALTER TABLE
- Secret: `TELEGRAM_CRON_SECRET`