// I/O-Kern für `importStaffPersonalData`. Liest identity_map, staff und
// staff_compensation, berechnet den Diff via reinem `computePersonalPlan`
// und schreibt im Commit-Pfad. Schreibt selbst KEIN audit_log — das
// übernimmt der Server-Fn-Handler über `runGuarded`.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import {
  computePersonalPlan,
  type CurrentCompRow,
  type CurrentStaffRow,
  type PersonalPlan,
  type PersonalRowInput,
} from "./import-personal";

export type ImportPersonalCoreInput = {
  admin: SupabaseClient<Database>;
  organizationId: string;
  sourceSystem: "tagesabrechnung";
  rows: PersonalRowInput[];
  mode: "dry_run" | "commit";
  /** Optional: überschreibt das via RPC ermittelte Fallback-Datum (Tests). */
  fallbackValidFrom?: string;
};

export type ImportPersonalCoreResult = {
  mode: "dry_run" | "commit";
  plan: PersonalPlan;
};

/**
 * Spiegelt die DB-Function `current_business_date()`:
 *   ((now() AT TIME ZONE 'Europe/Berlin') - interval '3 hours')::date
 * Bewusst clientseitig berechnet (kein RPC), damit das Modul ohne zusätzliche
 * RPC-Type-Generierung und ohne Round-Trip auskommt.
 */
function computeBerlinBusinessDate(now: Date = new Date()): string {
  const shifted = new Date(now.getTime() - 3 * 60 * 60 * 1000);
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Berlin",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(shifted);
  const y = parts.find((p) => p.type === "year")!.value;
  const m = parts.find((p) => p.type === "month")!.value;
  const d = parts.find((p) => p.type === "day")!.value;
  return `${y}-${m}-${d}`;
}

export async function runImportPersonalCore(
  input: ImportPersonalCoreInput,
): Promise<ImportPersonalCoreResult> {
  const { admin, organizationId } = input;

  // 1) identity_map: altStaffId → staffId
  const { data: mapRows, error: mapErr } = await admin
    .from("staff_identity_map")
    .select("alt_id, staff_id, confirmed_at")
    .eq("organization_id", organizationId)
    .eq("source_system", input.sourceSystem);
  if (mapErr) throw mapErr;
  const staffMap = new Map<string, string>();
  for (const r of mapRows ?? []) {
    if (!r.confirmed_at || !r.staff_id) continue;
    staffMap.set(r.alt_id, r.staff_id);
  }

  // 2) Aktueller Staff-Bestand (nur betroffene IDs)
  const targetStaffIds = Array.from(
    new Set(input.rows.map((r) => staffMap.get(r.altStaffId)).filter((v): v is string => !!v)),
  );

  const currentStaff = new Map<string, CurrentStaffRow>();
  const currentComp = new Map<string, CurrentCompRow>();

  if (targetStaffIds.length > 0) {
    const { data: staffRows, error: sErr } = await admin
      .from("staff")
      .select("id, first_name, last_name, display_name, perso_nr")
      .eq("organization_id", organizationId)
      .in("id", targetStaffIds);
    if (sErr) throw sErr;
    for (const r of staffRows ?? []) {
      currentStaff.set(r.id, {
        staffId: r.id,
        firstName: r.first_name,
        lastName: r.last_name,
        displayName: r.display_name,
        persoNr: (r as { perso_nr: number | null }).perso_nr ?? null,
      });
    }

    const { data: compRows, error: cErr } = await admin
      .from("staff_compensation")
      .select("staff_id, hourly_rate, valid_from")
      .eq("organization_id", organizationId)
      .in("staff_id", targetStaffIds);
    if (cErr) throw cErr;
    for (const r of compRows ?? []) {
      currentComp.set(r.staff_id, {
        staffId: r.staff_id,
        hourlyRate: Number(r.hourly_rate),
        validFrom: r.valid_from,
      });
    }
  }

  // 3) Fallback-Datum (heute, Berlin-TZ — gleiche Formel wie DB-Function)
  const fallbackValidFrom = input.fallbackValidFrom ?? computeBerlinBusinessDate();

  const plan = computePersonalPlan({
    rows: input.rows,
    staffMap,
    currentStaff,
    currentComp,
    fallbackValidFrom,
  });

  if (input.mode === "dry_run") {
    return { mode: "dry_run", plan };
  }

  // --- Commit: staff-Updates ---
  for (const u of plan.staffUpdates) {
    const { error } = await admin
      .from("staff")
      .update(u.fields)
      .eq("organization_id", organizationId)
      .eq("id", u.staffId);
    if (error) throw new Error(`staff update failed: ${error.message}`);
  }

  // --- Commit: staff_compensation Insert / Update ---
  for (const op of plan.compOps) {
    if (op.op === "insert") {
      const { error } = await admin.from("staff_compensation").insert({
        organization_id: organizationId,
        staff_id: op.staffId,
        hourly_rate: op.hourly_rate,
        valid_from: op.valid_from,
      });
      if (error) throw new Error(`staff_compensation insert failed: ${error.message}`);
    } else {
      const { error } = await admin
        .from("staff_compensation")
        .update({ hourly_rate: op.hourly_rate, valid_from: op.valid_from })
        .eq("organization_id", organizationId)
        .eq("staff_id", op.staffId);
      if (error) throw new Error(`staff_compensation update failed: ${error.message}`);
    }
  }

  return { mode: "commit", plan };
}
