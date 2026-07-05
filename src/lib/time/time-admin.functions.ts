// B2b — Manager-Korrektur-Server-Functions für time_entries + Admin-Wasserlinie.
//
// Architektur:
//   * Alle Schreibvorgänge laufen via supabaseAdmin (RLS auf time_entries ist DENY-ALL).
//   * runGuarded prüft Rolle VOR der Operation; audit_log NUR bei Erfolg.
//   * G2-Sperrlogik via assertBusinessDateUnlocked: business_date ≤ Wasserlinie
//     blockiert ALLE Rollen (auch Manager) → KEIN audit_log-Eintrag (Gate d).
//   * source bleibt erhalten, wenn vorher 'clock' (kein stilles Umflaggen).
//   * manual_delete schreibt vollständigen Zeilen-Snapshot in audit_log.meta
//     (Gate e — Rekonstruierbarkeit aus append-only log).

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { loadAdminCaller } from "@/lib/admin/admin-context";
import { runWithPermission } from "@/lib/admin/admin-call";
import { makeAuditWriter } from "@/lib/admin/audit";
import { businessDateOf } from "@/lib/business-date";
import { assertBusinessDateUnlocked } from "./time-lock";
import { timeEntryToSfnRow } from "@/lib/lohn/time-entry-sfn";
import { formatAbsenceNote } from "./absence-note";
import type { SfnShiftRow } from "@/lib/lohn/sfn-geld/types";
import { computeStaffSfn } from "@/lib/lohn/compute-staff-sfn";
import { primaryDepartment, type Department } from "./primary-department";

// Reduziert staff_locations-Zeilen (eine pro Zuordnung) auf eine deterministische
// Primär-Abteilung je staff_id (Priorität kitchen > service > gl). Wird von
// getTimeOverview UND getWeeklyTimeEntries genutzt — keine Last-write-wins-Falle.
function buildPrimaryDeptMap(
  rows: ReadonlyArray<{ staff_id: string; department: string }>,
): Map<string, Department> {
  const byStaff = new Map<string, Department[]>();
  for (const r of rows) {
    const dept = r.department as Department;
    const arr = byStaff.get(r.staff_id) ?? [];
    arr.push(dept);
    byStaff.set(r.staff_id, arr);
  }
  const out = new Map<string, Department>();
  for (const [staffId, depts] of byStaff) {
    out.set(staffId, primaryDepartment(depts));
  }
  return out;
}

// Z3 — Alle Abteilungs-Zuordnungen je Mitarbeiter (für die
// Zeilen-Attribution im Wochenplan-Grid).
function buildStaffDeptsMap(
  rows: ReadonlyArray<{ staff_id: string; department: string }>,
): Map<string, Department[]> {
  const byStaff = new Map<string, Department[]>();
  for (const r of rows) {
    const dept = r.department as Department;
    const arr = byStaff.get(r.staff_id) ?? [];
    if (!arr.includes(dept)) arr.push(dept);
    byStaff.set(r.staff_id, arr);
  }
  return byStaff;
}

// Z3 — Prüft, ob eine Abteilung der Person am Standort zugeordnet ist.
// Wird server-seitig VOR Insert/Update aufgerufen (Client nicht vertrauen).
async function assertStaffDeptAssignment(
  supabaseAdmin: {
    from: (t: "staff_locations") => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      select: (s: string) => any;
    };
  },
  organizationId: string,
  staffId: string,
  locationId: string,
  department: Department,
): Promise<void> {
  const { data, error } = await supabaseAdmin
    .from("staff_locations")
    .select("staff_id")
    .eq("organization_id", organizationId)
    .eq("staff_id", staffId)
    .eq("location_id", locationId)
    .eq("department", department)
    .maybeSingle();
  if (error) throw error;
  if (!data) {
    throw new Error(`Abteilung „${department}" ist der Person am Standort nicht zugeordnet.`);
  }
}

// =========================================================================
// B6 — Arbeitszeitübersicht (Zusammenfassung + Buchhaltung)
// =========================================================================

