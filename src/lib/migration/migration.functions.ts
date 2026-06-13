// B2c — Server-Functions für Migration & Parallelbetrieb.
//
// Architektur:
//   * Alle Funktionen sind Admin-only (loadAdminCaller(..., 'admin')).
//   * Schreibvorgänge laufen via supabaseAdmin (RLS auf time_entries / import_runs /
//     staff_identity_map ist DENY-ALL für authenticated; nur service_role schreibt).
//   * runImport mit mode='dry_run' macht KEINE DB-Mutationen (kein import_runs-Insert,
//     kein time_entries-Insert, kein audit_log).
//   * runImport mit mode='commit' ist idempotent: existierende import_keys werden
//     vor INSERT herausgefiltert; der unique partial index
//     (organization_id, import_key) WHERE source='import' AND import_key IS NOT NULL
//     ist die letzte Verteidigungslinie.
//   * Nach erfolgreichem commit-Lauf: time_locked_through_date = max(business_date)
//     wird gesetzt (separater audit_log-Eintrag via setTimeLock-Pfad — hier inline).

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { loadAdminCaller } from "@/lib/admin/admin-context";
import { runGuarded } from "@/lib/admin/admin-call";
import { writeAuditLog } from "@/lib/admin/audit";
import { localTimesOf, sundayHolidayOf } from "./derivations";
import { utcIsoToBerlinHHMM, isSundayDate } from "./normalize";
import { aggregate, cycleKey, isoWeekKey, type ShiftSample } from "./aggregate-by-business-date";
import { bootstrapMissingStaffCore } from "./bootstrap-missing-staff";
import { reconcile } from "./reconcile";
import { emptyCounters, executeImport, parseCsvFor } from "./run-import-core";
import { deleteImportedShiftsCore } from "./delete-imported-shifts";

// =========================================================================
// Eingabe-Schemata
// =========================================================================

const sourceSystemSchema = z.enum(["tagesabrechnung", "bunker"]);

const parseInputSchema = z.object({
  sourceSystem: sourceSystemSchema,
  csvText: z.string().min(1),
});

const runImportInputSchema = z.object({
  sourceSystem: sourceSystemSchema,
  csvText: z.string().min(1),
  mode: z.enum(["dry_run", "commit"]),
});

const confirmMappingInputSchema = z.object({
  id: z.string().uuid(),
  staffId: z.string().uuid().nullable(),
});

const reconcileInputSchema = z.object({
  sourceSystem: sourceSystemSchema,
  csvText: z.string().min(1),
  groupBy: z.enum(["week", "cycle"]),
  from: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  to: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
});

const deleteImportedInputSchema = z.object({
  mode: z.enum(["dry_run", "commit"]),
  staffId: z.string().uuid().nullable().optional(),
});

// =========================================================================
// Hilfen
// =========================================================================

/** Normalisiert Namen für Levenshtein-Match: lower, ohne Diakritika und Sonderzeichen. */
function normalizeName(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  const m = a.length;
  const n = b.length;
  if (!m) return n;
  if (!n) return m;
  const prev = new Array<number>(n + 1);
  for (let j = 0; j <= n; j++) prev[j] = j;
  for (let i = 1; i <= m; i++) {
    let prevDiag = prev[0];
    prev[0] = i;
    for (let j = 1; j <= n; j++) {
      const tmp = prev[j];
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, prevDiag + cost);
      prevDiag = tmp;
    }
  }
  return prev[n];
}

/** Schwelle: <= 2 oder Distanz / max(len) <= 0.2 — bewusst eng, lieber „kein Vorschlag". */
function namesMatch(a: string, b: string): boolean {
  const na = normalizeName(a);
  const nb = normalizeName(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  const d = levenshtein(na, nb);
  if (d <= 2) return true;
  return d / Math.max(na.length, nb.length) <= 0.2;
}

// =========================================================================
// Server-Functions
// =========================================================================

/** Dry-Vorschau: parsed CSV, gibt Zähler + Top-50 zurück. KEIN DB-Schreibvorgang. */
export const parseImportCsv = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => parseInputSchema.parse(input))
  .handler(async ({ data, context }) => {
    await loadAdminCaller(context.supabase, context.userId, "admin");
    const shifts = parseCsvFor(data.sourceSystem, data.csvText);
    const counters = emptyCounters();
    counters.read = shifts.length;
    for (const s of shifts) {
      if (s.skipReason !== null) counters.skippedByReason[s.skipReason]++;
    }
    return {
      counters,
      sample: shifts.slice(0, 50).map((s) => ({
        altId: s.altId,
        altEmployeeId: s.altEmployeeId,
        altEmployeeName: s.altEmployeeName,
        shiftDate: s.shiftDate,
        startedAt: s.startedAt,
        endedAt: s.endedAt,
        skipReason: s.skipReason,
      })),
    };
  });

