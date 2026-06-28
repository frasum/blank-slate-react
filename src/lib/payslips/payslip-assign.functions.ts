// Auto-Matcher: edlohn-PDF-Dateinamen → staff.perso_nr (org-scoped) →
// Upload in den bestehenden payslips-Bucket.
//
// Ehrlichkeitsregel: TSB ist aktuell aus der Lohnabrechnung ausgeklammert
// (Lohn läuft praktisch über einen Mandanten). perso_nr ist heute org-weit
// eindeutig (Live-CSV bestätigt). Sicherheitsnetz: >1 staff zur perso_nr
// → ambiguous → KEIN Upload. Wird TSB künftig in den Lohnlauf aufgenommen
// und kollidieren Personal-Nrn., MUSS auf ein (Mandant, perso)-Modell
// umgestellt werden (separater Auftrag).

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { loadAdminCaller } from "@/lib/admin/admin-context";
import { parsePayslipName } from "./payslip-filename";
import {
  classifyAssignment,
  type AssignDecision,
  type StaffLite,
} from "./payslip-assign-core";
import { payslipFolder, sanitizePayslipFileName } from "./payslip-path";

const BUCKET = "payslips";

async function loadStaffByPerso(
  organizationId: string,
  persoNr: number,
): Promise<StaffLite[]> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("staff")
    .select("id, display_name, is_active")
    .eq("organization_id", organizationId)
    .eq("perso_nr", persoNr);
  if (error) throw new Error(error.message);
  return (data ?? []) as StaffLite[];
}

export const planPayslipAssignment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        files: z.array(z.object({ fileName: z.string().min(1) })).min(1),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<AssignDecision[]> => {
    const caller = await loadAdminCaller(context.supabase, context.userId, "admin");
    const out: AssignDecision[] = [];
    for (const f of data.files) {
      const parsed = parsePayslipName(f.fileName);
      const rows = parsed ? await loadStaffByPerso(caller.organizationId, parsed.persoNr) : [];
      out.push(classifyAssignment(f.fileName, parsed, rows));
    }
    return out;
  });

export type AssignUploadResult = {
  fileName: string;
  status: AssignDecision["status"] | "uploaded" | "error";
  staffId?: string;
  path?: string;
  reason?: string;
};

export const assignPayslips = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        files: z
          .array(
            z.object({
              fileName: z.string().min(1),
              contentBase64: z.string().min(1),
            }),
          )
          .min(1),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<AssignUploadResult[]> => {
    const caller = await loadAdminCaller(context.supabase, context.userId, "admin");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const results: AssignUploadResult[] = [];
    for (const f of data.files) {
      const parsed = parsePayslipName(f.fileName);
      const rows = parsed ? await loadStaffByPerso(caller.organizationId, parsed.persoNr) : [];
      const decision = classifyAssignment(f.fileName, parsed, rows);
      if (decision.status !== "matched" && decision.status !== "matched_inactive") {
        results.push({
          fileName: f.fileName,
          status: decision.status,
          reason: statusReason(decision.status),
        });
        continue;
      }
      const safeName = sanitizePayslipFileName(f.fileName);
      if (!safeName) {
        results.push({
          fileName: f.fileName,
          status: "error",
          reason: "Ungültiger Dateiname.",
        });
        continue;
      }
      const path = `${payslipFolder(caller.organizationId, decision.staffId!)}/${safeName}`;
      try {
        const bytes = Uint8Array.from(atob(f.contentBase64), (c) => c.charCodeAt(0));
        const { error } = await supabaseAdmin.storage.from(BUCKET).upload(path, bytes, {
          contentType: "application/pdf",
          upsert: true,
        });
        if (error) throw new Error(error.message);
        results.push({
          fileName: f.fileName,
          status: "uploaded",
          staffId: decision.staffId!,
          path,
        });
      } catch (err) {
        results.push({
          fileName: f.fileName,
          status: "error",
          reason: err instanceof Error ? err.message : "Upload fehlgeschlagen.",
        });
      }
    }
    return results;
  });

function statusReason(status: AssignDecision["status"]): string {
  switch (status) {
    case "unknown_perso":
      return "Unbekannte Personal-Nr.";
    case "ambiguous":
      return "Mehrdeutig — übersprungen.";
    case "unparsable":
      return "Dateiname nicht lesbar.";
    default:
      return "";
  }
}