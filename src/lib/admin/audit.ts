// Schreibt einen Eintrag ins append-only audit_log.
// supabaseAdmin wird dynamic-importiert, damit das Modul nicht ins
// Client-Bundle leakt (siehe tanstack-supabase-import-graph).
//
// audit_log hat keine Client-RLS-Policies (DENY-ALL); nur service_role
// darf schreiben. Es gibt im Code KEINEN UPDATE-/DELETE-Pfad.

import type { Json } from "@/integrations/supabase/types";

export type AuditLogInput = {
  organizationId: string;
  actorUserId: string;
  actorStaffId: string | null;
  action: string;
  entity: string;
  entityId?: string | null;
  meta?: Record<string, unknown>;
};

export async function writeAuditLog(entry: AuditLogInput): Promise<void> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { error } = await supabaseAdmin.from("audit_log").insert({
    organization_id: entry.organizationId,
    actor_user_id: entry.actorUserId,
    actor_staff_id: entry.actorStaffId,
    action: entry.action,
    entity: entry.entity,
    entity_id: entry.entityId ?? null,
    meta: (entry.meta ?? {}) as Json,
  });
  if (error) {
    // Audit ist Pflicht. Wenn der Schreibvorgang fehlschlägt, ist das ein
    // schwerer Fehler — sichtbar machen, nicht still schlucken.
    throw new Error(`audit_log insert failed: ${error.message}`);
  }
}

// Kanonischer Audit-Writer-Factory. Wird von runGuarded/runWithPermission als
// `writeAudit`-Callback erwartet. Akzeptiert sowohl `staffId: string` als auch
// `staffId: string | null` (writeAuditLog speichert beides unverändert).
export function makeAuditWriter(caller: {
  organizationId: string;
  userId: string;
  staffId: string | null;
}) {
  return async (entry: {
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
}
