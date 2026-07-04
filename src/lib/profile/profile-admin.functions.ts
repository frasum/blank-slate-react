// SP1 — Admin-Ebene: Review/Freigabe von Änderungsanträgen, Dokumenten-Ops.
// Alle Aufrufe erfordern Admin. Schreibpfade laufen über runGuarded + Audit.
// Bei Freigabe werden NUR Felder auf staff_personal_details geschrieben, die
// dort existieren; first_name/last_name landen NICHT auf staff (SP3-UI zeigt
// dies als "manuell übernehmen" an).

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { loadAdminCaller } from "@/lib/admin/admin-context";
import { runGuarded } from "@/lib/admin/admin-call";
import { makeAuditWriter } from "@/lib/admin/audit";
import { ForbiddenError } from "@/lib/admin/role-guard";
import {
  SELF_VIEW_FIELDS,
  normalizeRequestValue,
  splitApplicableFields,
  validateChangeRequestPayload,
  type RequestField,
} from "./profile-fields";
import {
  ALLOWED_DOC_MIME,
  DOC_TYPES,
  MAX_DOC_SIZE_BYTES,
  extensionForMime,
  isStaffDocumentPathAllowed,
  sanitizeDocumentFileName,
  staffDocumentFolder,
  type StaffDocumentType,
} from "./staff-document-path";

const BUCKET = "staff-documents";

type JsonPrimitive = string | number | boolean | null;

function toPrimitive(v: unknown): JsonPrimitive {
  if (v === null || v === undefined) return null;
  if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") return v;
  return String(v);
}

export type OpenChangeRequest = {
  id: string;
  staffId: string;
  staffName: string;
  createdAt: string;
  note: string | null;
  changes: {
    field: string;
    current: JsonPrimitive;
    requested: JsonPrimitive;
    manualOnly: boolean;
  }[];
};

export const listOpenChangeRequests = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<OpenChangeRequest[]> => {
    const caller = await loadAdminCaller(context.supabase, context.userId, "admin");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows, error } = await supabaseAdmin
      .from("staff_data_change_requests")
      .select("id, staff_id, payload, note, created_at")
      .eq("organization_id", caller.organizationId)
      .eq("status", "pending")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    const list = rows ?? [];
    if (list.length === 0) return [];
    const staffIds = Array.from(new Set(list.map((r) => r.staff_id as string)));
    const [staffRes, detailsRes] = await Promise.all([
      supabaseAdmin
        .from("staff")
        .select("id, first_name, last_name, display_name")
        .in("id", staffIds),
      supabaseAdmin
        .from("staff_personal_details")
        .select(`staff_id, ${SELF_VIEW_FIELDS.join(",")}`)
        .in("staff_id", staffIds),
    ]);
    if (staffRes.error) throw new Error(staffRes.error.message);
    if (detailsRes.error) throw new Error(detailsRes.error.message);
    const staffMap = new Map<string, { firstName: string | null; lastName: string | null }>();
    for (const s of staffRes.data ?? []) {
      staffMap.set(s.id as string, {
        firstName: (s.first_name as string | null) ?? null,
        lastName: (s.last_name as string | null) ?? null,
      });
    }
    const detailsMap = new Map<string, Record<string, unknown>>();
    for (const d of (detailsRes.data ?? []) as unknown as Record<string, unknown>[]) {
      detailsMap.set(d.staff_id as string, d);
    }

    return list.map((r) => {
      const staff = staffMap.get(r.staff_id as string);
      const details = detailsMap.get(r.staff_id as string) ?? {};
      const payload = (r.payload ?? {}) as Record<string, unknown>;
      const { manualOnly } = splitApplicableFields(
        payload as Partial<Record<RequestField, unknown>>,
      );
      const manualKeys = new Set(Object.keys(manualOnly));
      const changes = Object.keys(payload).map((field) => ({
        field,
        current: manualKeys.has(field)
          ? toPrimitive(
              field === "first_name"
                ? staff?.firstName
                : field === "last_name"
                  ? staff?.lastName
                  : null,
            )
          : toPrimitive(details[field] ?? null),
        requested: toPrimitive(payload[field]),
        manualOnly: manualKeys.has(field),
      }));
      const staffName = [staff?.firstName, staff?.lastName].filter(Boolean).join(" ") || "—";
      return {
        id: r.id as string,
        staffId: r.staff_id as string,
        staffName,
        createdAt: r.created_at as string,
        note: (r.note as string | null) ?? null,
        changes,
      };
    });
  });