export const getTimeOverview = createServerFn({ method: "GET" })
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
  .handler(async ({ data, context }) => {
    const caller = await loadAdminCaller(context.supabase, context.userId, [
      "manager",
      "admin",
      "payroll",
    ]);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: rows, error } = await supabaseAdmin
      .from("time_entries")
      .select("staff_id, business_date, started_at, ended_at, source, staff(display_name)")
      .eq("organization_id", caller.organizationId)
      .eq("location_id", data.locationId)
      .gte("business_date", data.fromDate)
      .lte("business_date", data.toDate)
      .not("ended_at", "is", null)
      .order("business_date", { ascending: true });
    if (error) throw error;

    const { data: deptRows, error: deptErr } = await supabaseAdmin
      .from("staff_locations")
      .select("staff_id, department")
      .eq("organization_id", caller.organizationId)
      .eq("location_id", data.locationId);
    if (deptErr) throw deptErr;
    const deptByStaff = buildPrimaryDeptMap(deptRows ?? []);

    const entries = (rows ?? []).map((r) => {
      const started = new Date(r.started_at).getTime();
      const ended = new Date(r.ended_at as string).getTime();
      const hoursWorked = Math.max(0, (ended - started) / 3_600_000);
      return {
        staffId: r.staff_id,
        displayName: (r.staff as { display_name: string } | null)?.display_name ?? "—",
        department: deptByStaff.get(r.staff_id) ?? ("service" as const),
        businessDate: r.business_date as string,
        hoursWorked,
        source: r.source as string,
      };
    });
    return { entries };
  });

// SFN-Zuschlagsberechnung pro Mitarbeiter für Standort × Zeitraum.
// Reines Read-Only — verwendet `timeEntryToSfnRow` + `berechneSfnGeld` (simple-Modus,
// wie tagesabrechnung-Original). hourlyRateCents = jüngste staff_compensation
// mit valid_from ≤ toDate.
export const getSfnOverview = createServerFn({ method: "GET" })
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
  .handler(async ({ data, context }) => {
    const caller = await loadAdminCaller(context.supabase, context.userId, [
      "manager",
      "admin",
      "payroll",
    ]);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: rows, error } = await supabaseAdmin
      .from("time_entries")
      .select("staff_id, business_date, started_at, ended_at, break_minutes")
      .eq("organization_id", caller.organizationId)
      .eq("location_id", data.locationId)
      .gte("business_date", data.fromDate)
      .lte("business_date", data.toDate)
      .not("ended_at", "is", null);
    if (error) throw error;

    const { data: comps, error: compErr } = await supabaseAdmin
      .from("staff_compensation")
      .select("staff_id, hourly_rate, valid_from")
      .eq("organization_id", caller.organizationId)
      .lte("valid_from", data.toDate)
      .order("valid_from", { ascending: false });
    if (compErr) throw compErr;
    const rateByStaff = new Map<string, number>();
    for (const c of comps ?? []) {
      if (!rateByStaff.has(c.staff_id)) {
        rateByStaff.set(c.staff_id, Math.round(Number(c.hourly_rate ?? 0) * 100));
      }
    }

    const rowsByStaff = new Map<string, SfnShiftRow[]>();
    for (const r of rows ?? []) {
      const sfnRow = timeEntryToSfnRow({
        startedAt: r.started_at as string,
        endedAt: r.ended_at as string,
        businessDate: r.business_date as string,
        breakMinutes: Number(r.break_minutes ?? 0),
      });
      const arr = rowsByStaff.get(r.staff_id) ?? [];
      arr.push(sfnRow);
      rowsByStaff.set(r.staff_id, arr);
    }

    const sfn = Array.from(rowsByStaff.entries()).map(([staffId, sfnRows]) => {
      const rate = rateByStaff.get(staffId) ?? 0;
      const { simple, extended, zuschlagCents } = computeStaffSfn(sfnRows, rate);
      return {
        staffId,
        hourlyRateCents: rate,
        zuschlagCents,
        simple: {
          night25Hours: simple.night25Hours,
          night40Hours: simple.night40Hours,
          sundayHours: simple.sundayHours,
        },
        extended: {
          night25Hours: extended.night25Hours,
          night40Hours: extended.night40Hours,
          sundayHours: extended.sundayHours,
          holidayHours: extended.holidayHours,
          holiday150Hours: extended.holiday150Hours,
        },
      };
    });
    return { sfn };
  });

