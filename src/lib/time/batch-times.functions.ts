// BZ1 — Server-Functions für das Batch-Werkzeug „Schichtzeiten anpassen".
//
// Admin-only (loadAdminCaller + runGuarded). Ein Audit-Eintrag pro Lauf
// (Aggregat) + optionale Chunks mit den Vorher-Bildern (meta.changes,
// ~200 Einträge/Chunk, gemeinsame meta.runId), sodass jede überschriebene
// Schicht aus dem append-only Log rekonstruierbar ist.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { loadAdminCaller } from "@/lib/admin/admin-context";
import { runGuarded } from "@/lib/admin/admin-call";
import { makeAuditWriter, writeAuditLog } from "@/lib/admin/audit";
import { loadTimeLock, isLocked as isBusinessDateLocked } from "./time-lock";
import {
  batchTimestamps,
  resolveBatchDay,
  standardTimesFor,
  type BatchSettings,
  type BatchSkipReason,
} from "./batch-times";

const HHMM = /^([01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/;

function toHm(s: string): string {
  // Postgres liefert time ggf. als "HH:MM:SS" — auf "HH:MM" kürzen.
  return s.slice(0, 5);
}

// -------------------------------------------------------------------------
// Batch-Standardzeiten lesen (manager+, für UI-Anzeige)
// -------------------------------------------------------------------------

export const getBatchTimeSettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<BatchSettings> => {
    const caller = await loadAdminCaller(context.supabase, context.userId, [
      "manager",
      "admin",
      "payroll",
    ]);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("organization_settings")
      .select("batch_weekday_start, batch_weekday_end, batch_sunhol_start, batch_sunhol_end")
      .eq("organization_id", caller.organizationId)
      .maybeSingle();
    if (error) throw error;
    return {
      weekdayStart: toHm(data?.batch_weekday_start ?? "17:00"),
      weekdayEnd: toHm(data?.batch_weekday_end ?? "01:00"),
      sunholStart: toHm(data?.batch_sunhol_start ?? "15:00"),
      sunholEnd: toHm(data?.batch_sunhol_end ?? "02:00"),
    };
  });

// -------------------------------------------------------------------------
// Batch-Standardzeiten aktualisieren (admin-only)
// -------------------------------------------------------------------------

export const updateBatchTimeSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        weekdayStart: z.string().regex(HHMM),
        weekdayEnd: z.string().regex(HHMM),
        sunholStart: z.string().regex(HHMM),
        sunholEnd: z.string().regex(HHMM),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const caller = await loadAdminCaller(context.supabase, context.userId, "admin");
    return runGuarded(caller.role, "admin", makeAuditWriter(caller), async () => {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { error } = await supabaseAdmin
        .from("organization_settings")
        .update({
          batch_weekday_start: data.weekdayStart,
          batch_weekday_end: data.weekdayEnd,
          batch_sunhol_start: data.sunholStart,
          batch_sunhol_end: data.sunholEnd,
        })
        .eq("organization_id", caller.organizationId);
      if (error) throw error;
      return {
        result: { ok: true as const },
        audit: {
          action: "org_settings.batch_times_update",
          entity: "organization_settings",
          entityId: caller.organizationId,
          meta: data as unknown as Record<string, unknown>,
        },
      };
    });
  });

// -------------------------------------------------------------------------
// Batch-Lauf (admin-only)
// -------------------------------------------------------------------------

type SkipCounts = Record<BatchSkipReason, number>;

type ChangeRecord = {
  entryId: string;
  staffId: string;
  businessDate: string;
  before: { startedAt: string; endedAt: string | null; breakMinutes: number };
};

function iterateDates(fromIso: string, toIso: string): string[] {
  const out: string[] = [];
  const start = new Date(`${fromIso}T12:00:00Z`);
  const end = new Date(`${toIso}T12:00:00Z`);
  for (
    let cur = new Date(start);
    cur.getTime() <= end.getTime();
    cur.setUTCDate(cur.getUTCDate() + 1)
  ) {
    out.push(cur.toISOString().slice(0, 10));
  }
  return out;
}

