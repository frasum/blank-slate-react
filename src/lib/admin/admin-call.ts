// Wrapper für jede schreibende Admin-/Manager-Aktion in B1c.
//
// Zweck: garantiert, dass die Rollenprüfung VOR dem Audit-Schreiben passiert
// und audit_log NUR dann beschrieben wird, wenn die Operation erfolgreich war.
// Wenn die Rolle nicht ausreicht: ForbiddenError fliegt — writeAudit wird
// nicht aufgerufen (Negativtest b in docs/gruendungsdokument.md).

import { assertMinRole, type AppRole } from "./role-guard";

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