export const listPayrollNotes = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        locationId: z.string().uuid(),
        periodStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        periodEnd: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const caller = await loadAdminCaller(context.supabase, context.userId, [
      "manager",
      "admin",
      "payroll",
    ]);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows, error } = await supabaseAdmin
      .from("payroll_notes")
      .select("staff_id, vorschuss, besonderheiten")
      .eq("organization_id", caller.organizationId)
      .eq("location_id", data.locationId)
      .eq("period_start", data.periodStart)
      .eq("period_end", data.periodEnd);
    if (error) throw error;
    return (rows ?? []).map((r) => ({
      staffId: r.staff_id,
      vorschuss: Number(r.vorschuss ?? 0),
      besonderheiten: r.besonderheiten ?? "",
    }));
  });

// Vorschuss-Summen pro Mitarbeiter aus Tagesabrechnung (session_advances)
// für einen Standort × Zeitraum (business_date inkl.).
export const listAdvancesByStaff = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        periodStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        periodEnd: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const caller = await loadAdminCaller(context.supabase, context.userId, [
      "manager",
      "admin",
      "payroll",
    ]);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows, error } = await supabaseAdmin
      .from("session_advances")
      .select("staff_id, amount_cents, sessions!inner(business_date)")
      .eq("organization_id", caller.organizationId)
      .gte("sessions.business_date", data.periodStart)
      .lte("sessions.business_date", data.periodEnd);
    if (error) throw error;
    const sums = new Map<string, number>();
    for (const r of rows ?? []) {
      sums.set(r.staff_id, (sums.get(r.staff_id) ?? 0) + Number(r.amount_cents ?? 0));
    }
    return Array.from(sums.entries()).map(([staffId, totalCents]) => ({ staffId, totalCents }));
  });

// Urlaubs- und Kranktage pro Mitarbeiter aus Dienstplan (roster_absence)
// für einen Zeitraum (inkl.).
export const listAbsencesByStaff = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        periodStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        periodEnd: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const caller = await loadAdminCaller(context.supabase, context.userId, [
      "manager",
      "admin",
      "payroll",
    ]);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows, error } = await supabaseAdmin
      .from("roster_absence")
      .select("staff_id, date, type")
      .eq("organization_id", caller.organizationId)
      .gte("date", data.periodStart)
      .lte("date", data.periodEnd);
    if (error) throw error;
    type Entry = {
      krankDays: number;
      urlaubDays: number;
      items: Array<{ date: string; type: "urlaub" | "krank" }>;
    };
    const map = new Map<string, Entry>();
    for (const r of rows ?? []) {
      const entry = map.get(r.staff_id) ?? { krankDays: 0, urlaubDays: 0, items: [] };
      if (r.type === "krank") {
        entry.krankDays += 1;
        entry.items.push({ date: r.date, type: "krank" });
      } else if (r.type === "urlaub") {
        entry.urlaubDays += 1;
        entry.items.push({ date: r.date, type: "urlaub" });
      }
      map.set(r.staff_id, entry);
    }
    return Array.from(map.entries()).map(([staffId, v]) => ({
      staffId,
      krankDays: v.krankDays,
      urlaubDays: v.urlaubDays,
      absenceNote: formatAbsenceNote(v.items, data.periodStart, data.periodEnd),
    }));
  });

