// Öffentlicher Display-Endpoint. Ohne Login, nur per Token erreichbar.
// Pfad /api/public/* bypasst die Auth-Schicht der Lovable-Publishing-Plattform.
// Token wird timing-safe verglichen; bei jedem Fehler 401/403 ohne Details.

import { createFileRoute } from "@tanstack/react-router";
import { Buffer } from "node:buffer";
import { timingSafeEqual } from "node:crypto";

type ShiftDto = {
  id: string;
  staffName: string;
  area: "kitchen" | "service" | string;
  skillName: string | null;
  status: string | null;
};

type DisplayPayload = {
  location: { id: string; name: string };
  generatedAt: string;
  refreshIntervalSeconds: number;
  date: string;
  released: boolean;
  shifts: ShiftDto[];
};

function jsonError(status: number, error: string) {
  return new Response(JSON.stringify({ error }), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
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

export const Route = createFileRoute("/api/public/display/$locationId")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const url = new URL(request.url);
        const token = url.searchParams.get("token") ?? "";
        const locationId = params.locationId;

        if (!token || token.length < 16 || token.length > 256) {
          return jsonError(401, "Ungültiger Sicherheits-Token.");
        }
        if (!/^[0-9a-fA-F-]{8,64}$/.test(locationId)) {
          return jsonError(400, "Ungültige Filial-ID.");
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        const { data: settings, error: settingsErr } = await supabaseAdmin
          .from("display_settings" as never)
          .select("display_token, is_enabled, refresh_interval_seconds, organization_id")
          .eq("location_id", locationId)
          .maybeSingle();

        if (settingsErr || !settings) {
          return jsonError(401, "Ungültiger Sicherheits-Token.");
        }

        const s = settings as {
          display_token: string;
          is_enabled: boolean;
          refresh_interval_seconds: number;
          organization_id: string;
        };

        if (!safeCompare(s.display_token, token)) {
          return jsonError(401, "Ungültiger Sicherheits-Token.");
        }
        if (!s.is_enabled) {
          return jsonError(403, "Display für diese Filiale ist deaktiviert.");
        }

        const { data: location, error: locErr } = await supabaseAdmin
          .from("locations")
          .select("id, name")
          .eq("id", locationId)
          .eq("organization_id", s.organization_id)
          .maybeSingle();
        if (locErr || !location) return jsonError(404, "Filiale nicht gefunden.");

        const date = todayIso();

        // Periode zu heute auflösen und Freigabe prüfen.
        const { data: period } = await supabaseAdmin
          .from("periods")
          .select("id")
          .eq("organization_id", s.organization_id)
          .lte("start_date", date)
          .gte("end_date", date)
          .maybeSingle();

        let released = false;
        if (period) {
          const { data: rel } = await supabaseAdmin
            .from("roster_releases")
            .select("id")
            .eq("location_id", locationId)
            .eq("period_id", (period as { id: string }).id)
            .maybeSingle();
          released = !!rel;
        }

        if (!released) {
          const payload: DisplayPayload = {
            location: { id: location.id, name: location.name },
            generatedAt: new Date().toISOString(),
            refreshIntervalSeconds: s.refresh_interval_seconds,
            date,
            released: false,
            shifts: [],
          };
          return new Response(JSON.stringify(payload), {
            status: 200,
            headers: { "content-type": "application/json", "cache-control": "no-store" },
          });
        }

        const { data: shifts, error: shiftsErr } = await supabaseAdmin
          .from("roster_shifts")
          .select("id, area, skill_id, status, staff_id")
          .eq("organization_id", s.organization_id)
          .eq("location_id", locationId)
          .eq("shift_date", date);
        if (shiftsErr) return jsonError(500, "Daten konnten nicht geladen werden.");

        const staffIds = Array.from(new Set((shifts ?? []).map((s) => s.staff_id)));
        const skillIds = Array.from(
          new Set((shifts ?? []).map((s) => s.skill_id).filter(Boolean) as string[]),
        );

        const [staffRes, skillRes] = await Promise.all([
          staffIds.length
            ? supabaseAdmin
                .from("staff")
                .select("id, first_name, last_name, display_name")
                .in("id", staffIds)
            : Promise.resolve({ data: [], error: null }),
          skillIds.length
            ? supabaseAdmin.from("skills").select("id, name").in("id", skillIds)
            : Promise.resolve({ data: [], error: null }),
        ]);
        if (staffRes.error || skillRes.error) {
          return jsonError(500, "Daten konnten nicht geladen werden.");
        }

        const staffMap = new Map<string, string>();
        for (const st of staffRes.data ?? []) {
          const name =
            (st as { display_name: string | null }).display_name ||
            `${(st as { first_name: string }).first_name} ${(st as { last_name: string }).last_name}`.trim();
          staffMap.set((st as { id: string }).id, name);
        }
        const skillMap = new Map<string, string>();
        for (const sk of skillRes.data ?? []) {
          skillMap.set((sk as { id: string }).id, (sk as { name: string }).name);
        }

        const shiftsDto: ShiftDto[] = (shifts ?? [])
          .map((sh) => ({
            id: sh.id,
            staffName: staffMap.get(sh.staff_id) ?? "—",
            area: sh.area as string,
            skillName: sh.skill_id ? (skillMap.get(sh.skill_id) ?? null) : null,
            status: sh.status ?? null,
          }))
          .sort(
            (a, b) =>
              a.area.localeCompare(b.area) ||
              (a.skillName ?? "").localeCompare(b.skillName ?? "") ||
              a.staffName.localeCompare(b.staffName),
          );

        const payload: DisplayPayload = {
          location: { id: location.id, name: location.name },
          generatedAt: new Date().toISOString(),
          refreshIntervalSeconds: s.refresh_interval_seconds,
          date,
          released: true,
          shifts: shiftsDto,
        };

        return new Response(JSON.stringify(payload), {
          status: 200,
          headers: { "content-type": "application/json", "cache-control": "no-store" },
        });
      },
    },
  },
});
