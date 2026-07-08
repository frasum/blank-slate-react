// Öffentlicher Display-Endpoint. Ohne Login, nur per Token erreichbar.
// Pfad /api/public/* bypasst die Auth-Schicht der Lovable-Publishing-Plattform.
// Token wird timing-safe verglichen; bei jedem Fehler 401/403 ohne Details.

import { createFileRoute } from "@tanstack/react-router";
import { Buffer } from "node:buffer";
import { timingSafeEqual } from "node:crypto";
import { buildDisplayData } from "@/lib/display/display-data.server";

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

        const result = await buildDisplayData(supabaseAdmin, {
          organizationId: s.organization_id,
          locationId,
          days: 31,
          showAreas: s.show_areas,
        });
        if (!result.ok) return jsonError(result.status, result.message);

        const payload = {
          ...result.data,
          refreshIntervalSeconds: s.refresh_interval_seconds,
          rotationIntervalSeconds: s.rotation_interval_seconds,
          showAreas: s.show_areas,
          showHeader: s.show_header,
          showFooter: s.show_footer,
          customMessage: s.custom_message,
        };

        return new Response(JSON.stringify(payload), {
          status: 200,
          headers: { "content-type": "application/json", "cache-control": "no-store" },
        });
      },
    },
  },
});
