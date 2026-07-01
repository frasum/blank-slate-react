// Täglicher Cron-Einstieg (extern von Supabase pg_cron getriggert).
// Legt für jeden Standort mit geplanten Schichten am heutigen
// Geschäftstag idempotent eine Session an (inkl. Trinkgeld-Pool-
// Snapshot). Autorisierung: fail-closed über x-cron-secret Header,
// timing-sicher verglichen. Secret niemals loggen.

import { createFileRoute } from "@tanstack/react-router";
import { Buffer } from "node:buffer";
import { timingSafeEqual } from "node:crypto";
import { ensureDailySessions } from "@/lib/cash/cash.functions";

function safeCompare(a: string, b: string): boolean {
  const aBuf = Buffer.from(a);
  const bBuf = Buffer.from(b);
  if (aBuf.length !== bBuf.length) return false;
  return timingSafeEqual(aBuf, bBuf);
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

export const Route = createFileRoute("/api/public/cron-ensure-sessions")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = process.env.CRON_SECRET;
        if (!secret) {
          return jsonResponse(500, { error: "not configured" });
        }
        const provided = request.headers.get("x-cron-secret") ?? "";
        if (!provided || !safeCompare(provided, secret)) {
          return jsonResponse(401, { error: "unauthorized" });
        }
        try {
          const { businessDate, results } = await ensureDailySessions();
          const created = results.filter((r) => r.created).length;
          return jsonResponse(200, { ok: true, businessDate, created, results });
        } catch (err) {
          console.error("[cron-ensure-sessions] failed", err);
          return jsonResponse(500, { error: "internal error" });
        }
      },
    },
  },
});