export const upsertPayrollNote = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        locationId: z.string().uuid(),
        staffId: z.string().uuid(),
        periodStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        periodEnd: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        vorschuss: z.number().min(0).max(100000),
        besonderheiten: z.string().max(2000).nullable(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const caller = await loadAdminCaller(context.supabase, context.userId, "manager");
    return runWithPermission(
      context.supabase,
      "time.payroll_note.edit",
      data.locationId,
      makeAuditWriter(caller),
      async () => {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { error } = await supabaseAdmin.from("payroll_notes").upsert(
          {
            organization_id: caller.organizationId,
            staff_id: data.staffId,
            location_id: data.locationId,
            period_start: data.periodStart,
            period_end: data.periodEnd,
            vorschuss: data.vorschuss,
            besonderheiten: data.besonderheiten,
          },
          { onConflict: "staff_id,location_id,period_start,period_end" },
        );
        if (error) throw error;
        return {
          result: { ok: true as const },
          audit: {
            action: "payroll_note.upsert",
            entity: "payroll_note",
            meta: {
              staffId: data.staffId,
              locationId: data.locationId,
              periodStart: data.periodStart,
              periodEnd: data.periodEnd,
              vorschuss: data.vorschuss,
              besonderheiten: data.besonderheiten,
            },
          },
        };
      },
    );
  });

// =========================================================================
// B6b — Wochenplan (Wochen-Ansicht für genau eine ISO-Woche)
// =========================================================================

export const getWeeklyTimeEntries = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        locationId: z.string().uuid(),
        weekStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const caller = await loadAdminCaller(context.supabase, context.userId, [
      "manager",
      "admin",
      "payroll",
    ]);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // weekEnd = weekStart + 6 Tage (Sonntag)
    const start = new Date(`${data.weekStart}T12:00:00Z`);
    const end = new Date(start);
    end.setUTCDate(end.getUTCDate() + 6);
    const weekEnd = end.toISOString().slice(0, 10);

    // 1. Einträge am Zielstandort.
    const { data: rows, error } = await supabaseAdmin
      .from("time_entries")
      .select(
        "id, staff_id, started_at, ended_at, business_date, location_id, department, staff(display_name)",
      )
      .eq("organization_id", caller.organizationId)
      .eq("location_id", data.locationId)
      .gte("business_date", data.weekStart)
      .lte("business_date", weekEnd)
      .not("ended_at", "is", null)
      .order("started_at", { ascending: true });
    if (error) throw error;

    // 2. Einträge an ANDEREN Standorten in derselben Woche (gesamte Org).
    const { data: crossRows, error: crossErr } = await supabaseAdmin
      .from("time_entries")
      .select("staff_id, business_date, location_id")
      .eq("organization_id", caller.organizationId)
      .neq("location_id", data.locationId)
      .gte("business_date", data.weekStart)
      .lte("business_date", weekEnd)
      .not("ended_at", "is", null);
    if (crossErr) throw crossErr;

    // 3. Abteilungen für diesen Standort.
    const { data: deptRows, error: deptErr } = await supabaseAdmin
      .from("staff_locations")
      .select("staff_id, department, staff(display_name, is_active)")
      .eq("organization_id", caller.organizationId)
      .eq("location_id", data.locationId);
    if (deptErr) throw deptErr;
    // Primär-Abteilung je Mitarbeiter (Priorität kitchen > service > gl) —
    // entries.department wird darauf gemappt, damit alle Stunden einer
    // Person deterministisch auf EINER Zeile auflaufen (time_entries hat
    // keine Abteilungs-Dimension).
    const deptByStaff = buildPrimaryDeptMap(deptRows ?? []);
    const staffDeptsByStaff = buildStaffDeptsMap(deptRows ?? []);

    // Z4 — Skill-IDs pro Mitarbeiter (Wochenplan-Filter im Client).
    const staffIds = Array.from(new Set((deptRows ?? []).map((d) => d.staff_id as string)));
    const skillsByStaff = new Map<string, string[]>();
    if (staffIds.length > 0) {
      const { data: skillRows, error: skillErr } = await supabaseAdmin
        .from("staff_skills")
        .select("staff_id, skill_id")
        .eq("organization_id", caller.organizationId)
        .in("staff_id", staffIds);
      if (skillErr) throw skillErr;
      for (const r of skillRows ?? []) {
        const sid = r.staff_id as string;
        const arr = skillsByStaff.get(sid) ?? [];
        arr.push(r.skill_id as string);
        skillsByStaff.set(sid, arr);
      }
    }

    // Z2: Alle dem Standort zugeordneten (aktiven) Mitarbeiter — EINE Zeile
    // pro Zuordnung, damit Mehrfach-Zuordnungen (z. B. kitchen + gl) im
    // Wochenplan-Grid in JEDER Sektion erscheinen. isPrimary markiert die
    // Zeile, auf der die tatsächlichen Stunden aufsummiert werden.
    const assignedStaff = (deptRows ?? [])
      .map((d) => {
        const s = d.staff as { display_name: string; is_active: boolean } | null;
        const dept = d.department as Department;
        const staffId = d.staff_id as string;
        return {
          staffId,
          displayName: s?.display_name ?? "—",
          department: dept,
          isActive: s?.is_active ?? true,
          isPrimary: deptByStaff.get(staffId) === dept,
          // Z3: alle Abteilungen der Person am Standort — Client attribuiert
          // damit Einträge über entryRowDepartment auf die richtige Zeile.
          staffDepts: staffDeptsByStaff.get(staffId) ?? [],
          // Z4: Skill-IDs der Person (für den Wochenplan-Skill-Filter).
          skillIds: skillsByStaff.get(staffId) ?? [],
        };
      })
      .filter((s) => s.isActive);

    const crossLocationDates: Record<string, string[]> = {};
    for (const c of crossRows ?? []) {
      const key = c.staff_id as string;
      const date = c.business_date as string;
      const arr = crossLocationDates[key] ?? [];
      if (!arr.includes(date)) arr.push(date);
      crossLocationDates[key] = arr;
    }

    return {
      weekStart: data.weekStart,
      weekEnd,
      entries: (rows ?? []).map((r) => ({
        id: r.id as string,
        staffId: r.staff_id as string,
        displayName: (r.staff as { display_name: string } | null)?.display_name ?? "—",
        // Z3: Primär-Abteilung als Fallback für Grid-Kompatibilität; das Grid
        // nutzt entryRowDepartment(rawDepartment, staffDepts) für die
        // eigentliche Zeilen-Attribution.
        department: deptByStaff.get(r.staff_id as string) ?? ("service" as const),
        rawDepartment: (r.department as Department | null) ?? null,
        businessDate: r.business_date as string,
        startedAt: r.started_at as string,
        endedAt: r.ended_at as string,
      })),
      crossLocationDates,
      assignedStaff,
    };
  });

