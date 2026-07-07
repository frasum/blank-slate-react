// RT1 — Server-Fns für den Betriebskalender pro Standort.
// Read: alle Org-Rollen; Write: manager+ (locations.manage).

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { loadAdminCaller } from "@/lib/admin/admin-context";
import { runWithPermission } from "@/lib/admin/admin-call";
import { makeAuditWriter } from "@/lib/admin/audit";

const READ_ROLES = ["manager", "admin", "payroll", "staff", "planer"] as const;
const WRITE_ROLES = ["manager", "admin"] as const;

export type CalendarException = {
  id: string;
  date: string;
  kind: "closed" | "open";
  reason: string | null;
};

export type LocationCalendar = {
  restWeekdays: number[];
  exceptions: CalendarException[];
};

async function assertLocationInOrg(
  admin: import("@supabase/supabase-js").SupabaseClient<
    import("@/integrations/supabase/types").Database
  >,
  organizationId: string,
  locationId: string,
): Promise<void> {
  const { data, error } = await admin
    .from("locations")
    .select("id")
    .eq("id", locationId)
    .eq("organization_id", organizationId)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("Standort nicht gefunden.");
}

export const getLocationCalendar = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        locationId: z.string().uuid(),
        startDate: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/)
          .optional(),
        endDate: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/)
          .optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<LocationCalendar> => {
    const caller = await loadAdminCaller(context.supabase, context.userId, READ_ROLES);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await assertLocationInOrg(supabaseAdmin, caller.organizationId, data.locationId);

    const [restRes, exRes] = await Promise.all([
      supabaseAdmin
        .from("location_rest_days")
        .select("weekday")
        .eq("organization_id", caller.organizationId)
        .eq("location_id", data.locationId),
      (async () => {
        let q = supabaseAdmin
          .from("location_calendar_exceptions")
          .select("id, date, kind, reason")
          .eq("organization_id", caller.organizationId)
          .eq("location_id", data.locationId)
          .order("date", { ascending: true });
        if (data.startDate) q = q.gte("date", data.startDate);
        if (data.endDate) q = q.lte("date", data.endDate);
        return q;
      })(),
    ]);
    if (restRes.error) throw restRes.error;
    if (exRes.error) throw exRes.error;
    return {
      restWeekdays: (restRes.data ?? []).map((r) => Number(r.weekday)).sort((a, b) => a - b),
      exceptions: (exRes.data ?? []).map((r) => ({
        id: r.id as string,
        date: r.date as string,
        kind: r.kind as "closed" | "open",
        reason: (r.reason as string | null) ?? null,
      })),
    };
  });

export const setRestDays = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        locationId: z.string().uuid(),
        weekdays: z.array(z.number().int().min(1).max(7)).max(7),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const caller = await loadAdminCaller(context.supabase, context.userId, WRITE_ROLES);
    return runWithPermission(
      context.supabase,
      "locations.manage",
      data.locationId,
      makeAuditWriter(caller),
      async () => {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        await assertLocationInOrg(supabaseAdmin, caller.organizationId, data.locationId);
        const unique = Array.from(new Set(data.weekdays)).sort((a, b) => a - b);
        const { error: delErr } = await supabaseAdmin
          .from("location_rest_days")
          .delete()
          .eq("organization_id", caller.organizationId)
          .eq("location_id", data.locationId);
        if (delErr) throw delErr;
        if (unique.length > 0) {
          const { error: insErr } = await supabaseAdmin.from("location_rest_days").insert(
            unique.map((w) => ({
              organization_id: caller.organizationId,
              location_id: data.locationId,
              weekday: w,
            })),
          );
          if (insErr) throw insErr;
        }
        return {
          result: { ok: true as const, weekdays: unique },
          audit: {
            action: "location_rest_days.set",
            entity: "location",
            entityId: data.locationId,
            meta: { weekdays: unique },
          },
        };
      },
    );
  });

export const upsertCalendarException = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        locationId: z.string().uuid(),
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        kind: z.enum(["closed", "open"]),
        reason: z.string().trim().max(200).nullable().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const caller = await loadAdminCaller(context.supabase, context.userId, WRITE_ROLES);
    return runWithPermission(
      context.supabase,
      "locations.manage",
      data.locationId,
      makeAuditWriter(caller),
      async () => {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        await assertLocationInOrg(supabaseAdmin, caller.organizationId, data.locationId);
        const reason = data.reason && data.reason.length > 0 ? data.reason : null;
        const { data: row, error } = await supabaseAdmin
          .from("location_calendar_exceptions")
          .upsert(
            {
              organization_id: caller.organizationId,
              location_id: data.locationId,
              date: data.date,
              kind: data.kind,
              reason,
            },
            { onConflict: "location_id,date" },
          )
          .select("id")
          .single();
        if (error) throw error;
        return {
          result: { id: row.id as string },
          audit: {
            action: "location_calendar_exception.upsert",
            entity: "location_calendar_exception",
            entityId: row.id as string,
            meta: {
              locationId: data.locationId,
              date: data.date,
              kind: data.kind,
              hasReason: !!reason,
            },
          },
        };
      },
    );
  });

export const deleteCalendarException = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const caller = await loadAdminCaller(context.supabase, context.userId, WRITE_ROLES);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: snap, error: loadErr } = await supabaseAdmin
      .from("location_calendar_exceptions")
      .select("id, location_id, organization_id, date, kind")
      .eq("id", data.id)
      .maybeSingle();
    if (loadErr) throw loadErr;
    if (!snap || snap.organization_id !== caller.organizationId) {
      throw new Error("Eintrag nicht gefunden.");
    }
    return runWithPermission(
      context.supabase,
      "locations.manage",
      snap.location_id as string,
      makeAuditWriter(caller),
      async () => {
        const { error } = await supabaseAdmin
          .from("location_calendar_exceptions")
          .delete()
          .eq("id", data.id)
          .eq("organization_id", caller.organizationId);
        if (error) throw error;
        return {
          result: { ok: true as const },
          audit: {
            action: "location_calendar_exception.delete",
            entity: "location_calendar_exception",
            entityId: data.id,
            meta: { locationId: snap.location_id, date: snap.date, kind: snap.kind },
          },
        };
      },
    );
  });