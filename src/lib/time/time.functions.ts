// Zeiterfassung B2a — Server-Functions.
//
// Architektur:
//  - Alle Schreibvorgänge laufen ausschließlich serverseitig via supabaseAdmin.
//    time_entries hat KEINE Client-Schreibpolicy (DENY-ALL).
//  - business_date wird aus started_at über businessDateOf() berechnet
//    (gleiche Definition wie SQL current_business_date(), Europe/Berlin,
//    3-Uhr-Cutoff).
//  - Geschäftsregeln werden in time-rules.ts (reine Funktionen) geprüft,
//    VOR dem Schreiben.
//  - location_id wird automatisch gesetzt, wenn der Mitarbeiter genau EINER
//    Standort-Zuordnung hat; sonst NULL.
//  - source = 'clock' für UI-Stempelungen; 'manual' bleibt für B2b
//    (Manager-Korrekturen) reserviert.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { businessDateOf } from "@/lib/business-date";
import { canClockIn, canClockOut, denialMessage } from "./time-rules";
import { writeAuditLog } from "@/lib/admin/audit";
import { arbzgMinimumBreak, isArbzgShort, grossMinutesBetween } from "./break-rules";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

type Caller = {
  userId: string;
  staffId: string;
  organizationId: string;
  isActive: boolean;
};

async function loadStaffCaller(
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<Caller> {
  const { data: link, error: linkErr } = await supabase
    .from("user_links")
    .select("staff_id, organization_id")
    .eq("user_id", userId)
    .maybeSingle();
  if (linkErr || !link) {
    throw new Error("Kein Mitarbeiter-Profil verknüpft.");
  }
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: staff, error: staffErr } = await supabaseAdmin
    .from("staff")
    .select("is_active")
    .eq("id", link.staff_id)
    .eq("organization_id", link.organization_id)
    .maybeSingle();
  if (staffErr || !staff) throw new Error("Mitarbeiter nicht gefunden.");
  return {
    userId,
    staffId: link.staff_id,
    organizationId: link.organization_id,
    isActive: staff.is_active,
  };
}

async function loadOpenEntry(
  staffId: string,
): Promise<{ id: string; startedAt: Date } | null> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("time_entries")
    .select("id, started_at")
    .eq("staff_id", staffId)
    .is("ended_at", null)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return { id: data.id, startedAt: new Date(data.started_at) };
}

async function resolveDefaultLocation(
  staffId: string,
  organizationId: string,
): Promise<string | null> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("staff_locations")
    .select("location_id")
    .eq("staff_id", staffId)
    .eq("organization_id", organizationId);
  if (error) throw error;
  if (!data || data.length !== 1) return null;
  return data[0].location_id;
}

// =========================================================================
// Lesen
// =========================================================================

export const getMyOpenEntry = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const caller = await loadStaffCaller(context.supabase, context.userId);
    const open = await loadOpenEntry(caller.staffId);
    if (!open) return null;
    return { id: open.id, startedAt: open.startedAt.toISOString() };
  });

export const listMyEntries = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ limit: z.number().int().min(1).max(200).optional() }).parse(input ?? {}),
  )
  .handler(async ({ data, context }) => {
    const caller = await loadStaffCaller(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows, error } = await supabaseAdmin
      .from("time_entries")
      .select("id, started_at, ended_at, business_date, source, location_id")
      .eq("staff_id", caller.staffId)
      .order("started_at", { ascending: false })
      .limit(data.limit ?? 50);
    if (error) throw error;
    return (rows ?? []).map((r) => ({
      id: r.id,
      startedAt: r.started_at,
      endedAt: r.ended_at,
      businessDate: r.business_date,
      source: r.source,
      locationId: r.location_id,
    }));
  });

// =========================================================================
// Schreiben (Stempeln)
// =========================================================================

export const clockIn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const caller = await loadStaffCaller(context.supabase, context.userId);
    const open = await loadOpenEntry(caller.staffId);
    const decision = canClockIn({ staffIsActive: caller.isActive, openEntry: open });
    if (!decision.ok) throw new Error(denialMessage(decision.reason));

    const now = new Date();
    const locationId = await resolveDefaultLocation(caller.staffId, caller.organizationId);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: created, error } = await supabaseAdmin
      .from("time_entries")
      .insert({
        organization_id: caller.organizationId,
        staff_id: caller.staffId,
        location_id: locationId,
        started_at: now.toISOString(),
        business_date: businessDateOf(now),
        source: "clock",
      })
      .select("id, started_at")
      .single();
    if (error) throw error;

    await writeAuditLog({
      organizationId: caller.organizationId,
      actorUserId: caller.userId,
      actorStaffId: caller.staffId,
      action: "time_entry.clock_in",
      entity: "time_entry",
      entityId: created.id,
      meta: { source: "clock", locationId },
    });

    return { id: created.id, startedAt: created.started_at };
  });

export const clockOut = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ breakMinutes: z.number().int().min(0).max(479) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const caller = await loadStaffCaller(context.supabase, context.userId);
    const open = await loadOpenEntry(caller.staffId);
    const now = new Date();
    const decision = canClockOut({ openEntry: open, now });
    if (!decision.ok) throw new Error(denialMessage(decision.reason));

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: updated, error } = await supabaseAdmin
      .from("time_entries")
      .update({ ended_at: now.toISOString(), break_minutes: data.breakMinutes })
      .eq("id", open!.id)
      .eq("staff_id", caller.staffId)
      .is("ended_at", null)
      .select("id, started_at, ended_at")
      .single();
    if (error) throw error;

    const gross = grossMinutesBetween(new Date(updated.started_at), now);
    const arbzgShort = isArbzgShort(gross, data.breakMinutes);

    await writeAuditLog({
      organizationId: caller.organizationId,
      actorUserId: caller.userId,
      actorStaffId: caller.staffId,
      action: "time_entry.clock_out",
      entity: "time_entry",
      entityId: updated.id,
      meta: {
        source: "clock",
        breakMinutes: data.breakMinutes,
        grossMinutes: gross,
        arbzgRecommended: arbzgMinimumBreak(gross),
        arbzgShort,
      },
    });

    return {
      id: updated.id,
      startedAt: updated.started_at,
      endedAt: updated.ended_at,
    };
  });