// B6c — Inline-Edit/Create für Wochenplan (Admin)
// Schmaler Wrapper, der nur Start/Ende setzt und break_minutes erhält bzw. 0 setzt.

export const setTimeEntryShift = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        id: z.string().uuid(),
        startedAt: z.string().datetime(),
        endedAt: z.string().datetime(),
        // Z3 — optional: setzt/ändert die Abteilungs-Dimension des Eintrags.
        // undefined → unverändert lassen; null → auf NULL setzen; Enum-Wert
        // wird gegen staff_locations validiert (Person ∈ Abteilung am Standort).
        department: z.enum(["kitchen", "service", "gl"]).nullish(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const caller = await loadAdminCaller(context.supabase, context.userId, "manager");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // Standort des Eintrags für den Scope-Check vorladen.
    const { data: before, error: loadErr } = await supabaseAdmin
      .from("time_entries")
      .select("*")
      .eq("id", data.id)
      .eq("organization_id", caller.organizationId)
      .maybeSingle();
    if (loadErr) throw loadErr;
    if (!before) throw new Error("Eintrag nicht gefunden.");
    return runWithPermission(
      context.supabase,
      "time.entry.edit",
      before.location_id,
      makeAuditWriter(caller),
      async () => {
        if (new Date(data.endedAt).getTime() <= new Date(data.startedAt).getTime()) {
          throw new Error("Ende muss nach dem Beginn liegen.");
        }
        const newBusinessDate = businessDateOf(new Date(data.startedAt));
        await assertBusinessDateUnlocked(
          supabaseAdmin,
          caller.organizationId,
          before.business_date,
        );
        if (newBusinessDate !== before.business_date) {
          await assertBusinessDateUnlocked(supabaseAdmin, caller.organizationId, newBusinessDate);
        }
        // Z3: Abteilungs-Zuordnung serverseitig gegen staff_locations prüfen.
        if (data.department != null && before.location_id) {
          await assertStaffDeptAssignment(
            supabaseAdmin,
            caller.organizationId,
            before.staff_id,
            before.location_id,
            data.department,
          );
        }

        const patch: {
          started_at: string;
          ended_at: string;
          business_date: string;
          department?: Department | null;
        } = {
          started_at: data.startedAt,
          ended_at: data.endedAt,
          business_date: newBusinessDate,
        };
        if (data.department !== undefined) patch.department = data.department;

        const { error } = await supabaseAdmin
          .from("time_entries")
          .update(patch)
          .eq("id", data.id)
          .eq("organization_id", caller.organizationId);
        if (error) throw error;

        return {
          result: { ok: true as const },
          audit: {
            action: "time_entry.shift_update",
            entity: "time_entry",
            entityId: data.id,
            meta: {
              reason: "Wochenplan inline edit",
              before: {
                startedAt: before.started_at,
                endedAt: before.ended_at,
                businessDate: before.business_date,
                department: (before as { department: Department | null }).department ?? null,
              },
              after: {
                startedAt: data.startedAt,
                endedAt: data.endedAt,
                businessDate: newBusinessDate,
                department:
                  data.department !== undefined
                    ? (data.department ?? null)
                    : ((before as { department: Department | null }).department ?? null),
              },
            },
          },
        };
      },
    );
  });

