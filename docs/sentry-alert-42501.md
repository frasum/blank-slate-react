# Sentry-Alert: 42501 auf `pin_attempt_register`

Kontext: §95 (14.07.2026). Ein fehlender `GRANT EXECUTE … TO service_role`
auf der Login-RPC hat den PIN-Login stumm scheitern lassen. Ein
Wiederauftreten muss sofort auffallen.

## Signal

`src/lib/auth/auth-flows.functions.ts` erkennt bei jedem
`pin_attempt_register`-Aufruf den Postgres-Code `42501` und sendet an Sentry:

- `level: error`, `environment: production`
- Tags:
  - `alert = pin_rpc_privilege`
  - `rpc = pin_attempt_register`
  - `pg_code = 42501`
  - `critical = true`
  - `op ∈ { pin-login, password-login }`
- Nachricht: `[<op>] pin_attempt_register 42501: <pg-message>`

## Alert-Regel (Sentry → Alerts → Create Alert → Issues)

- **When**: A new issue is created (any) **OR** an event occurs.
- **If (all)**:
  - `event.tags[alert] equals pin_rpc_privilege`
  - `event.tags[pg_code] equals 42501`
  - `event.environment equals production`
- **Rate limit**: 1 Aktion pro 5 Minuten (Storm-Schutz).
- **Then**:
  - E-Mail an on-call (Frank).
  - Optional: Webhook/Slack.
- **Environment**: production.

## Test

Temporär EXECUTE auf einer Staging-DB entziehen
(`REVOKE EXECUTE ON FUNCTION public.pin_attempt_register(...) FROM service_role;`),
einen Login-Versuch auslösen, Event in Sentry prüfen, Rechte sofort
wieder setzen. **Nicht in Produktion testen.**