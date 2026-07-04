## Ziel
Freiwilliges Telegram-Onboarding für Mitarbeiter: dezenter Hinweis-Banner nach Login, solange kein Telegram-Chat verknüpft ist. Kein Zwang, keine Ausblend-Option — Banner verschwindet automatisch, sobald verknüpft.

## Umfang
- **Neue Komponente** `src/components/telegram/TelegramLinkBanner.tsx`
  - Nutzt bestehende Server-Fn `getMyTelegramLink()` via `useQuery` (Key: `["profile","telegram-link"]`, gleicher Key wie in `TelegramCard`, damit Invalidierung nach Verknüpfen den Banner sofort verschwinden lässt).
  - Rendert nur, wenn `status === "unlinked"` **oder** `status === "pending"` mit sichtbarem Hinweis „warte auf ‚Start' in Telegram".
  - Rendert **nichts** bei `status === "linked"`, während Loading, bei Fehler, und wenn `botUsername` fehlt (Bot nicht konfiguriert → kein sinnloser Banner).
  - Layout: schmale Leiste, `bg-muted/60 border-b`, Icon + Text + Primär-Button „Jetzt verknüpfen" (Link zu `/profil#telegram`) + sekundärer Text-Link „Später".
  - „Später" ist rein visuell (kein Persist) — Banner erscheint beim nächsten Login wieder, entsprechend der gewählten Option „Freiwillig, immer erinnern". Klick auf „Später" blendet den Banner nur für die aktuelle Session per lokalem `useState` aus (kein localStorage).
- **Einbindung** in `src/routes/_authenticated/route.tsx` (Layout aller eingeloggten Seiten) direkt oberhalb des `<Outlet />`, damit der Banner auf jeder Mitarbeiter-Seite genau einmal erscheint. Kein Rendern in Admin-Only-Bereichen? — Doch, Admins sind auch Mitarbeiter mit Telegram-Möglichkeit; also wirklich global unter `_authenticated`.
- **Anker in `/profil`**: `id="telegram"` auf der `TelegramCard`-Section ergänzen, damit der Deep-Link `/profil#telegram` sauber scrollt.

## Nicht enthalten (bewusst)
- Kein DB-Feld für „Nicht mehr fragen" (User hat „immer erinnern" gewählt).
- Kein neuer Onboarding-Dialog, keine eigene Onboarding-Route.
- Keine Änderung an Server-Fns, Webhook, Policies, Migrations.
- Keine Änderung am `TelegramCard`-Verhalten selbst (Verknüpfen/Trennen bleibt wie bisher).

## Technische Details
- Query wird schon in `TelegramCard` gehalten; bei zwei Consumern (Banner + Card auf /profil) cached React-Query korrekt — kein doppelter Request.
- SSR-sicher: `getMyTelegramLink` ist auth-geschützt, wird von `_authenticated` Layout genutzt → OK (Layout ist im geschützten Subtree).
- Keine neuen Packages, keine Änderungen an TanStack-Struktur.

## Erfolgs-Gate
- Auf jeder Seite unter `/` (nach Login) erscheint der Banner, solange nicht verknüpft.
- Nach erfolgreicher Verknüpfung (Klick „Verknüpfen" in Card → Start in Telegram → Webhook setzt `linked_at`) verschwindet Banner beim nächsten Query-Refetch/Invalidate.
- Klick auf Banner-Button springt zu `/profil#telegram` und scrollt zur Karte.
- `tsc`, Build grün, keine Migration.