// Verwaltung der Standortzeiten je Bereich
// (`public.location_department_defaults`). Schreibt ausschließlich über
// supabaseAdmin (DENY-ALL für direkte Manager/Admin-Writes per RLS),
// admin-gated und mit Audit-Trail.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { loadAdminCaller } from "./admin-context";
import { runGuarded } from "./admin-call";
import { makeAuditWriter } from "./audit";

const HHMM = /^([01]?\d|2[0-3]):([0-5]\d)$/;
const optTime = z
  .string()
  .trim()
  .optional()
  .nullable()
  .transform((v) => (v == null || v === "" ? null : v))
  .refine((v) => v == null || HHMM.test(v), "Format HH:MM");

export type LocationDepartmentDefaultRow = {
  locationId: string;
  department: "kitchen" | "service" | "gl";
  defaultCheckin: string | null;
  defaultCheckout: string | null;
};

export const listLocationDepartmentDefaults = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<LocationDepartmentDefaultRow[]> => {
    const caller = await loadAdminCaller(context.supabase, context.userId, ["manager", "admin"]);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("location_department_defaults")
      .select("location_id, department, default_checkin, default_checkout, locations!inner(organization_id)")
      .eq("locations.organization_id", caller.organizationId);
    if (error) throw error;
    return (data ?? []).map((r) => ({
      locationId: r.location_id as string,
      department: r.department as "kitchen" | "service" | "gl",
      defaultCheckin: r.default_checkin ? (r.default_checkin as string).slice(0, 5) : null,
      defaultCheckout: r.default_checkout ? (r.default_checkout as string).slice(0, 5) : null,
    }));
  });

const upsertSchema = z.object({
  locationId: z.string().uuid(),
  department: z.enum(["kitchen", "service", "gl"]),
  // Pflicht: HH:MM. default_checkin ist in der DB NOT NULL.
  defaultCheckin: z.string().regex(HHMM, "Format HH:MM"),
  defaultCheckout: optTime,
});

export const upsertLocationDepartmentDefault = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => upsertSchema.parse(input))
  .handler(async ({ data, context }) => {
    const caller = await loadAdminCaller(context.supabase, context.userId, "admin");
    return runGuarded(caller.role, "admin", makeAuditWriter(caller), async () => {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      // Standort-Org prüfen (RLS-Ersatz auf Service-Role-Pfad).
      const { data: loc, error: locErr } = await supabaseAdmin
        .from("locations")
        .select("organization_id")
        .eq("id", data.locationId)
        .maybeSingle();
      if (locErr) throw locErr;
      if (!loc || loc.organization_id !== caller.organizationId) {
        throw new Error("Standort nicht in deiner Organisation.");
      }
      const { error } = await supabaseAdmin
        .from("location_department_defaults")
        .upsert(
          {
            organization_id: caller.organizationId,
            location_id: data.locationId,
            department: data.department,
            default_checkin: data.defaultCheckin,
            default_checkout: data.defaultCheckout,
          },
          { onConflict: "location_id,department" },
        );
      if (error) throw error;
      return {
        result: { ok: true as const },
        audit: {
          action: "location_department_defaults.upsert",
          entity: "location_department_defaults",
          meta: {
            locationId: data.locationId,
            department: data.department,
            defaultCheckin: data.defaultCheckin,
            defaultCheckout: data.defaultCheckout,
          },
        },
      };
    });
  });