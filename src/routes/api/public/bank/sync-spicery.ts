// BK2 — Täglicher Bank-Sync (Cron). Public-Route, geschützt via
// x-cron-secret-Header. Sucht das Spicery-Konto per IBAN-Merkmal
// (gocardless_account_id gesetzt) — hart auf 'Spicery' via Konto-Name.
// Timing-safe Compare gegen CRON_SECRET.

import { createFileRoute } from "@tanstack/react-router";
import { timingSafeEqual } from "crypto";
import { runSyncForAccount } from "@/lib/bank/bank.functions";

function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

export const Route = createFileRoute("/api/public/bank/sync-spicery")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const provided = request.headers.get("x-cron-secret") ?? "";
        const expected = process.env.CRON_SECRET ?? "";
        if (!expected || !safeEqual(provided, expected)) {
          return new Response("unauthorized", { status: 401 });
        }
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: accts, error } = await supabaseAdmin
          .from("bank_accounts")
          .select("id, organization_id, name")
          .not("gocardless_account_id", "is", null);
        if (error) return Response.json({ ok: false, error: error.message }, { status: 500 });
        const spicery = (accts ?? []).filter((a) => /spicery/i.test(a.name ?? ""));
        if (spicery.length === 0) {
          return Response.json({ ok: true, note: "kein verbundenes Spicery-Konto gefunden" });
        }
        const results: Array<{ accountId: string; inserted?: number; skipped?: number; error?: string }> = [];
        for (const a of spicery) {
          try {
            const r = await runSyncForAccount(a.organization_id, a.id);
            results.push({ accountId: a.id, inserted: r.inserted, skipped: r.skipped });
          } catch (e) {
            results.push({ accountId: a.id, error: e instanceof Error ? e.message : String(e) });
          }
        }
        return Response.json({ ok: true, results });
      },
    },
  },
});