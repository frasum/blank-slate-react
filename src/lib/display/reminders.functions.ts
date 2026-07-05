// DP1: CRUD-Server-Fns für display_reminders. Manager+Admin der eigenen
// Organisation dürfen verwalten; die Tabelle ist DENY-ALL — alle Zugriffe
// laufen über den Admin-Client. Cross-Org-Location wird explizit abgelehnt.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { loadAdminCaller } from "@/lib/admin/admin-context";
import { runGuarded } from "@/lib/admin/admin-call";
import { makeAuditWriter } from "@/lib/admin/audit";
import { REMINDER_COLORS, type Reminder } from "./reminders";

const ALLOWED_ROLES = ["manager", "admin"] as const;

async function assertLocationInOrg(organizationId: string, locationId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("locations")
    .select("id")
    .eq("id", locationId)
    .eq("organization_id", organizationId)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("Standort gehört nicht zu dieser Organisation.");
}

type DbRow = {
  id: string;
  organization_id: string;
  location_id: string;
  title: string;
  emoji: string | null;
  color: string;
  weekday: number;
  interval_weeks: number;
  anchor_date: string | null;
  from_time: string;
  until_time: string;
  is_active: boolean;
  sort_order: number;
};

type AdminReminder = Reminder & { isActive: boolean; locationId: string };

function mapRow(row: DbRow): AdminReminder {
  return {
    id: row.id,
    locationId: row.location_id,
    title: row.title,
    emoji: row.emoji,
    color: row.color as Reminder["color"],
    weekday: row.weekday,
    intervalWeeks: (row.interval_weeks === 2 ? 2 : 1) as 1 | 2,
    anchorDate: row.anchor_date,
    fromTime: (row.from_time ?? "").slice(0, 5),
    untilTime: (row.until_time ?? "01:00").slice(0, 5),
    sortOrder: row.sort_order,
    isActive: row.is_active,
  };
}

const baseShape = {
  title: z.string().trim().min(1).max(120),
  emoji: z
    .string()
    .trim()
    .max(8)
    .optional()
    .nullable()
    .transform((v) => (v == null || v === "" ? null : v)),
  color: z.enum(REMINDER_COLORS),
  weekday: z.number().int().min(0).max(6),
  intervalWeeks: z.union([z.literal(1), z.literal(2)]),
  anchorDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .optional(),
  fromTime: z.string().regex(/^\d{2}:\d{2}$/),
  untilTime: z.string().regex(/^\d{2}:\d{2}$/).default("01:00"),
  isActive: z.boolean().optional(),
  sortOrder: z.number().int().min(0).max(9999).optional(),
};

const createSchema = z
  .object({ locationId: z.string().uuid(), ...baseShape })
  .refine((v) => v.intervalWeeks === 1 || !!v.anchorDate, {
    message: "Ankerdatum ist bei 14-tägigem Rhythmus erforderlich.",
    path: ["anchorDate"],
  })
  .refine(
    (v) => {
      const [fh, fm] = v.fromTime.split(":").map(Number);
      const [uh, um] = v.untilTime.split(":").map(Number);
      const from = fh * 60 + fm;
      const until = uh * 60 + um;
      // Über-Mitternacht-Fall: until <= from → until darf höchstens 03:00 sein.
      if (until <= from) return until <= 180;
      return until > from;
    },
    {
      message:
        "\"bis\" muss nach \"ab\" liegen — oder (über Mitternacht) höchstens 03:00 sein.",
      path: ["untilTime"],
    },
  );

const updateSchema = z
  .object({ id: z.string().uuid(), ...baseShape })
  .refine((v) => v.intervalWeeks === 1 || !!v.anchorDate, {
    message: "Ankerdatum ist bei 14-tägigem Rhythmus erforderlich.",
    path: ["anchorDate"],
  })
  .refine(
    (v) => {
      const [fh, fm] = v.fromTime.split(":").map(Number);
      const [uh, um] = v.untilTime.split(":").map(Number);
      const from = fh * 60 + fm;
      const until = uh * 60 + um;
      if (until <= from) return until <= 180;
      return until > from;
    },
    {
      message:
        "\"bis\" muss nach \"ab\" liegen — oder (über Mitternacht) höchstens 03:00 sein.",
      path: ["untilTime"],
    },
  );

