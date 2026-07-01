// Öffentlicher iCal-Feed für persönliche Dienstplan-Abos.
// Erreichbar ohne Login unter /api/public/calendar/<token>[.ics].
// Der Pfad /api/public/* umgeht die Publishing-Auth; Sicherheit liegt
// ausschließlich am zufälligen 32-Byte-Token (base64url, timing-safe
// verglichen). Bei jedem Fehler generisch 404 — kein Hinweis, warum.

import { createFileRoute } from "@tanstack/react-router";
import { Buffer } from "node:buffer";
import { timingSafeEqual } from "node:crypto";
import { buildRosterIcs, type RosterIcsEvent } from "@/lib/calendar/roster-ics";
import { poolLocalTimeToIso } from "@/lib/cash/pool-time-writeback";

function notFound(): Response {
  return new Response("Not found", {
    status: 404,
    headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" },
  });
}

function safeCompare(a: string, b: string): boolean {
  const aBuf = Buffer.from(a);
  const bBuf = Buffer.from(b);
  if (aBuf.length !== bBuf.length) return false;
  return timingSafeEqual(aBuf, bBuf);
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function shiftIso(iso: string, deltaDays: number): string {
  const d = new Date(iso + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + deltaDays);
  return d.toISOString().slice(0, 10);
}

const AREA_LABEL: Record<string, string> = {
  kitchen: "Küche",
  service: "Service",
  gl: "GL",
};

export const Route = createFileRoute("/api/public/calendar/$token")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const raw = String(params.token ?? "");
        const token = raw.replace(/\.ics$/i, "");
        if (token.length < 16 || token.length > 256) return notFound();

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        // Kandidat über indizierten Lookup holen; dann timing-safe vergleichen.
        const { data: tokenRow, error: tokenErr } = await supabaseAdmin
          .from("access_tokens")
          .select("token, staff_id, organization_id, expires_at, used_at")
          .eq("token_type", "calendar_feed")
          .eq("token", token)
          .is("used_at", null)
          .maybeSingle();
        if (tokenErr || !tokenRow) return notFound();
        if (!safeCompare(tokenRow.token, token)) return notFound();
        if (tokenRow.expires_at && new Date(tokenRow.expires_at).getTime() < Date.now()) {
          return notFound();
        }
        if (!tokenRow.staff_id) return notFound();

        const staffId = tokenRow.staff_id;
        const orgId = tokenRow.organization_id;
        const windowStart = shiftIso(todayIso(), -30);
        const windowEnd = shiftIso(todayIso(), 120);

        const { data: shifts, error: shiftErr } = await supabaseAdmin
          .from("roster_shifts")
          .select("id, shift_date, area, location_id, skill_id")
          .eq("organization_id", orgId)
          .eq("staff_id", staffId)
          .gte("shift_date", windowStart)
          .lte("shift_date", windowEnd);
        if (shiftErr) return notFound();

        const locationIds = Array.from(new Set((shifts ?? []).map((s) => s.location_id)));
        const skillIds = Array.from(
          new Set((shifts ?? []).map((s) => s.skill_id).filter((v): v is string => !!v)),
        );

        const locMap = new Map<string, string>();
        if (locationIds.length) {
          const { data: locs } = await supabaseAdmin
            .from("locations")
            .select("id, name")
            .eq("organization_id", orgId)
            .in("id", locationIds);
          for (const l of locs ?? []) locMap.set(l.id, l.name);
        }

        const skillMap = new Map<string, string>();
        if (skillIds.length) {
          const { data: sks } = await supabaseAdmin
            .from("skills")
            .select("id, name")
            .eq("organization_id", orgId)
            .in("id", skillIds);
          for (const s of sks ?? []) skillMap.set(s.id, s.name);
        }

        const defaults = new Map<string, { checkin: string | null; checkout: string | null }>();
        if (locationIds.length) {
          const { data: lddRows } = await supabaseAdmin
            .from("location_department_defaults")
            .select("location_id, department, default_checkin, default_checkout")
            .eq("organization_id", orgId)
            .in("location_id", locationIds);
          for (const r of lddRows ?? []) {
            defaults.set(`${r.location_id}|${r.department}`, {
              checkin: r.default_checkin ?? null,
              checkout: r.default_checkout ?? null,
            });
          }
        }

        const events: RosterIcsEvent[] = [];
        for (const s of shifts ?? []) {
          const areaLabel = AREA_LABEL[s.area] ?? s.area;
          const skillName = s.skill_id ? (skillMap.get(s.skill_id) ?? null) : null;
          const summary = skillName ? `${areaLabel} · ${skillName}` : areaLabel;
          const location = locMap.get(s.location_id) ?? "";
          const uid = `roster-${s.id}@coco`;
          const def = defaults.get(`${s.location_id}|${s.area}`);
          const checkin = def?.checkin ? def.checkin.slice(0, 5) : null;
          const checkout = def?.checkout ? def.checkout.slice(0, 5) : null;
          if (checkin && checkout) {
            const crossesMidnight = checkout < checkin;
            events.push({
              uid,
              summary,
              location,
              allDay: false,
              startIso: poolLocalTimeToIso(s.shift_date, checkin, 0),
              endIso: poolLocalTimeToIso(s.shift_date, checkout, crossesMidnight ? 1 : 0),
            });
          } else {
            events.push({ uid, summary, location, allDay: true, date: s.shift_date });
          }
        }

        const ics = buildRosterIcs({ calendarName: "COCO Dienstplan", events });
        return new Response(ics, {
          status: 200,
          headers: {
            "content-type": "text/calendar; charset=utf-8",
            "content-disposition": 'inline; filename="coco-dienstplan.ics"',
            "cache-control": "private, max-age=3600",
          },
        });
      },
    },
  },
});