const decideSchema = z.object({
  requestId: z.string().uuid(),
  decision: z.enum(["approved", "rejected"]),
  reviewNote: z.string().max(2000).optional(),
});

export const decideChangeRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => decideSchema.parse(input))
  .handler(
    async ({
      data,
      context,
    }): Promise<{ ok: true; appliedFields: string[]; manualOnlyFields: string[] }> => {
      const caller = await loadAdminCaller(context.supabase, context.userId, "admin");
      return runGuarded(caller.role, "admin", makeAuditWriter(caller), async () => {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: req, error: reqErr } = await supabaseAdmin
          .from("staff_data_change_requests")
          .select("id, organization_id, staff_id, payload, status")
          .eq("id", data.requestId)
          .maybeSingle();
        if (reqErr) throw new Error(reqErr.message);
        if (!req) throw new Error("Antrag nicht gefunden.");
        if (req.organization_id !== caller.organizationId) throw new ForbiddenError();
        if (req.status !== "pending") throw new Error("Antrag ist nicht mehr offen.");

        const appliedFields: string[] = [];
        const manualOnlyFieldsList: string[] = [];

        if (data.decision === "approved") {
          const validation = validateChangeRequestPayload(req.payload as unknown);
          if (!validation.ok) throw new Error("Antragsdaten sind ungültig.");
          const { applicable, manualOnly } = splitApplicableFields(validation.value);
          manualOnlyFieldsList.push(...Object.keys(manualOnly));

          if (Object.keys(applicable).length > 0) {
            const { data: before, error: beforeErr } = await supabaseAdmin
              .from("staff_personal_details")
              .select(Object.keys(applicable).join(","))
              .eq("staff_id", req.staff_id as string)
              .maybeSingle();
            if (beforeErr) throw new Error(beforeErr.message);

            const upsertRow: Record<string, unknown> = {
              staff_id: req.staff_id,
              organization_id: caller.organizationId,
            };
            const diff: Record<string, { before: JsonPrimitive; after: JsonPrimitive }> = {};
            for (const [k, v] of Object.entries(applicable)) {
              const normalized = normalizeRequestValue(k as RequestField, v);
              upsertRow[k] = normalized;
              diff[k] = {
                before: toPrimitive((before as Record<string, unknown> | null)?.[k] ?? null),
                after: toPrimitive(normalized),
              };
              appliedFields.push(k);
            }
            const { error: upErr } = await supabaseAdmin
              .from("staff_personal_details")
              .upsert(upsertRow as never, { onConflict: "staff_id" });
            if (upErr) throw new Error(upErr.message);

            const { error: statusErr } = await supabaseAdmin
              .from("staff_data_change_requests")
              .update({
                status: "approved",
                review_note: data.reviewNote ?? null,
                reviewed_by: caller.staffId,
                reviewed_at: new Date().toISOString(),
              })
              .eq("id", data.requestId);
            if (statusErr) throw new Error(statusErr.message);

            return {
              result: {
                ok: true as const,
                appliedFields,
                manualOnlyFields: manualOnlyFieldsList,
              },
              audit: {
                action: "profile.request_approved",
                entity: "staff_data_change_requests",
                entityId: data.requestId,
                meta: { diff, manualOnly: manualOnlyFieldsList },
              },
            };
          }
          // Nur Namensfelder — nichts persistierbar, aber Antrag als approved markieren.
          const { error: statusErr } = await supabaseAdmin
            .from("staff_data_change_requests")
            .update({
              status: "approved",
              review_note: data.reviewNote ?? null,
              reviewed_by: caller.staffId,
              reviewed_at: new Date().toISOString(),
            })
            .eq("id", data.requestId);
          if (statusErr) throw new Error(statusErr.message);
          return {
            result: {
              ok: true as const,
              appliedFields: [],
              manualOnlyFields: manualOnlyFieldsList,
            },
            audit: {
              action: "profile.request_approved",
              entity: "staff_data_change_requests",
              entityId: data.requestId,
              meta: { diff: {}, manualOnly: manualOnlyFieldsList },
            },
          };
        }

        // rejected
        const { error: rejErr } = await supabaseAdmin
          .from("staff_data_change_requests")
          .update({
            status: "rejected",
            review_note: data.reviewNote ?? null,
            reviewed_by: caller.staffId,
            reviewed_at: new Date().toISOString(),
          })
          .eq("id", data.requestId);
        if (rejErr) throw new Error(rejErr.message);
        const rejectedFields = Object.keys((req.payload ?? {}) as Record<string, unknown>);
        return {
          result: { ok: true as const, appliedFields: [], manualOnlyFields: [] },
          audit: {
            action: "profile.request_rejected",
            entity: "staff_data_change_requests",
            entityId: data.requestId,
            meta: { fields: rejectedFields },
          },
        };
      });
    },
  );

