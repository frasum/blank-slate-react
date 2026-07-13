## Ziel
Jeder Bestell-Mail-Versand (erfolgreich oder fehlgeschlagen, produktiv oder Testmodus, inkl. Resends) wird zeilenweise protokolliert und in der Admin-UI je Bestellung sichtbar. Bestehendes Flat-Feld `orders.email_sent_at` bleibt bestehen — der Log ist die vollständige Historie.

## Schritt 1 — Migration: Tabelle `order_email_log`

Neue append-only Tabelle in `public`. Spalten:
- `id uuid pk`, `organization_id uuid not null`, `order_id uuid not null references orders(id) on delete cascade`
- `sent_at timestamptz not null default now()`
- `mode text not null check (mode in ('production','test'))`
- `recipient_email text not null` — tatsächlich verwendeter Empfänger (bei Testmodus die Test-Adresse)
- `supplier_email_snapshot text` — was ohne Testmodus gegangen wäre (aus `suppliers.email` zum Zeitpunkt)
- `subject text not null`
- `status text not null check (status in ('sent','failed'))`
- `http_status int` — MailerSend-Response-Status (auch bei Fehler)
- `provider_message_id text` — MailerSend `x-message-id` Header, falls vorhanden
- `response_body text` — auf 2000 Zeichen begrenzt, für Diagnose
- `error_message text` — bei `status='failed'`
- `triggered_by_user_id uuid` — Aufrufer (Manager oder EasyOrder-Staff)
- `is_resend boolean not null default false` — entspricht bisherigem `wasResend`
- `created_at timestamptz not null default now()`

Indexe: `(order_id, sent_at desc)`, `(organization_id, sent_at desc)`.

Grants + RLS:
- `GRANT SELECT, INSERT ON public.order_email_log TO authenticated;`
- `GRANT ALL ON public.order_email_log TO service_role;` (kein `anon`)
- RLS an, Policies: SELECT nur wenn `has_min_permission('manager')` UND `organization_id = current_organization_id()`; INSERT nur `service_role` (Insert läuft ausschließlich über `sendOrderEmailWithAdmin`).

## Schritt 2 — Server-Helper erweitern

`src/lib/bestellung/send-order-email.server.ts`:
- Signatur um optionalen `triggeredByUserId?: string` erweitern (Callers reichen ihn durch; ohne Aufwand für Auto-Versand, dort ist der Staff-User bekannt).
- Vor dem `fetch` an MailerSend: `subject` und Empfänger-Berechnung bereits vorhanden.
- Nach `fetch`:
  - Bei `!res.ok`: EINE Zeile `status='failed'` mit `http_status`, `error_message`, gekürztem `response_body` schreiben, dann wie bisher werfen.
  - Bei `res.ok`: `provider_message_id` aus Response-Header `x-message-id` (fallback JSON `message_id`) lesen, EINE Zeile `status='sent'` schreiben, `is_resend = (order.status === 'sent')` VOR dem `UPDATE orders … status='sent'` bestimmen (bleibt wie heute), dann `orders`-Update.
- Insert läuft mit dem übergebenen `admin`-Client (Service-Role) — RLS-INSERT-Guard schützt trotzdem gegen versehentliche Client-Aufrufe.

## Schritt 3 — Aufrufer

- `orders.functions.ts` → `sendOrderEmail`: `triggeredByUserId = context.userId` weiterreichen.
- `easyorder.functions.ts` → `placeEasyOrderCore` (Auto-Send-Pfad): analog mitgeben.
- Keine UI-seitige Verhaltensänderung für den Aufruf.

## Schritt 4 — Read-Function für UI

Neu: `src/lib/bestellung/order-email-log.functions.ts` mit `listOrderEmailLog({ orderId })` (`requireSupabaseAuth` + Manager-Check, Filter `organization_id`), gibt Log-Zeilen sortiert `sent_at desc` zurück. Bewusst OHNE `response_body` in der Default-Auslieferung; Feld nur auf ausdrückliche Anforderung (Detail-Toggle), damit MailerSend-Payloads nicht standardmäßig im Frontend landen.

## Schritt 5 — UI: „Versand-Historie" in Bestellungs-Detail

Auf der Route `admin/bestellung.bestellungen` (bestehende Detail-Ansicht/Drawer je Bestellung) eine kleine Sektion „Versand-Historie":
- Tabelle mit Zeitpunkt, Modus (Badge `Test`/`Live`), Empfänger, Status (grün/rot), HTTP-Status, Message-ID.
- Bei `failed`: `error_message` sichtbar.
- Ein „Details"-Toggle pro Zeile lädt einmalig `response_body` per zweiter Query (`getOrderEmailLogEntry({id})`), damit große Payloads nicht in der Liste hängen.

Kein Rebuild bestehender Order-Detail-Komponenten außerhalb dieses Blocks.

## Nicht Teil dieses Schritts
- MailerSend-Webhooks / Zustellstatus („delivered", „bounced"): separater Baustein, braucht `/api/public/mailersend/webhook` + Signaturprüfung.
- CSV-Export des Logs.
- Löschen/Retention (aktuell: append-only, on-delete cascade mit `orders`).

## Migration-Kommentar (Ehrlichkeitsregel)
„Neue Tabelle `order_email_log` (append-only) + Grants/RLS. Kein Backfill historischer Sends — nur ab Aktivierung dokumentiert."