/** Distinkte (alt_id, alt_name) extrahieren, Namens-Match gegen public.staff,
 *  Vorschläge als unbestätigte staff_identity_map-Zeilen anlegen (upsert). */
export const proposeIdentityMappings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => parseInputSchema.parse(input))
  .handler(async ({ data, context }) => {
    const caller = await loadAdminCaller(context.supabase, context.userId, "admin");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const shifts = parseCsvFor(data.sourceSystem, data.csvText);
    const distinct = new Map<string, { altId: string; altName: string }>();
    for (const s of shifts) {
      const altId = s.altEmployeeId || s.altEmployeeName;
      if (!altId) continue;
      if (!distinct.has(altId)) distinct.set(altId, { altId, altName: s.altEmployeeName });
    }

    const { data: staffRows, error: staffErr } = await supabaseAdmin
      .from("staff")
      .select("id, display_name, first_name, last_name")
      .eq("organization_id", caller.organizationId)
      .eq("is_active", true);
    if (staffErr) throw staffErr;

    const proposals: {
      altId: string;
      altName: string;
      proposedStaffId: string | null;
      proposedDisplayName: string | null;
    }[] = [];

    for (const d of distinct.values()) {
      let match: { id: string; display_name: string } | null = null;
      for (const st of staffRows ?? []) {
        const full = `${st.first_name ?? ""} ${st.last_name ?? ""}`.trim();
        if (namesMatch(d.altName, st.display_name) || (full && namesMatch(d.altName, full))) {
          match = { id: st.id, display_name: st.display_name };
          break;
        }
      }
      proposals.push({
        altId: d.altId,
        altName: d.altName,
        proposedStaffId: match?.id ?? null,
        proposedDisplayName: match?.display_name ?? null,
      });
    }

    // Unbestätigte Vorschläge persistieren (upsert auf unique key
    // (organization_id, source_system, alt_id)). Bestätigte Zeilen NIE
    // überschreiben — dafür: nur upsert, wenn confirmed_at IS NULL.
    for (const p of proposals) {
      const { data: existing } = await supabaseAdmin
        .from("staff_identity_map")
        .select("id, confirmed_at")
        .eq("organization_id", caller.organizationId)
        .eq("source_system", data.sourceSystem)
        .eq("alt_id", p.altId)
        .maybeSingle();
      if (existing?.confirmed_at) continue; // bestätigte Mappings nicht anfassen
      if (existing) {
        await supabaseAdmin
          .from("staff_identity_map")
          .update({ alt_name: p.altName, staff_id: p.proposedStaffId })
          .eq("id", existing.id);
      } else {
        await supabaseAdmin.from("staff_identity_map").insert({
          organization_id: caller.organizationId,
          source_system: data.sourceSystem,
          alt_id: p.altId,
          alt_name: p.altName,
          staff_id: p.proposedStaffId,
        });
      }
    }

    return { proposals };
  });

/** Mapping bestätigen (staff_id setzen) oder bewusst überspringen (null). */
export const confirmMapping = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => confirmMappingInputSchema.parse(input))
  .handler(async ({ data, context }) => {
    const caller = await loadAdminCaller(context.supabase, context.userId, "admin");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("staff_identity_map")
      .update({
        staff_id: data.staffId,
        confirmed_at: new Date().toISOString(),
        confirmed_by: caller.userId,
      })
      .eq("id", data.id)
      .eq("organization_id", caller.organizationId);
    if (error) throw error;
    return { ok: true as const };
  });