export const runBatchTimes = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        locationId: z.string().uuid(),
        periodStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        periodEnd: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        mode: z.enum(["override", "create_weekdays", "create_daily"]),
        staffIds: z.array(z.string().uuid()).min(1).max(500),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const caller = await loadAdminCaller(context.supabase, context.userId, "admin");
    return runGuarded(caller.role, "admin", makeAuditWriter(caller), async () => {
      if (data.periodEnd < data.periodStart) {
        throw new Error("Enddatum muss ≥ Startdatum sein.");
      }
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

      // 1. Standardzeiten aus Settings.
      const { data: settingsRow, error: settingsErr } = await supabaseAdmin
        .from("organization_settings")
        .select("batch_weekday_start, batch_weekday_end, batch_sunhol_start, batch_sunhol_end")
        .eq("organization_id", caller.organizationId)
        .maybeSingle();
      if (settingsErr) throw settingsErr;
      const settings: BatchSettings = {
        weekdayStart: toHm(settingsRow?.batch_weekday_start ?? "17:00"),
        weekdayEnd: toHm(settingsRow?.batch_weekday_end ?? "01:00"),
        sunholStart: toHm(settingsRow?.batch_sunhol_start ?? "15:00"),
        sunholEnd: toHm(settingsRow?.batch_sunhol_end ?? "02:00"),
      };

      // 2. Wasserlinie.
      const lockThrough = await loadTimeLock(supabaseAdmin, caller.organizationId);

      // 3. roster_absence im Zeitraum für die Mitarbeiter.
      const { data: absences, error: absErr } = await supabaseAdmin
        .from("roster_absence")
        .select("staff_id, date")
        .eq("organization_id", caller.organizationId)
        .in("staff_id", data.staffIds)
        .gte("date", data.periodStart)
        .lte("date", data.periodEnd);
      if (absErr) throw absErr;
      const absenceSet = new Set<string>();
      for (const a of absences ?? []) absenceSet.add(`${a.staff_id}|${a.date}`);

      // 4. time_entries im Zeitraum (alle Standorte der Org, damit wir
      //    `otherLocationEntry` kennen).
      const { data: entries, error: entriesErr } = await supabaseAdmin
        .from("time_entries")
        .select("id, staff_id, business_date, location_id, started_at, ended_at, break_minutes")
        .eq("organization_id", caller.organizationId)
        .in("staff_id", data.staffIds)
        .gte("business_date", data.periodStart)
        .lte("business_date", data.periodEnd);
      if (entriesErr) throw entriesErr;

      type EntryRow = {
        id: string;
        staff_id: string;
        business_date: string;
        location_id: string;
        started_at: string;
        ended_at: string | null;
        break_minutes: number | null;
      };
      const own = new Map<string, EntryRow>();
      const otherByKey = new Set<string>();
      for (const e of (entries ?? []) as EntryRow[]) {
        const key = `${e.staff_id}|${e.business_date}`;
        if (e.location_id === data.locationId) {
          // Bei mehreren eigenen Einträgen am selben Tag: den ERSTEN nehmen
          // (Update-Ziel); die anderen bleiben unangetastet. Legacy-Verhalten.
          if (!own.has(key)) own.set(key, e);
        } else {
          otherByKey.add(key);
        }
      }

      // 5. Iteration.
      const dates = iterateDates(data.periodStart, data.periodEnd);
      const skipped: SkipCounts = {
        locked: 0,
        absence: 0,
        "other-location": 0,
        "no-entry": 0,
        "not-weekday": 0,
      };
      const changes: ChangeRecord[] = [];
      const createdEntryIds: string[] = [];
      let updated = 0;
      let created = 0;

      for (const staffId of data.staffIds) {
        for (const dateIso of dates) {
          const key = `${staffId}|${dateIso}`;
          const ownRow = own.get(key);
          const result = resolveBatchDay({
            dateIso,
            mode: data.mode,
            isLocked: isBusinessDateLocked(dateIso, lockThrough),
            hasAbsence: absenceSet.has(key),
            ownEntry: ownRow
              ? { id: ownRow.id, hasTimes: Boolean(ownRow.started_at && ownRow.ended_at) }
              : undefined,
            otherLocationEntry: otherByKey.has(key),
          });

          if (result.action === "skip") {
            skipped[result.reason] += 1;
            continue;
          }

          const std = standardTimesFor(dateIso, settings);
          const ts = batchTimestamps(dateIso, std.start, std.end);

          if (result.action === "update") {
            const before = ownRow!;
            const { error: uErr } = await supabaseAdmin
              .from("time_entries")
              .update({
                started_at: ts.startedAtIso,
                ended_at: ts.endedAtIso,
                break_minutes: ts.breakMinutes,
                business_date: dateIso,
              })
              .eq("id", result.entryId)
              .eq("organization_id", caller.organizationId);
            if (uErr) throw uErr;
            updated += 1;
            changes.push({
              entryId: result.entryId,
              staffId,
              businessDate: dateIso,
              before: {
                startedAt: before.started_at,
                endedAt: before.ended_at,
                breakMinutes: Number(before.break_minutes ?? 0),
              },
            });
          } else {
            const { data: ins, error: iErr } = await supabaseAdmin
              .from("time_entries")
              .insert({
                organization_id: caller.organizationId,
                staff_id: staffId,
                location_id: data.locationId,
                started_at: ts.startedAtIso,
                ended_at: ts.endedAtIso,
                business_date: dateIso,
                break_minutes: ts.breakMinutes,
                source: "manual",
              })
              .select("id")
              .single();
            if (iErr) throw iErr;
            created += 1;
            createdEntryIds.push(ins.id as string);
          }
        }
      }

      const runId = crypto.randomUUID();
      const aggregate = {
        result: {
          updated,
          created,
          skipped,
        },
        audit: {
          action: "time_entry.batch_times",
          entity: "time_entry",
          meta: {
            runId,
            mode: data.mode,
            locationId: data.locationId,
            periodStart: data.periodStart,
            periodEnd: data.periodEnd,
            staffCount: data.staffIds.length,
            staffIds: data.staffIds,
            updated,
            created,
            skipped,
            createdEntryIds,
          } as unknown as Record<string, unknown>,
        },
      };

      // Chunks mit den Vorher-Bildern separat schreiben (rekonstruierbar
      // aus append-only log). Der Aggregat-Eintrag geht per runGuarded.
      const CHUNK = 200;
      for (let i = 0; i < changes.length; i += CHUNK) {
        const chunk = changes.slice(i, i + CHUNK);
        await writeAuditLog({
          organizationId: caller.organizationId,
          actorUserId: caller.userId,
          actorStaffId: caller.staffId,
          action: "time_entry.batch_times.changes",
          entity: "time_entry",
          meta: {
            runId,
            chunk: Math.floor(i / CHUNK) + 1,
            chunkCount: Math.ceil(changes.length / CHUNK),
            changes: chunk,
          } as unknown as Record<string, unknown>,
        });
      }

      return aggregate;
    });
  });