export const createTimeEntryShift = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        staffId: z.string().uuid(),
        locationId: z.string().uuid(),
        startedAt: z.string().datetime(),
        endedAt: z.string().datetime(),
        department: z.enum(["kitchen", "service", "gl"]).nullish(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const caller = await loadAdminCaller(context.supabase, context.userId, "manager");
    return runWithPermission(
      context.supabase,
      "time.entry.edit",
      data.locationId,
      makeAuditWriter(caller),
      async () => {
        if (new Date(data.endedAt).getTime() <= new Date(data.startedAt).getTime()) {
          throw new Error("Ende muss nach dem Beginn liegen.");
        }
        const businessDate = businessDateOf(new Date(data.startedAt));
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        await assertBusinessDateUnlocked(supabaseAdmin, caller.organizationId, businessDate);

        const { data: staff, error: sErr } = await supabaseAdmin
          .from("staff")
          .select("id")
          .eq("id", data.staffId)
          .eq("organization_id", caller.organizationId)
          .maybeSingle();
        if (sErr) throw sErr;
        if (!staff) throw new Error("Mitarbeiter nicht in dieser Organisation.");

        // Z3: Falls Abteilung mitgegeben → gegen staff_locations validieren.
        if (data.department != null) {
          await assertStaffDeptAssignment(
            supabaseAdmin,
            caller.organizationId,
            data.staffId,
            data.locationId,
            data.department,
          );
        }

        const { data: created, error } = await supabaseAdmin
          .from("time_entries")
          .insert({
            organization_id: caller.organizationId,
            staff_id: data.staffId,
            location_id: data.locationId,
            started_at: data.startedAt,
            ended_at: data.endedAt,
            business_date: businessDate,
            break_minutes: 0,
            source: "manual",
            department: data.department ?? null,
          })
          .select("id")
          .single();
        if (error) throw error;

        return {
          result: { id: created.id },
          audit: {
            action: "time_entry.shift_create",
            entity: "time_entry",
            entityId: created.id,
            meta: {
              reason: "Wochenplan inline create",
              staffId: data.staffId,
              locationId: data.locationId,
              businessDate,
              startedAt: data.startedAt,
              endedAt: data.endedAt,
              department: data.department ?? null,
            },
          },
        };
      },
    );
  });

// =========================================================================
// B7 — Periodenverwaltung (26.–25.)
// =========================================================================

