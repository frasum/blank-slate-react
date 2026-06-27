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
  releasedAreas: string[];
  shifts: ShiftDto[];
  rotationEnabled: boolean;
  rotationIntervalSeconds: number;
  showAreas: string[] | null;
  showHeader: boolean;
  showFooter: boolean;
  customMessage: string | null;
  birthdays: string[];
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
          .select(
            "display_token, is_enabled, refresh_interval_seconds, organization_id, rotation_enabled, rotation_interval_seconds, show_areas, show_header, show_footer, custom_message",
          )
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
          rotation_enabled: boolean;
          rotation_interval_seconds: number;
          show_areas: string[] | null;
          show_header: boolean;
          show_footer: boolean;
          custom_message: string | null;
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

        const releasedAreas: string[] = [];
        if (period) {
          const { data: rels } = await supabaseAdmin
            .from("roster_releases")
            .select("area")
            .eq("location_id", locationId)
            .eq("period_id", (period as { id: string }).id);
          for (const r of rels ?? []) {
            const a = (r as { area: string }).area;
            if (a === "kitchen" || a === "service") releasedAreas.push(a);
          }
        }

        // Geburtstage des aktiven Teams am Standort (Tag+Monat == heute).
        const todayMmDd = date.slice(5); // "MM-DD"
        const birthdays: string[] = [];
        const { data: locRows } = await supabaseAdmin
          .from("staff_locations")
          .select("staff_id")
          .eq("location_id", locationId)
          .eq("organization_id", s.organization_id);
        const teamIds = Array.from(
          new Set((locRows ?? []).map((r) => (r as { staff_id: string }).staff_id)),
        );
        if (teamIds.length) {
          const { data: teamRows } = await supabaseAdmin
            .from("staff")
            .select("id, first_name, last_name, display_name")
            .in("id", teamIds)
            .eq("is_active", true);
          const activeIds = (teamRows ?? []).map((r) => (r as { id: string }).id);
          if (activeIds.length) {
            const { data: dobRows } = await supabaseAdmin
              .from("staff_personal_details")
              .select("staff_id, date_of_birth")
              .in("staff_id", activeIds);
            const dobMap = new Map<string, string>();
            for (const d of dobRows ?? []) {
              const r = d as { staff_id: string; date_of_birth: string | null };
              if (r.date_of_birth) dobMap.set(r.staff_id, String(r.date_of_birth).slice(5, 10));
            }
            for (const t of teamRows ?? []) {
              const r = t as {
                id: string;
                first_name: string | null;
                last_name: string | null;
                display_name: string | null;
              };
              if (dobMap.get(r.id) === todayMmDd) {
                const name = r.display_name || `${r.first_name ?? ""} ${r.last_name ?? ""}`.trim();
                if (name) birthdays.push(name);
              }
            }
          }
        }

        const { data: shifts, error: shiftsErr } = await supabaseAdmin
          .from("roster_shifts")
          .select("id, area, skill_id, status, staff_id")
          .eq("organization_id", s.organization_id)
          .eq("location_id", locationId)
          .eq("shift_date", date);
        if (shiftsErr) return jsonError(500, "Daten konnten nicht geladen werden.");

        const filteredShifts = (shifts ?? []).filter((sh) => {
          if (sh.area === "kitchen") return releasedAreas.includes("kitchen");
          if (sh.area === "service") return releasedAreas.includes("service");
          return true;
        });

        const staffIds = Array.from(new Set(filteredShifts.map((s) => s.staff_id)));
        const skillIds = Array.from(
          new Set(filteredShifts.map((s) => s.skill_id).filter(Boolean) as string[]),
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

        const shiftsDto: ShiftDto[] = filteredShifts
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
          releasedAreas,
          shifts: shiftsDto,
          rotationEnabled: s.rotation_enabled,
          rotationIntervalSeconds: s.rotation_interval_seconds,
          showAreas: s.show_areas,
          showHeader: s.show_header,
          showFooter: s.show_footer,
          customMessage: s.custom_message,
          birthdays,
        };

        return new Response(JSON.stringify(payload), {
          status: 200,
          headers: { "content-type": "application/json", "cache-control": "no-store" },
        });
      },
    },
  },
});
