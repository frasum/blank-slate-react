// Öffentlich erreichbarer, per timing-safem Header-Secret geschützter Endpoint
// für den Telegram-Tagesbericht (TG2). pg_cron ruft ihn STÜNDLICH; der Endpoint
// gated selbst (Berlin-Stunde == telegram_report_hour UND last_sent < heute)
// → DST-fest + idempotent.
//
// Absicht: Kein Login-Kontext, kein user_id — der Endpoint arbeitet
// serviceseitig für JEDE Organisation mit telegram_report_enabled=true.
// Sicherheit basiert ausschließlich auf X-Cron-Secret.
//
// Anmerkung zum Pfad: Der TG2-Prompt nennt /api/internal/… — auf dem
// TanStack-Start-Stack ist aber nur der /api/public/-Prefix zuverlässig
// ohne Lovable-Auth-Wall erreichbar; die eigentliche Absicherung passiert
// über den timing-safen Secret-Check unten.

import { createFileRoute } from "@tanstack/react-router";
import { timingSafeEqual } from "node:crypto";

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

export const Route = createFileRoute("/api/public/telegram/daily-report")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const expected = process.env.TELEGRAM_CRON_SECRET;
        if (!expected) {
          return new Response("Telegram-Cron-Secret nicht konfiguriert", { status: 503 });
        }
        const actual = request.headers.get("X-Cron-Secret") ?? "";
        if (!safeEqual(actual, expected)) {
          return new Response("Unauthorized", { status: 401 });
        }

        const { listOrgsWithReportEnabled, runDailyReportForOrg } = await import(
          "@/lib/telegram/telegram-report.server"
        );
        const orgIds = await listOrgsWithReportEnabled();
        const results = [];
        for (const organizationId of orgIds) {
          try {
            const r = await runDailyReportForOrg({ organizationId, skipGate: false });
            results.push(r);
          } catch (e) {
            results.push({
              organizationId,
              error: e instanceof Error ? e.message : String(e),
            });
          }
        }
        return Response.json({ ok: true, results });
      },
    },
  },
});