export const listPeriods = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const caller = await loadAdminCaller(context.supabase, context.userId, [
      "manager",
      "admin",
      "payroll",
      "planer",
    ]);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("periods")
      .select("id, label, start_date, end_date, status")
      .eq("organization_id", caller.organizationId)
      .order("start_date", { ascending: false });
    if (error) throw error;
    return (data ?? []).map((p) => ({
      id: p.id as string,
      label: p.label as string,
      startDate: p.start_date as string,
      endDate: p.end_date as string,
      status: p.status as "open" | "locked",
    }));
  });

export const createPeriod = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        label: z.string().trim().min(1).max(80),
        startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const caller = await loadAdminCaller(context.supabase, context.userId, "admin");
    return runWithPermission(
      context.supabase,
      "time.period.manage",
      null,
      makeAuditWriter(caller),
      async () => {
        if (data.endDate < data.startDate) {
          throw new Error("Enddatum muss ≥ Startdatum sein.");
        }
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        // Overlap-Check
        const { data: overlap, error: oErr } = await supabaseAdmin
          .from("periods")
          .select("id, label, start_date, end_date")
          .eq("organization_id", caller.organizationId)
          .lte("start_date", data.endDate)
          .gte("end_date", data.startDate)
          .limit(1);
        if (oErr) throw oErr;
        if (overlap && overlap.length > 0) {
          throw new Error(
            `Überschneidet sich mit „${overlap[0].label}" (${overlap[0].start_date}–${overlap[0].end_date}).`,
          );
        }
        const { data: created, error } = await supabaseAdmin
          .from("periods")
          .insert({
            organization_id: caller.organizationId,
            label: data.label,
            start_date: data.startDate,
            end_date: data.endDate,
          })
          .select("id")
          .single();
        if (error) throw error;
        return {
          result: { id: created.id as string },
          audit: {
            action: "period.create",
            entity: "period",
            entityId: created.id as string,
            meta: { label: data.label, startDate: data.startDate, endDate: data.endDate },
          },
        };
      },
    );
  });

export const togglePeriodLock = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const caller = await loadAdminCaller(context.supabase, context.userId, "admin");
    return runWithPermission(
      context.supabase,
      "time.period.lock",
      null,
      makeAuditWriter(caller),
      async () => {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: row, error: loadErr } = await supabaseAdmin
          .from("periods")
          .select("id, status, label")
          .eq("id", data.id)
          .eq("organization_id", caller.organizationId)
          .maybeSingle();
        if (loadErr) throw loadErr;
        if (!row) throw new Error("Periode nicht gefunden.");
        const next = row.status === "locked" ? "open" : "locked";
        const { error } = await supabaseAdmin
          .from("periods")
          .update({ status: next })
          .eq("id", data.id)
          .eq("organization_id", caller.organizationId);
        if (error) throw error;
        return {
          result: { id: data.id, status: next as "open" | "locked" },
          audit: {
            action: next === "locked" ? "period.lock" : "period.unlock",
            entity: "period",
            entityId: data.id,
            meta: { label: row.label, before: row.status, after: next },
          },
        };
      },
    );
  });

export const deletePeriod = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const caller = await loadAdminCaller(context.supabase, context.userId, "admin");
    return runWithPermission(
      context.supabase,
      "time.period.manage",
      null,
      makeAuditWriter(caller),
      async () => {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: row, error: loadErr } = await supabaseAdmin
          .from("periods")
          .select("id, status, label, start_date, end_date")
          .eq("id", data.id)
          .eq("organization_id", caller.organizationId)
          .maybeSingle();
        if (loadErr) throw loadErr;
        if (!row) throw new Error("Periode nicht gefunden.");
        if (row.status !== "open") {
          throw new Error("Nur offene Perioden können gelöscht werden.");
        }
        const { error } = await supabaseAdmin
          .from("periods")
          .delete()
          .eq("id", data.id)
          .eq("organization_id", caller.organizationId);
        if (error) throw error;
        return {
          result: { ok: true as const },
          audit: {
            action: "period.delete",
            entity: "period",
            entityId: data.id,
            meta: {
              label: row.label,
              startDate: row.start_date,
              endDate: row.end_date,
            },
          },
        };
      },
    );
  });
