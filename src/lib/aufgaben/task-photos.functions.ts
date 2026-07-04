// Server-Functions für Task-Fotos (AF1).
//
// Sicherheitsmodell:
// - Bucket "task-photos" ist privat, keine Client-Storage-Policies.
//   Auslieferung nur über signierte URLs, die diese Server-Fn ausstellen.
// - task_photos-Tabelle ist DENY-ALL — nur service_role liest/schreibt.
// - Sichtbarkeit an die Aufgabe gekoppelt: wenn der Aufrufer die Aufgabe per
//   RLS lesen darf (context.supabase liefert die Zeile), darf er auch deren
//   Fotos sehen und hochladen.
// - Löschen: eigener Upload ODER Rolle >= manager.
// - Insert-Fehler → Storage-Objekt zurückrollen (Muster uploadMyDocument).

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { loadAdminCaller } from "@/lib/admin/admin-context";
import { runGuarded } from "@/lib/admin/admin-call";
import { makeAuditWriter } from "@/lib/admin/audit";
import { ForbiddenError, hasMinRole } from "@/lib/admin/role-guard";

const BUCKET = "task-photos";
const MAX_BYTES = 8 * 1024 * 1024; // 8 MB
const MAX_PER_TASK = 10;

const ALLOWED_MIME: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

const ALLOWED_ALL = ["admin", "manager", "staff"] as const;

function decodeBase64Length(b64: string): number {
  const clean = b64.replace(/\s+/g, "");
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(clean)) return -1;
  const pad = clean.endsWith("==") ? 2 : clean.endsWith("=") ? 1 : 0;
  return Math.floor((clean.length * 3) / 4) - pad;
}

/**
 * Verifiziert, dass der Aufrufer die Aufgabe sehen darf — nutzt den
 * User-Client (RLS), damit dieselbe Regel wie im Board greift. Wirft
 * ForbiddenError, wenn die Aufgabe nicht sichtbar/vorhanden ist.
 */
async function assertTaskVisible(
  supabase: Parameters<typeof loadAdminCaller>[0],
  taskId: string,
  organizationId: string,
): Promise<void> {
  const { data, error } = await supabase
    .from("tasks")
    .select("id, organization_id")
    .eq("id", taskId)
    .maybeSingle();
  if (error) throw new ForbiddenError();
  if (!data || data.organization_id !== organizationId) throw new ForbiddenError();
}

export type TaskPhoto = {
  id: string;
  taskId: string;
  mimeType: string;
  sizeBytes: number;
  uploadedByStaffId: string;
  createdAt: string;
  url: string;
};

export const uploadTaskPhoto = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        taskId: z.string().uuid(),
        base64: z.string().min(1),
        mimeType: z.string().min(1),
        fileName: z.string().max(255).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<{ id: string; path: string }> => {
    const caller = await loadAdminCaller(context.supabase, context.userId, ALLOWED_ALL);
    const ext = ALLOWED_MIME[data.mimeType];
    if (!ext) throw new Error("Dateityp nicht erlaubt (nur JPG, PNG oder WEBP).");
    const size = decodeBase64Length(data.base64);
    if (size <= 0) throw new Error("Bild ist ungültig.");
    if (size > MAX_BYTES) throw new Error("Bild ist zu groß (max. 8 MB).");
    await assertTaskVisible(context.supabase, data.taskId, caller.organizationId);

    return runGuarded(caller.role, "staff", makeAuditWriter(caller), async () => {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { count, error: countErr } = await supabaseAdmin
        .from("task_photos")
        .select("id", { count: "exact", head: true })
        .eq("task_id", data.taskId);
      if (countErr) throw new Error(countErr.message);
      if ((count ?? 0) >= MAX_PER_TASK) {
        throw new Error(`Höchstens ${MAX_PER_TASK} Fotos pro Aufgabe.`);
      }

      const uuid = crypto.randomUUID();
      const path = `${caller.organizationId}/${data.taskId}/${uuid}.${ext}`;
      const bytes = Uint8Array.from(atob(data.base64.replace(/\s+/g, "")), (c) => c.charCodeAt(0));
      const { error: upErr } = await supabaseAdmin.storage
        .from(BUCKET)
        .upload(path, bytes, { contentType: data.mimeType, upsert: false });
      if (upErr) throw new Error(upErr.message);

      const { data: inserted, error: insErr } = await supabaseAdmin
        .from("task_photos")
        .insert({
          organization_id: caller.organizationId,
          task_id: data.taskId,
          storage_path: path,
          mime_type: data.mimeType,
          size_bytes: size,
          uploaded_by_staff_id: caller.staffId,
        })
        .select("id")
        .single();
      if (insErr) {
        await supabaseAdmin.storage.from(BUCKET).remove([path]);
        throw new Error(insErr.message);
      }
      return {
        result: { id: inserted.id as string, path },
        audit: {
          action: "task.photo_uploaded",
          entity: "task",
          entityId: data.taskId,
          meta: { photoId: inserted.id, sizeBytes: size },
        },
      };
    });
  });