/** Listet Identity-Mappings für die UI. */
export const listIdentityMappings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ sourceSystem: sourceSystemSchema }).parse(input))
  .handler(async ({ data, context }) => {
    const caller = await loadAdminCaller(context.supabase, context.userId, "admin");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows, error } = await supabaseAdmin
      .from("staff_identity_map")
      .select("id, alt_id, alt_name, staff_id, confirmed_at, confirmed_by")
      .eq("organization_id", caller.organizationId)
      .eq("source_system", data.sourceSystem)
      .order("alt_name", { ascending: true });
    if (error) throw error;
    return { mappings: rows ?? [] };
  });

/**
 * Importiert Alt-Schichten in time_entries (source='import').
 * dry_run zählt nur; commit schreibt + setzt Wasserlinie auf max(business_date).
 */
export const runImport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => runImportInputSchema.parse(input))
  .handler(async ({ data, context }) => {
    const caller = await loadAdminCaller(context.supabase, context.userId, "admin");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    return executeImport({
      admin: supabaseAdmin,
      organizationId: caller.organizationId,
      actorUserId: caller.userId,
      actorStaffId: caller.staffId,
      sourceSystem: data.sourceSystem,
      csvText: data.csvText,
      mode: data.mode,
    });
  });

/**
 * Reparatur (Option A): löscht importierte time_entries
 * (`source='import'`) — optional gefiltert nach staff_id —, damit ein
 * anschließender Re-Import mit korrigierten Identity-Mappings die
 * Schichten auf die richtigen Personen schreibt. Admin-only. Wasserlinie
 * wird NICHT verschoben. Audit-Eintrag pro Lauf.
 */
export const deleteImportedShifts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => deleteImportedInputSchema.parse(input))
  .handler(async ({ data, context }) => {
    const caller = await loadAdminCaller(context.supabase, context.userId, "admin");
    const writeAudit = async (entry: {
      action: string;
      entity: string;
      entityId?: string;
      meta?: Record<string, unknown>;
    }) => {
      await writeAuditLog({
        organizationId: caller.organizationId,
        actorUserId: caller.userId,
        actorStaffId: caller.staffId,
        action: entry.action,
        entity: entry.entity,
        entityId: entry.entityId ?? null,
        meta: entry.meta,
      });
    };
    return runGuarded(caller.role, "admin", writeAudit, async () => {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const res = await deleteImportedShiftsCore({
        admin: supabaseAdmin,
        organizationId: caller.organizationId,
        staffId: data.staffId ?? null,
        mode: data.mode,
      });
      return {
        result: res,
        audit: {
          action: "migration.import_deleted",
          entity: "time_entries",
          meta: {
            mode: res.mode,
            filter: res.filter,
            totalMatched: res.totalMatched,
            totalDeleted: res.totalDeleted,
            minBusinessDate: res.minBusinessDate,
            maxBusinessDate: res.maxBusinessDate,
            staffGroups: res.staffGroups,
          },
        },
      };
    });
  });

/**
 * Legt für alle Identity-Mappings der gewählten Quelle, die noch keinen
 * staff_id-Verweis haben, einen neuen Staff an (display_name = alt_name,
 * is_active = true, keine Rolle/PIN). Verknüpft das Mapping mit dem neuen
 * Staff; confirmed_at bleibt NULL — die manuelle Bestätigung je Zeile
 * bleibt Pflicht. Idempotent: Mappings mit existierender staff_id werden
 * übersprungen. Ein Audit-Eintrag pro Lauf.
 */
export const bootstrapMissingStaff = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ sourceSystem: sourceSystemSchema }).parse(input))
  .handler(async ({ data, context }) => {
    const caller = await loadAdminCaller(context.supabase, context.userId, "admin");
    const writeAudit = async (entry: {
      action: string;
      entity: string;
      entityId?: string;
      meta?: Record<string, unknown>;
    }) => {
      await writeAuditLog({
        organizationId: caller.organizationId,
        actorUserId: caller.userId,
        actorStaffId: caller.staffId,
        action: entry.action,
        entity: entry.entity,
        entityId: entry.entityId ?? null,
        meta: entry.meta,
      });
    };
    return runGuarded(caller.role, "admin", writeAudit, async () => {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const res = await bootstrapMissingStaffCore({
        admin: supabaseAdmin,
        organizationId: caller.organizationId,
        sourceSystem: data.sourceSystem,
      });
      return {
        result: {
          created: res.created,
          linked: res.linked,
          skipped: res.skipped,
        },
        audit: {
          action: "migration.staff_bootstrap",
          entity: "staff_identity_map",
          meta: {
            sourceSystem: data.sourceSystem,
            created: res.created,
            linked: res.linked,
            skipped: res.skipped,
            skippedNames: res.skippedNames,
          },
        },
      };
    });
  });