export type ReviewPendingCounts = {
  pendingRequests: number;
  pendingDocuments: number;
  pendingLeaveRequests: number;
  swapPending: number;
};

export const getReviewPendingCounts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<ReviewPendingCounts> => {
    const caller = await loadAdminCaller(context.supabase, context.userId, "admin");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const [reqRes, docRes, leaveRes, swapRes] = await Promise.all([
      supabaseAdmin
        .from("staff_data_change_requests")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", caller.organizationId)
        .eq("status", "pending"),
      supabaseAdmin
        .from("staff_documents")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", caller.organizationId)
        .is("verified_at", null),
      supabaseAdmin
        .from("leave_requests")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", caller.organizationId)
        .eq("status", "pending"),
      supabaseAdmin
        .from("shift_swap_requests")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", caller.organizationId)
        .eq("status", "peer_accepted"),
    ]);
    if (reqRes.error) throw new Error(reqRes.error.message);
    if (docRes.error) throw new Error(docRes.error.message);
    if (leaveRes.error) throw new Error(leaveRes.error.message);
    if (swapRes.error) throw new Error(swapRes.error.message);
    return {
      pendingRequests: reqRes.count ?? 0,
      pendingDocuments: docRes.count ?? 0,
      pendingLeaveRequests: leaveRes.count ?? 0,
      swapPending: swapRes.count ?? 0,
    };
  });

export type AdminDocument = {
  id: string;
  staffId: string;
  staffName: string;
  docType: StaffDocumentType;
  originalFilename: string;
  mimeType: string;
  sizeBytes: number;
  validUntil: string | null;
  note: string | null;
  verifiedAt: string | null;
  verifiedBy: string | null;
  createdAt: string;
};

const listDocsSchema = z.object({ staffId: z.string().uuid().optional() });

export const listAllDocuments = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => listDocsSchema.parse(input))
  .handler(async ({ data, context }): Promise<AdminDocument[]> => {
    const caller = await loadAdminCaller(context.supabase, context.userId, "admin");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    let query = supabaseAdmin
      .from("staff_documents")
      .select(
        "id, staff_id, doc_type, original_filename, mime_type, size_bytes, valid_until, note, verified_at, verified_by, created_at",
      )
      .eq("organization_id", caller.organizationId)
      .order("valid_until", { ascending: true, nullsFirst: false });
    if (data.staffId) query = query.eq("staff_id", data.staffId);
    const { data: docs, error } = await query;
    if (error) throw new Error(error.message);
    const rows = docs ?? [];
    if (rows.length === 0) return [];
    const staffIds = Array.from(new Set(rows.map((r) => r.staff_id as string)));
    const { data: staff, error: staffErr } = await supabaseAdmin
      .from("staff")
      .select("id, first_name, last_name")
      .in("id", staffIds);
    if (staffErr) throw new Error(staffErr.message);
    const nameMap = new Map<string, string>();
    for (const s of staff ?? []) {
      const name = [s.first_name, s.last_name].filter(Boolean).join(" ") || "—";
      nameMap.set(s.id as string, name);
    }
    return rows.map((r) => ({
      id: r.id as string,
      staffId: r.staff_id as string,
      staffName: nameMap.get(r.staff_id as string) ?? "—",
      docType: r.doc_type as StaffDocumentType,
      originalFilename: r.original_filename as string,
      mimeType: r.mime_type as string,
      sizeBytes: Number(r.size_bytes),
      validUntil: (r.valid_until as string | null) ?? null,
      note: (r.note as string | null) ?? null,
      verifiedAt: (r.verified_at as string | null) ?? null,
      verifiedBy: (r.verified_by as string | null) ?? null,
      createdAt: r.created_at as string,
    }));
  });

