// D1 — Dienstplan (Vorausplanung). Nur Lese-Functions in diesem Schritt.
// Schreiben kommt in D2; RLS auf roster_shifts ist SELECT-only für authenticated.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { loadAdminCaller } from "@/lib/admin/admin-context";

const READ_ROLES = ["manager", "admin", "payroll", "staff"] as const;

export type RosterShift = {
  id: string;
  staffId: string;
  staffName: string;
  locationId: string;
  shiftDate: string;
  area: "kitchen" | "service" | "gl";
  skillId: string | null;
  skillName: string | null;
  skillColor: string | null;
  status: "planned" | "confirmed";
  notes: string | null;
};

export type RosterSkill = {
  id: string;
  name: string;
  color: string | null;
  category: "kitchen" | "service" | "gl" | "other";
  sortOrder: number;
};

export type RosterStaffRow = {
  staffId: string;
  displayName: string;
  department: "kitchen" | "service" | "gl";
  skillIds: string[];
};

export const getRosterShifts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        locationId: z.string().uuid(),
        fromDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        toDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<RosterShift[]> => {
    const caller = await loadAdminCaller(context.supabase, context.userId, READ_ROLES);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows, error } = await supabaseAdmin
      .from("roster_shifts")
      .select(
        "id, staff_id, location_id, shift_date, area, skill_id, status, notes, staff(display_name), skills(name, color)",
      )
      .eq("organization_id", caller.organizationId)
      .eq("location_id", data.locationId)
      .gte("shift_date", data.fromDate)
      .lte("shift_date", data.toDate);
    if (error) throw error;
    return (rows ?? []).map((r) => ({
      id: r.id as string,
      staffId: r.staff_id as string,
      staffName: (r.staff as { display_name: string } | null)?.display_name ?? "—",
      locationId: r.location_id as string,
      shiftDate: r.shift_date as string,
      area: r.area as "kitchen" | "service" | "gl",
      skillId: (r.skill_id as string | null) ?? null,
      skillName: (r.skills as { name: string } | null)?.name ?? null,
      skillColor: (r.skills as { color: string | null } | null)?.color ?? null,
      status: r.status as "planned" | "confirmed",
      notes: (r.notes as string | null) ?? null,
    }));
  });

export const listSkills = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<RosterSkill[]> => {
    const caller = await loadAdminCaller(context.supabase, context.userId, READ_ROLES);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("skills")
      .select("id, name, color, category, sort_order")
      .eq("organization_id", caller.organizationId)
      .order("sort_order", { ascending: true });
    if (error) throw error;
    return (data ?? []).map((s) => ({
      id: s.id as string,
      name: s.name as string,
      color: (s.color as string | null) ?? null,
      category: s.category as RosterSkill["category"],
      sortOrder: s.sort_order as number,
    }));
  });

export const getStaffForRoster = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ locationId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }): Promise<RosterStaffRow[]> => {
    const caller = await loadAdminCaller(context.supabase, context.userId, READ_ROLES);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows, error } = await supabaseAdmin
      .from("staff_locations")
      .select("staff_id, department, staff(id, display_name, is_active)")
      .eq("organization_id", caller.organizationId)
      .eq("location_id", data.locationId);
    if (error) throw error;

    const staffIds = Array.from(
      new Set(
        (rows ?? [])
          .map((r) => r.staff_id as string)
          .filter((id) => {
            const s = (rows ?? []).find((x) => x.staff_id === id)?.staff as {
              is_active: boolean;
            } | null;
            return s?.is_active !== false;
          }),
      ),
    );

    const { data: skillsRows, error: sErr } = await supabaseAdmin
      .from("staff_skills")
      .select("staff_id, skill_id")
      .eq("organization_id", caller.organizationId)
      .in("staff_id", staffIds.length > 0 ? staffIds : ["00000000-0000-0000-0000-000000000000"]);
    if (sErr) throw sErr;
    const skillsByStaff = new Map<string, string[]>();
    for (const sr of skillsRows ?? []) {
      const k = sr.staff_id as string;
      const arr = skillsByStaff.get(k) ?? [];
      arr.push(sr.skill_id as string);
      skillsByStaff.set(k, arr);
    }

    return (rows ?? [])
      .filter((r) => {
        const s = r.staff as { is_active: boolean } | null;
        return s?.is_active !== false;
      })
      .map((r) => ({
        staffId: r.staff_id as string,
        displayName: (r.staff as { display_name: string } | null)?.display_name ?? "—",
        department: r.department as "kitchen" | "service" | "gl",
        skillIds: skillsByStaff.get(r.staff_id as string) ?? [],
      }))
      .sort((a, b) => {
        const order = { kitchen: 0, service: 1, gl: 2 } as const;
        if (order[a.department] !== order[b.department]) {
          return order[a.department] - order[b.department];
        }
        return a.displayName.localeCompare(b.displayName, "de");
      });
  });