export const listDisplayReminders = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ locationId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const caller = await loadAdminCaller(context.supabase, context.userId, ALLOWED_ROLES);
    await assertLocationInOrg(caller.organizationId, data.locationId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows, error } = await supabaseAdmin
      .from("display_reminders" as never)
      .select("*")
      .eq("organization_id", caller.organizationId)
      .eq("location_id", data.locationId)
      .order("sort_order", { ascending: true })
      .order("from_time", { ascending: true });
    if (error) throw error;
    return ((rows ?? []) as DbRow[]).map(mapRow);
  });

export const createDisplayReminder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => createSchema.parse(input))
  .handler(async ({ data, context }) => {
    const caller = await loadAdminCaller(context.supabase, context.userId, ALLOWED_ROLES);
    await assertLocationInOrg(caller.organizationId, data.locationId);
    return runGuarded(caller.role, "manager", makeAuditWriter(caller), async () => {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const payload = {
        organization_id: caller.organizationId,
        location_id: data.locationId,
        title: data.title,
        emoji: data.emoji ?? null,
        color: data.color,
        weekday: data.weekday,
        interval_weeks: data.intervalWeeks,
        anchor_date: data.anchorDate ?? null,
        from_time: data.fromTime,
        until_time: data.untilTime,
        is_active: data.isActive ?? true,
        sort_order: data.sortOrder ?? 0,
      };
      const { data: row, error } = await supabaseAdmin
        .from("display_reminders" as never)
        .insert(payload as never)
        .select("*")
        .single();
      if (error) throw error;
      const mapped = mapRow(row as unknown as DbRow);
      return {
        result: mapped,
        audit: {
          action: "display_reminder.created",
          entity: "display_reminder",
          entityId: mapped.id,
          meta: { locationId: data.locationId, title: data.title },
        },
      };
    });
  });

export const updateDisplayReminder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => updateSchema.parse(input))
  .handler(async ({ data, context }) => {
    const caller = await loadAdminCaller(context.supabase, context.userId, ALLOWED_ROLES);
    return runGuarded(caller.role, "manager", makeAuditWriter(caller), async () => {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const patch = {
        title: data.title,
        emoji: data.emoji ?? null,
        color: data.color,
        weekday: data.weekday,
        interval_weeks: data.intervalWeeks,
        anchor_date: data.anchorDate ?? null,
        from_time: data.fromTime,
        until_time: data.untilTime,
        is_active: data.isActive ?? true,
        sort_order: data.sortOrder ?? 0,
      };
      const { data: row, error } = await supabaseAdmin
        .from("display_reminders" as never)
        .update(patch as never)
        .eq("id", data.id)
        .eq("organization_id", caller.organizationId)
        .select("*")
        .single();
      if (error) throw error;
      const mapped = mapRow(row as unknown as DbRow);
      return {
        result: mapped,
        audit: {
          action: "display_reminder.updated",
          entity: "display_reminder",
          entityId: mapped.id,
          meta: { title: data.title },
        },
      };
    });
  });

export const deleteDisplayReminder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const caller = await loadAdminCaller(context.supabase, context.userId, ALLOWED_ROLES);
    return runGuarded(caller.role, "manager", makeAuditWriter(caller), async () => {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { error } = await supabaseAdmin
        .from("display_reminders" as never)
        .delete()
        .eq("id", data.id)
        .eq("organization_id", caller.organizationId);
      if (error) throw error;
      return {
        result: { ok: true as const },
        audit: {
          action: "display_reminder.deleted",
          entity: "display_reminder",
          entityId: data.id,
        },
      };
    });
  });