export const getDocumentUrlAdmin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ documentId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }): Promise<{ url: string }> => {
    const caller = await loadAdminCaller(context.supabase, context.userId, "admin");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: doc, error } = await supabaseAdmin
      .from("staff_documents")
      .select("staff_id, organization_id, file_path")
      .eq("id", data.documentId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!doc || doc.organization_id !== caller.organizationId) throw new ForbiddenError();
    if (
      !isStaffDocumentPathAllowed(
        doc.file_path as string,
        doc.organization_id as string,
        doc.staff_id as string,
      )
    ) {
      throw new ForbiddenError();
    }
    const { data: signed, error: signErr } = await supabaseAdmin.storage
      .from(BUCKET)
      .createSignedUrl(doc.file_path as string, 60);
    if (signErr || !signed) throw new Error(signErr?.message ?? "Signed URL fehlgeschlagen.");
    return { url: signed.signedUrl };
  });

export const verifyDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ documentId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    const caller = await loadAdminCaller(context.supabase, context.userId, "admin");
    return runGuarded(caller.role, "admin", makeAuditWriter(caller), async () => {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data: doc, error: getErr } = await supabaseAdmin
        .from("staff_documents")
        .select("id, organization_id")
        .eq("id", data.documentId)
        .maybeSingle();
      if (getErr) throw new Error(getErr.message);
      if (!doc || doc.organization_id !== caller.organizationId) throw new ForbiddenError();
      const { error: updErr } = await supabaseAdmin
        .from("staff_documents")
        .update({
          verified_by: caller.staffId,
          verified_at: new Date().toISOString(),
        })
        .eq("id", data.documentId);
      if (updErr) throw new Error(updErr.message);
      return {
        result: { ok: true as const },
        audit: {
          action: "profile.document_verified",
          entity: "staff_documents",
          entityId: data.documentId,
        },
      };
    });
  });

export const deleteDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ documentId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    const caller = await loadAdminCaller(context.supabase, context.userId, "admin");
    return runGuarded(caller.role, "admin", makeAuditWriter(caller), async () => {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data: doc, error: getErr } = await supabaseAdmin
        .from("staff_documents")
        .select(
          "id, organization_id, staff_id, doc_type, original_filename, mime_type, size_bytes, valid_until, file_path",
        )
        .eq("id", data.documentId)
        .maybeSingle();
      if (getErr) throw new Error(getErr.message);
      if (!doc || doc.organization_id !== caller.organizationId) throw new ForbiddenError();
      const { error: rmErr } = await supabaseAdmin.storage
        .from(BUCKET)
        .remove([doc.file_path as string]);
      if (rmErr) throw new Error(rmErr.message);
      const { error: delErr } = await supabaseAdmin
        .from("staff_documents")
        .delete()
        .eq("id", data.documentId);
      if (delErr) throw new Error(delErr.message);
      return {
        result: { ok: true as const },
        audit: {
          action: "profile.document_deleted",
          entity: "staff_documents",
          entityId: data.documentId,
          meta: {
            snapshot: {
              staffId: doc.staff_id,
              docType: doc.doc_type,
              originalFilename: doc.original_filename,
              mimeType: doc.mime_type,
              sizeBytes: Number(doc.size_bytes),
              validUntil: doc.valid_until,
            },
          },
        },
      };
    });
  });

