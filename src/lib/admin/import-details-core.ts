// I/O-Kern für `importStaffPersonalDetails` (Welle 2).
// Lädt staff via perso_nr, lädt bestehende staff_personal_details, berechnet
// Diff via reinem computeDetailsPlan und schreibt im Commit-Pfad. Schreibt
// selbst KEIN audit_log — das übernimmt der Server-Fn-Handler via runGuarded.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import {
  computeDetailsPlan,
  type CurrentDetailsRow,
  type DetailsPlan,
  type DetailsRowInput,
  type DetailsDbFields,
} from "./import-details";

export type ImportDetailsCoreInput = {
  admin: SupabaseClient<Database>;
  organizationId: string;
  rows: DetailsRowInput[];
  mode: "dry_run" | "commit";
};

export type ImportDetailsCoreResult = {
  mode: "dry_run" | "commit";
  plan: DetailsPlan;
};

export async function runImportDetailsCore(
  input: ImportDetailsCoreInput,
): Promise<ImportDetailsCoreResult> {
  const { admin, organizationId } = input;

  // 1) staff in der Org laden (id, perso_nr) → Map<perso_nr, staff_id>.
  const { data: staffRows, error: sErr } = await admin
    .from("staff")
    .select("id, perso_nr")
    .eq("organization_id", organizationId);
  if (sErr) throw sErr;

  const staffByPersoNr = new Map<number, string>();
  const seenPersoNrs = new Map<number, number>();
  for (const r of staffRows ?? []) {
    const pn = (r as { perso_nr: number | null }).perso_nr;
    if (pn === null || pn === undefined) continue;
    seenPersoNrs.set(pn, (seenPersoNrs.get(pn) ?? 0) + 1);
    staffByPersoNr.set(pn, r.id);
  }
  const ambiguousPersoNrs = new Set<number>();
  for (const [pn, n] of seenPersoNrs) {
    if (n > 1) {
      ambiguousPersoNrs.add(pn);
      staffByPersoNr.delete(pn);
    }
  }

  // 2) Bestehende Detail-Zeilen für betroffene staff_ids.
  const targetStaffIds = Array.from(
    new Set(
      input.rows
        .map((r) => parseInt(r.personnelNumber, 10))
        .filter((n) => Number.isInteger(n))
        .map((n) => staffByPersoNr.get(n))
        .filter((v): v is string => !!v),
    ),
  );

  const currentDetails = new Map<string, CurrentDetailsRow>();
  if (targetStaffIds.length > 0) {
    const { data: detailRows, error: dErr } = await admin
      .from("staff_personal_details")
      .select("*")
      .eq("organization_id", organizationId)
      .in("staff_id", targetStaffIds);
    if (dErr) throw dErr;
    for (const r of detailRows ?? []) {
      currentDetails.set(r.staff_id, r as unknown as CurrentDetailsRow);
    }
  }

  const plan = computeDetailsPlan({
    rows: input.rows,
    staffByPersoNr,
    ambiguousPersoNrs,
    currentDetails,
  });

  if (input.mode === "dry_run") {
    return { mode: "dry_run", plan };
  }

  // Commit: Insert/Update via Service-Role (Client darf nicht schreiben).
  for (const op of plan.ops) {
    if (op.op === "insert") {
      const insertRow = {
        organization_id: organizationId,
        staff_id: op.staffId,
        ...(op.fields as Partial<DetailsDbFields>),
      };
      const { error } = await admin.from("staff_personal_details").insert(insertRow);
      if (error) throw new Error(`staff_personal_details insert failed: ${error.message}`);
    } else {
      const { error } = await admin
        .from("staff_personal_details")
        .update(op.fields as Partial<DetailsDbFields>)
        .eq("organization_id", organizationId)
        .eq("staff_id", op.staffId);
      if (error) throw new Error(`staff_personal_details update failed: ${error.message}`);
    }
  }

  return { mode: "commit", plan };
}
