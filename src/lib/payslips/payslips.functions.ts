// Server-Fns für den privaten `payslips`-Bucket.
// Pfad-Konvention: `${organization_id}/${staff_id}/<dateiname>`. Storage-
// Operationen laufen serverseitig über `supabaseAdmin` (RLS auf
// storage.objects gilt zusätzlich als Defense-in-Depth, siehe Migration).

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { loadAdminCaller } from "@/lib/admin/admin-context";
import { ForbiddenError } from "@/lib/admin/role-guard";
import { isPayslipPathAllowed, payslipFolder, sanitizePayslipFileName } from "./payslip-path";

export type PayslipEntry = {
  name: string;
  path: string;
  createdAt: string | null;
  sizeBytes: number | null;
};

const BUCKET = "payslips";

async function listFolder(folder: string): Promise<PayslipEntry[]> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin.storage.from(BUCKET).list(folder, {
    sortBy: { column: "created_at", order: "desc" },
  });
  if (error) throw new Error(error.message);
  const rows = (data ?? []).filter((o) => o.name !== ".emptyFolderPlaceholder");
  return rows.map((o) => ({
    name: o.name,
    path: `${folder}/${o.name}`,
    createdAt: (o as { created_at?: string | null }).created_at ?? null,
    sizeBytes: (o.metadata as { size?: number } | null | undefined)?.size ?? null,
  }));
}

export const listMyPayslips = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<PayslipEntry[]> => {
    const caller = await loadAdminCaller(context.supabase, context.userId, "staff");
    return listFolder(payslipFolder(caller.organizationId, caller.staffId));
  });

export const getPayslipSignedUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ path: z.string().min(1) }).parse(input))
  .handler(async ({ data, context }): Promise<{ url: string }> => {
    const caller = await loadAdminCaller(context.supabase, context.userId, "staff");
    if (
      !isPayslipPathAllowed({
        path: data.path,
        organizationId: caller.organizationId,
        staffId: caller.staffId,
        role: caller.role,
      })
    ) {
      throw new ForbiddenError();
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: signed, error } = await supabaseAdmin.storage
      .from(BUCKET)
      .createSignedUrl(data.path, 60);
    if (error || !signed) throw new Error(error?.message ?? "Signed URL fehlgeschlagen.");
    return { url: signed.signedUrl };
  });

export const listStaffPayslips = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ staffId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }): Promise<PayslipEntry[]> => {
    const caller = await loadAdminCaller(context.supabase, context.userId, "admin");
    return listFolder(payslipFolder(caller.organizationId, data.staffId));
  });

export const uploadPayslip = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        staffId: z.string().uuid(),
        fileName: z.string().min(1),
        contentBase64: z.string().min(1),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<{ path: string }> => {
    const caller = await loadAdminCaller(context.supabase, context.userId, "admin");
    const safeName = sanitizePayslipFileName(data.fileName);
    if (!safeName) throw new Error("Ungültiger Dateiname.");
    const folder = payslipFolder(caller.organizationId, data.staffId);
    const path = `${folder}/${safeName}`;
    const bytes = Uint8Array.from(atob(data.contentBase64), (c) => c.charCodeAt(0));
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.storage.from(BUCKET).upload(path, bytes, {
      contentType: "application/pdf",
      upsert: true,
    });
    if (error) throw new Error(error.message);
    return { path };
  });

export const deletePayslip = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ path: z.string().min(1) }).parse(input))
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    const caller = await loadAdminCaller(context.supabase, context.userId, "admin");
    if (!data.path.startsWith(`${caller.organizationId}/`)) {
      throw new ForbiddenError();
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.storage.from(BUCKET).remove([data.path]);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