// ── V2 Dokumentengenerierung — Admin-Upload eines Mitarbeiter-Dokuments ──
// Muster wie uploadMyDocument (profile.functions.ts). Unterschiede:
//   * Rolle admin statt staff; staffId kommt vom Client (Admin wählt MA)
//     und wird org-geprüft, bevor irgendetwas Storage-seitiges passiert.
//   * uploaded_by = caller.staffId (Admin), verified_by bleibt unberührt —
//     der Sichtvermerk läuft weiter über verifyDocument (separater Schritt).
//   * Bei DB-Insert-Fehler nach erfolgreichem Upload wird die Datei wieder
//     entfernt, damit kein Waisen-Objekt im Bucket bleibt.

function decodeBase64Length(b64: string): number {
  const clean = b64.replace(/\s+/g, "");
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(clean)) return -1;
  const pad = clean.endsWith("==") ? 2 : clean.endsWith("=") ? 1 : 0;
  return Math.floor((clean.length * 3) / 4) - pad;
}

const adminUploadSchema = z.object({
  staffId: z.string().uuid(),
  docType: z.enum(DOC_TYPES),
  fileName: z.string().min(1),
  contentBase64: z.string().min(1),
  mimeType: z.string().min(1),
  validUntil: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  note: z.string().max(1000).optional(),
});

export const adminUploadStaffDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => adminUploadSchema.parse(input))
  .handler(async ({ data, context }): Promise<{ id: string; path: string }> => {
    const caller = await loadAdminCaller(context.supabase, context.userId, "admin");
    const ext = extensionForMime(data.mimeType);
    if (!ext) throw new Error("Dateityp nicht erlaubt (nur JPG/PNG/PDF).");
    if (!ALLOWED_DOC_MIME[data.mimeType]) throw new Error("Dateityp nicht erlaubt.");
    const size = decodeBase64Length(data.contentBase64);
    if (size <= 0) throw new Error("Datei ist ungültig.");
    if (size > MAX_DOC_SIZE_BYTES) throw new Error("Datei ist zu groß (max. 10 MB).");
    const originalName = sanitizeDocumentFileName(data.fileName);
    if (!originalName) throw new Error("Ungültiger Dateiname.");

    return runGuarded(caller.role, "admin", makeAuditWriter(caller), async () => {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

      // Ziel-Staff org-geprüft laden — staffId darf die Org nicht verlassen.
      const { data: staff, error: sErr } = await supabaseAdmin
        .from("staff")
        .select("id")
        .eq("id", data.staffId)
        .eq("organization_id", caller.organizationId)
        .maybeSingle();
      if (sErr) throw new Error(sErr.message);
      if (!staff) throw new ForbiddenError();

      const folder = staffDocumentFolder(
        caller.organizationId,
        data.staffId,
        data.docType as StaffDocumentType,
      );
      const uuid = crypto.randomUUID();
      const path = `${folder}/${uuid}.${ext}`;
      // Pfadgüte VOR jedem Storage-Zugriff prüfen (SP1-Muster, §36).
      if (!isStaffDocumentPathAllowed(path, caller.organizationId, data.staffId)) {
        throw new ForbiddenError();
      }

      const bytes = Uint8Array.from(atob(data.contentBase64.replace(/\s+/g, "")), (c) =>
        c.charCodeAt(0),
      );
      const { error: upErr } = await supabaseAdmin.storage
        .from(BUCKET)
        .upload(path, bytes, { contentType: data.mimeType, upsert: false });
      if (upErr) throw new Error(upErr.message);

      const { data: inserted, error: insErr } = await supabaseAdmin
        .from("staff_documents")
        .insert({
          organization_id: caller.organizationId,
          staff_id: data.staffId,
          doc_type: data.docType,
          file_path: path,
          original_filename: originalName,
          mime_type: data.mimeType,
          size_bytes: size,
          valid_until: data.validUntil ?? null,
          note: data.note ?? null,
          uploaded_by: caller.staffId,
        })
        .select("id")
        .single();
      if (insErr) {
        await supabaseAdmin.storage.from(BUCKET).remove([path]);
        throw new Error(insErr.message);
      }
      return {
        result: { id: inserted.id, path },
        audit: {
          action: "staff_document.admin_upload",
          entity: "staff_documents",
          entityId: inserted.id,
          meta: { staffId: data.staffId, docType: data.docType, filename: originalName },
        },
      };
    });
  });
