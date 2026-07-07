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
import type { StaffDepartment } from "@/lib/staff-domain";

export type AuditEntry = {
  action: string;
  entity: string;
  entityId?: string;
  meta?: Record<string, unknown>;
};

export type AuditWriter = (entry: AuditEntry) => Promise<void>;

/**
 * Optionaler Kontext für Monitoring (P1). Wird bei Fehlern an Sentry
 * mitgesendet, ist aber KEIN Pflichtparameter — bestehende Aufrufer bleiben
 * unverändert. Kritische Geldpfade (Kassen-Finalize, Lohn, Bestellung)
 * sollten `op` und `orgId` setzen und `critical: true` markieren.
 */
export type GuardedCallContext = {
  op?: string;
  orgId?: string | null;
  callerStaffId?: string | null;
  critical?: boolean;
  tags?: Record<string, string | number | boolean | null | undefined>;
};

async function reportGuardedFailure(
  err: unknown,
  callerRole: AppRole | null,
  ctx: GuardedCallContext | undefined,
): Promise<void> {
  // ForbiddenError ist erwartetes Fachverhalten (401/403), kein Monitoring-Fall.
  if (err instanceof ForbiddenError) return;
  try {
    const { captureServerError } = await import("@/lib/monitoring/sentry.server");
    await captureServerError(err, {
      op: ctx?.op,
      orgId: ctx?.orgId ?? null,
      callerStaffId: ctx?.callerStaffId ?? null,
      role: callerRole,
      critical: ctx?.critical,
      tags: ctx?.tags,
    });
  } catch {
    /* Monitoring darf nichts brechen. */
  }
}

/**
 * Führt `op` nur aus, wenn die Aufruferrolle `minRole` erfüllt, und schreibt
 * danach einen audit_log-Eintrag. Bei ForbiddenError wird `writeAudit` nicht
 * aufgerufen. Bei Fehler in `op` wird `writeAudit` ebenfalls nicht aufgerufen.
 *
 * P1 — Optionaler `ctx`-Parameter für Monitoring-Tags (Org, Route, Critical).
 * Fehler in `op` werden — außer ForbiddenError — an Sentry gemeldet, bevor sie
 * weitergereicht werden.
 */
export async function runGuarded<T>(
  callerRole: AppRole | null,
  minRole: AppRole,
  writeAudit: AuditWriter,
  op: () => Promise<{ result: T; audit: AuditEntry }>,
  ctx?: GuardedCallContext,
): Promise<T> {
  assertMinRole(callerRole, minRole);
  let result: T;
  let audit: AuditEntry;
  try {
    ({ result, audit } = await op());
  } catch (err) {
    await reportGuardedFailure(err, callerRole, ctx);
    throw err;
  }
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
  area: StaffDepartment | null = null,
): Promise<void> {
  const { data, error } = await supabase.rpc("has_permission", {
    _perm: permission,
    ...(locationId !== null ? { _location: locationId } : {}),
    ...(area !== null ? { _area: area } : {}),
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
 *
 * Signatur (P-2): area kann zwischen locationId und writeAudit übergeben
 * werden. Bestehende Aufrufer ohne area-Bedarf bleiben unverändert; die
 * Überladung erkennt die alte 5-Argument-Variante anhand des Function-Typs
 * im 4. Parameter.
 */
export async function runWithPermission<T>(
  supabase: SupabaseClient<Database>,
  permission: AppPermission,
  locationId: string | null,
  writeAudit: AuditWriter,
  op: () => Promise<{ result: T; audit: AuditEntry }>,
): Promise<T>;
export async function runWithPermission<T>(
  supabase: SupabaseClient<Database>,
  permission: AppPermission,
  locationId: string | null,
  area: StaffDepartment | null,
  writeAudit: AuditWriter,
  op: () => Promise<{ result: T; audit: AuditEntry }>,
): Promise<T>;
export async function runWithPermission<T>(
  supabase: SupabaseClient<Database>,
  permission: AppPermission,
  locationId: string | null,
  arg4: AuditWriter | StaffDepartment | null,
  arg5: AuditWriter | (() => Promise<{ result: T; audit: AuditEntry }>),
  arg6?: () => Promise<{ result: T; audit: AuditEntry }>,
  ctx?: GuardedCallContext,
): Promise<T> {
  let area: StaffDepartment | null = null;
  let writeAudit: AuditWriter;
  let op: () => Promise<{ result: T; audit: AuditEntry }>;
  if (typeof arg4 === "function") {
    writeAudit = arg4 as AuditWriter;
    op = arg5 as () => Promise<{ result: T; audit: AuditEntry }>;
  } else {
    area = (arg4 as StaffDepartment | null) ?? null;
    writeAudit = arg5 as AuditWriter;
    op = arg6 as () => Promise<{ result: T; audit: AuditEntry }>;
  }
  await assertPermission(supabase, permission, locationId, area);
  let result: T;
  let audit: AuditEntry;
  try {
    ({ result, audit } = await op());
  } catch (err) {
    await reportGuardedFailure(err, null, ctx);
    throw err;
  }
  await writeAudit(audit);
  return result;
}
