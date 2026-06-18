// Wrapper für jede schreibende Admin-/Manager-Aktion in B1c.
//
// Zweck: garantiert, dass die Rollenprüfung VOR dem Audit-Schreiben passiert
// und audit_log NUR dann beschrieben wird, wenn die Operation erfolgreich war.
// Wenn die Rolle nicht ausreicht: ForbiddenError fliegt — writeAudit wird
// nicht aufgerufen (Negativtest b in docs/gruendungsdokument.md).

import { assertMinRole, ForbiddenError, type AppRole } from "./role-guard";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import type { AppPermission } from "./permissions-catalog";

export type AuditEntry = {
  action: string;
  entity: string;
  entityId?: string;
  meta?: Record<string, unknown>;
};

export type AuditWriter = (entry: AuditEntry) => Promise<void>;

/**
 * Führt `op` nur aus, wenn die Aufruferrolle `minRole` erfüllt, und schreibt
 * danach einen audit_log-Eintrag. Bei ForbiddenError wird `writeAudit` nicht
 * aufgerufen. Bei Fehler in `op` wird `writeAudit` ebenfalls nicht aufgerufen.
 */
export async function runGuarded<T>(
  callerRole: AppRole | null,
  minRole: AppRole,
  writeAudit: AuditWriter,
  op: () => Promise<{ result: T; audit: AuditEntry }>,
): Promise<T> {
  assertMinRole(callerRole, minRole);
  const { result, audit } = await op();
  await writeAudit(audit);
  return result;
}

/**
 * Prüft `has_permission(key, location)` über den nutzergebundenen Supabase-
 * Client (RLS-Kontext = Aufrufer; greift damit auch durch Impersonation).
 * Wirft ForbiddenError, wenn das Recht fehlt — und zwar VOR der Operation,
 * sodass kein audit_log-Eintrag entsteht.
 */
export async function assertPermission(
  supabase: SupabaseClient<Database>,
  permission: AppPermission,
  locationId: string | null = null,
): Promise<void> {
  const { data, error } = await supabase.rpc("has_permission", {
    _perm: permission,
    ...(locationId !== null ? { _location: locationId } : {}),
  });
  if (error) {
    throw new ForbiddenError(`Rechte-Check fehlgeschlagen: ${error.message}`);
  }
  if (!data) {
    throw new ForbiddenError(`Fehlende Berechtigung: ${permission}`);
  }
}

/**
 * Analog zu `runGuarded`, aber mit Permission-Key statt Mindestrolle.
 * Bei ForbiddenError wird `writeAudit` nicht aufgerufen.
 */
export async function runWithPermission<T>(
  supabase: SupabaseClient<Database>,
  permission: AppPermission,
  locationId: string | null,
  writeAudit: AuditWriter,
  op: () => Promise<{ result: T; audit: AuditEntry }>,
): Promise<T> {
  await assertPermission(supabase, permission, locationId);
  const { result, audit } = await op();
  await writeAudit(audit);
  return result;
}