/** Abgleichsbericht: Alt-Topf vs. neu via tagesabrechnung-Adapter berechnet. */
export const getReconciliationReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => reconcileInputSchema.parse(input))
  .handler(async ({ data, context }) => {
    const caller = await loadAdminCaller(context.supabase, context.userId, "admin");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const shifts = parseCsvFor(data.sourceSystem, data.csvText).filter((s) => {
      if (data.from && s.shiftDate < data.from) return false;
      if (data.to && s.shiftDate > data.to) return false;
      return true;
    });

    const { data: mapRows, error: mapErr } = await supabaseAdmin
      .from("staff_identity_map")
      .select("alt_id, staff_id, confirmed_at")
      .eq("organization_id", caller.organizationId)
      .eq("source_system", data.sourceSystem);
    if (mapErr) throw mapErr;
    const mapByAltId = new Map<string, string | null>();
    for (const m of mapRows ?? []) {
      if (m.confirmed_at) mapByAltId.set(m.alt_id, m.staff_id);
    }

    const rows = reconcile({
      shifts,
      staffIdOf: (s) => mapByAltId.get(s.altEmployeeId || s.altEmployeeName) ?? null,
      sundayHolidayOf,
      localTimes: localTimesOf,
      groupBy: data.groupBy,
    });

    return { rows };
  });

/**
 * Abgleichsbericht „aus Datenbank": Alt-Topf-Summen aus CSV, Neu-Werte aus
 * den tatsächlich importierten time_entries (source='import') über denselben
 * tagesabrechnung-Adapter. Erwartung: 0 Differenzen, sobald Commit gelaufen
 * ist. Differenzen deuten auf nicht importierte Schichten oder spätere
 * manuelle Eingriffe in time_entries hin.
 */
