// M-Statistik Schritt 2 — Read-Server-Fn: Umsatzkennzahlen für eine Periode
// (oder ein frei wählbares Datumsfenster) inkl. Vorperiode + Trend.
//
// Reine Lese-Funktion. Keine Schreibvorgänge, kein Audit-Log, keine UI.
// Org-Scope strikt aus `loadAdminCaller` — nie aus dem Client-Input.
//
// S-6 (siehe gruendungsdokument.md, Nachtrag M-Statistik): ALLE Session-
// Status (`open|finalized|locked`) werden gezählt. Leere Tage tragen 0;
// `daysWithRevenue` aus `summarize` zählt nur Tage mit total > 0.
//
// TSB-Verifikationspunkt (offen): vectron + `pos`-Kanal „Kasse" eventuell
// gleichzeitig befüllt → doppelte Zählung. Diese Fn behandelt das NICHT
// speziell; sie summiert nur, was die DB liefert.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { loadAdminCaller } from "@/lib/admin/admin-context";
import {
  aggregateByBusinessDate,
  computeTrend,
  summarize,
  type DailyRevenue,
  type PeriodSummary,
  type Trend,
} from "./revenue-core";
import { mapToSessionInputs, type ChannelAmountRow, type SessionRow } from "./revenue-map";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

type ChannelAmountQueryRow = {
  session_id: string;
  amount_cents: number;
  revenue_channels: { is_takeaway: boolean } | null;
};

type Window = { startDate: string; endDate: string };

function addDays(iso: string, delta: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

function daysBetween(start: string, end: string): number {
  const a = Date.UTC(
    Number(start.slice(0, 4)),
    Number(start.slice(5, 7)) - 1,
    Number(start.slice(8, 10)),
  );
  const b = Date.UTC(
    Number(end.slice(0, 4)),
    Number(end.slice(5, 7)) - 1,
    Number(end.slice(8, 10)),
  );
  return Math.round((b - a) / 86_400_000);
}

export const getRevenueStats = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        periodId: z.string().uuid().optional(),
        startDate: z.string().regex(DATE_RE).optional(),
        endDate: z.string().regex(DATE_RE).optional(),
        locationId: z.string().uuid().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const caller = await loadAdminCaller(context.supabase, context.userId, [
      "manager",
      "admin",
      "payroll",
    ]);
    const org = caller.organizationId;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // 1) Aktuellen Zeitraum + Label auflösen.
    let current: Window;
    let label: string | null = null;
    let currentStartIso: string | null = null;

    if (data.periodId) {
      const { data: p, error } = await supabaseAdmin
        .from("periods")
        .select("id, label, start_date, end_date")
        .eq("id", data.periodId)
        .eq("organization_id", org)
        .maybeSingle();
      if (error) throw error;
      if (!p) throw new Error("Periode nicht gefunden.");
      current = { startDate: p.start_date as string, endDate: p.end_date as string };
      label = (p.label as string) ?? null;
      currentStartIso = current.startDate;
    } else {
      if (!data.startDate || !data.endDate) {
        throw new Error("startDate und endDate sind ohne periodId Pflicht.");
      }
      if (data.endDate < data.startDate) {
        throw new Error("endDate muss ≥ startDate sein.");
      }
      current = { startDate: data.startDate, endDate: data.endDate };
    }

    // 2) Vorperiode auflösen.
    let previous: Window | null = null;
    if (data.periodId && currentStartIso) {
      const { data: prev, error } = await supabaseAdmin
        .from("periods")
        .select("start_date, end_date")
        .eq("organization_id", org)
        .lt("start_date", currentStartIso)
        .order("start_date", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      if (prev) {
        previous = {
          startDate: prev.start_date as string,
          endDate: prev.end_date as string,
        };
      }
    } else {
      const len = daysBetween(current.startDate, current.endDate); // 0 = ein Tag
      const prevEnd = addDays(current.startDate, -1);
      const prevStart = addDays(prevEnd, -len);
      previous = { startDate: prevStart, endDate: prevEnd };
    }

    // 3) Fenster laden: Sessions + Channel-Amounts.
    async function loadWindow(
      win: Window,
    ): Promise<{ daily: DailyRevenue[]; summary: PeriodSummary }> {
      let sessionQuery = supabaseAdmin
        .from("sessions")
        .select("id, business_date, location_id, vectron_daily_total_cents")
        .eq("organization_id", org)
        .gte("business_date", win.startDate)
        .lte("business_date", win.endDate);
      if (data.locationId) {
        sessionQuery = sessionQuery.eq("location_id", data.locationId);
      }
      const { data: sessRows, error: sessErr } = await sessionQuery;
      if (sessErr) throw sessErr;

      const sessions: SessionRow[] = (sessRows ?? []).map((r) => ({
        id: r.id as string,
        businessDate: r.business_date as string,
        locationId: r.location_id as string,
        vectronCents: (r.vectron_daily_total_cents as number | null) ?? 0,
      }));

      let channels: ChannelAmountRow[] = [];
      if (sessions.length > 0) {
        const ids = sessions.map((s) => s.id);
        // TSB-Hinweis (offen): pos-Kanal „Kasse" wird hier mitgeliefert, falls
        // er existiert; doppelte Zählung mit vectronCents ist nicht
        // ausgeschlossen, bis TSB-Daten verifiziert sind.
        const { data: chRows, error: chErr } = await supabaseAdmin
          .from("session_channel_amounts")
          .select("session_id, amount_cents, revenue_channels(is_takeaway)")
          .eq("organization_id", org)
          .in("session_id", ids)
          .returns<ChannelAmountQueryRow[]>();
        if (chErr) throw chErr;
        channels = (chRows ?? []).map((r) => ({
          sessionId: r.session_id,
          amountCents: r.amount_cents,
          isTakeaway: r.revenue_channels?.is_takeaway ?? false,
        }));
      }

      const inputs = mapToSessionInputs(sessions, channels);
      const daily = aggregateByBusinessDate(inputs);
      return { daily, summary: summarize(daily) };
    }

    const cur = await loadWindow(current);
    const prev = previous ? await loadWindow(previous) : null;

    const trend: { total: Trend; house: Trend; takeaway: Trend } | null = prev
      ? {
          total: computeTrend(cur.summary.totalCents, prev.summary.totalCents),
          house: computeTrend(cur.summary.houseCents, prev.summary.houseCents),
          takeaway: computeTrend(cur.summary.takeawayCents, prev.summary.takeawayCents),
        }
      : null;

    return {
      range: { startDate: current.startDate, endDate: current.endDate, label },
      daily: cur.daily,
      summary: cur.summary,
      previous: prev ? prev.summary : null,
      trend,
    };
  });