export const listTaskPhotos = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ taskId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }): Promise<TaskPhoto[]> => {
    const caller = await loadAdminCaller(context.supabase, context.userId, ALLOWED_ALL);
    await assertTaskVisible(context.supabase, data.taskId, caller.organizationId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows, error } = await supabaseAdmin
      .from("task_photos")
      .select("id, task_id, storage_path, mime_type, size_bytes, uploaded_by_staff_id, created_at")
      .eq("task_id", data.taskId)
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);
    const list = rows ?? [];
    if (list.length === 0) return [];
    const paths = list.map((r) => r.storage_path as string);
    const { data: signed, error: signErr } = await supabaseAdmin.storage
      .from(BUCKET)
      .createSignedUrls(paths, 60 * 60);
    if (signErr || !signed) throw new Error(signErr?.message ?? "Signed URLs fehlgeschlagen.");
    const urlByPath = new Map<string, string>();
    for (const s of signed) if (s.path && s.signedUrl) urlByPath.set(s.path, s.signedUrl);
    return list.map((r) => ({
      id: r.id as string,
      taskId: r.task_id as string,
      mimeType: r.mime_type as string,
      sizeBytes: Number(r.size_bytes),
      uploadedByStaffId: r.uploaded_by_staff_id as string,
      createdAt: r.created_at as string,
      url: urlByPath.get(r.storage_path as string) ?? "",
    }));
  });

export const deleteTaskPhoto = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ photoId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    const caller = await loadAdminCaller(context.supabase, context.userId, ALLOWED_ALL);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: photo, error } = await supabaseAdmin
      .from("task_photos")
      .select("id, task_id, organization_id, storage_path, uploaded_by_staff_id")
      .eq("id", data.photoId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!photo || photo.organization_id !== caller.organizationId) throw new ForbiddenError();
    await assertTaskVisible(context.supabase, photo.task_id as string, caller.organizationId);

    const isUploader = photo.uploaded_by_staff_id === caller.staffId;
    const isManagerPlus = hasMinRole(caller.role, "manager");
    if (!isUploader && !isManagerPlus) throw new ForbiddenError();

    return runGuarded(caller.role, "staff", makeAuditWriter(caller), async () => {
      const path = photo.storage_path as string;
      const { error: rmErr } = await supabaseAdmin.storage.from(BUCKET).remove([path]);
      if (rmErr) throw new Error(rmErr.message);
      const { error: delErr } = await supabaseAdmin
        .from("task_photos")
        .delete()
        .eq("id", data.photoId);
      if (delErr) throw new Error(delErr.message);
      return {
        result: { ok: true as const },
        audit: {
          action: "task.photo_deleted",
          entity: "task",
          entityId: photo.task_id as string,
          meta: { photoId: data.photoId, storage_path: path },
        },
      };
    });
  });

/**
 * Batch-Zähler: liefert für jede taskId in `taskIds` die Anzahl Fotos.
 * Wird für das „📷 N"-Badge auf Karten benutzt.
 */
export const countTaskPhotos = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ taskIds: z.array(z.string().uuid()).max(500) }).parse(input),
  )
  .handler(async ({ data, context }): Promise<Record<string, number>> => {
    if (data.taskIds.length === 0) return {};
    const caller = await loadAdminCaller(context.supabase, context.userId, ALLOWED_ALL);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // Sichtbarkeit: nur Fotos aus Aufgaben derselben Organisation zählen.
    // Feine Task-Sichtbarkeit greift beim Öffnen der Strip (listTaskPhotos).
    const { data: rows, error } = await supabaseAdmin
      .from("task_photos")
      .select("task_id")
      .in("task_id", data.taskIds)
      .eq("organization_id", caller.organizationId);
    if (error) throw new Error(error.message);
    const out: Record<string, number> = {};
    for (const r of rows ?? []) {
      const id = r.task_id as string;
      out[id] = (out[id] ?? 0) + 1;
    }
    return out;
  });