export const getReconciliationReportFromDb = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => reconcileInputSchema.parse(input))
  .handler(async ({ data, context }) => {
    const caller = await loadAdminCaller(context.supabase, context.userId, "admin");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const bucketOf = data.groupBy === "cycle" ? cycleKey : isoWeekKey;

    const shifts = parseCsvFor(data.sourceSystem, data.csvText).filter((s) => {
      if (data.from && s.shiftDate < data.from) return false;
      if (data.to && s.shiftDate > data.to) return false;
      return true;
    });

    const { data: mapRows, error: mapErr } = await supabaseAdmin
      .from("staff_identity_map")
      .select("alt_id, staff_id, confirmed_at")
      .eq("organization_id", caller.organizationId)
      .eq("source_system", data.sourceSystem);
    if (mapErr) throw mapErr;
    const mapByAltId = new Map<string, string | null>();
    for (const m of mapRows ?? []) {
      if (m.confirmed_at) mapByAltId.set(m.alt_id, m.staff_id);
    }

    // Alt-Töpfe aus CSV via vorhandenem reconcile (recomputeFrom-csv), aber wir
    // brauchen nur die Alt-Summe — leichter: direkt eigene Aggregation der Alt-
    // Töpfe je (staffId, bucket). Dann DB-Aggregation und manueller Diff.
    type Totals = {
      totalHours: number;
      eveningHours: number;
      nightHours: number;
      nightDeepHours: number;
      sundayHolidayHours: number;
    };
    const EMPTY: Totals = {
      totalHours: 0,
      eveningHours: 0,
      nightHours: 0,
      nightDeepHours: 0,
      sundayHolidayHours: 0,
    };
    const round2 = (n: number) => Math.round(n * 100) / 100;
    const addT = (a: Totals, b: Totals): Totals => ({
      totalHours: round2(a.totalHours + b.totalHours),
      eveningHours: round2(a.eveningHours + b.eveningHours),
      nightHours: round2(a.nightHours + b.nightHours),
      nightDeepHours: round2(a.nightDeepHours + b.nightDeepHours),
      sundayHolidayHours: round2(a.sundayHolidayHours + b.sundayHolidayHours),
    });

    const altMap = new Map<string, { staffId: string; bucketKey: string; sum: Totals }>();
    let minDate: string | null = null;
    let maxDate: string | null = null;
    const scopedStaff = new Set<string>();
    for (const s of shifts) {
      if (s.skipReason !== null) continue;
      const altKey = s.altEmployeeId || s.altEmployeeName;
      const staffId = mapByAltId.get(altKey) ?? null;
      if (!staffId) continue;
      scopedStaff.add(staffId);
      if (!minDate || s.shiftDate < minDate) minDate = s.shiftDate;
      if (!maxDate || s.shiftDate > maxDate) maxDate = s.shiftDate;
      const bucket = bucketOf(s.shiftDate);
      const key = `${staffId}::${bucket}`;
      const alt = s.altTotals ?? EMPTY;
      const ex = altMap.get(key);
      altMap.set(key, {
        staffId,
        bucketKey: bucket,
        sum: ex ? addT(ex.sum, alt) : { ...alt },
      });
    }

    // DB-Seite: importierte time_entries für scoped Staff & Datumsbereich.
    const samples: ShiftSample[] = [];
    if (scopedStaff.size > 0 && minDate && maxDate) {
      const { data: rows, error: teErr } = await supabaseAdmin
        .from("time_entries")
        .select("staff_id, started_at, ended_at, business_date")
        .eq("organization_id", caller.organizationId)
        .eq("source", "import")
        .in("staff_id", Array.from(scopedStaff))
        .gte("business_date", minDate)
        .lte("business_date", maxDate);
      if (teErr) throw teErr;
      for (const r of rows ?? []) {
        if (!r.started_at || !r.ended_at || !r.staff_id || !r.business_date) continue;
        samples.push({
          staffId: r.staff_id,
          businessDate: r.business_date,
          startLocal: utcIsoToBerlinHHMM(r.started_at),
          endLocal: utcIsoToBerlinHHMM(r.ended_at),
          sundayOrHoliday: isSundayDate(r.business_date),
        });
      }
    }
    const buckets = aggregate(samples, (s) => bucketOf(s.businessDate));
    const recoMap = new Map<string, Totals>();
    for (const b of buckets) {
      recoMap.set(`${b.staffId}::${b.bucketKey}`, {
        totalHours: b.totalHours,
        eveningHours: b.eveningHours,
        nightHours: b.nightHours,
        nightDeepHours: b.nightDeepHours,
        sundayHolidayHours: b.sundayHolidayHours,
      });
    }

    const keys = new Set<string>([...altMap.keys(), ...recoMap.keys()]);
    const rows = Array.from(keys).map((key) => {
      const altEntry = altMap.get(key);
      const reco = recoMap.get(key) ?? { ...EMPTY };
      const staffId = altEntry?.staffId ?? key.split("::")[0];
      const bucketKey = altEntry?.bucketKey ?? key.split("::")[1];
      const alt = altEntry?.sum ?? { ...EMPTY };
      const diff: Totals = {
        totalHours: round2(alt.totalHours - reco.totalHours),
        eveningHours: round2(alt.eveningHours - reco.eveningHours),
        nightHours: round2(alt.nightHours - reco.nightHours),
        nightDeepHours: round2(alt.nightDeepHours - reco.nightDeepHours),
        sundayHolidayHours: round2(alt.sundayHolidayHours - reco.sundayHolidayHours),
      };
      const hasDifference =
        diff.totalHours !== 0 ||
        diff.eveningHours !== 0 ||
        diff.nightHours !== 0 ||
        diff.nightDeepHours !== 0 ||
        diff.sundayHolidayHours !== 0;
      return { staffId, bucketKey, alt, recomputed: reco, diff, hasDifference };
    });
    rows.sort((a, b) =>
      a.staffId === b.staffId
        ? a.bucketKey.localeCompare(b.bucketKey)
        : a.staffId.localeCompare(b.staffId),
    );
    return { rows };
  });

