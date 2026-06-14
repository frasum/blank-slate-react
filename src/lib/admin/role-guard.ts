// Reine Rollenprüfung — keine I/O, keine DB. Wird in jeder
// schreibenden Server-Function VOR dem ersten DB-Schreibvorgang aufgerufen.
//
// ForbiddenError fliegt aus dem Handler raus, bevor irgendein audit_log-
// Eintrag erzeugt wird — siehe Negativtest (b) in docs/gruendungsdokument.md.

// 'payroll' ist eine SEITENROLLE und nicht Teil der Hierarchie
// admin > manager > staff. hasMinRole(payroll, *) liefert deshalb immer false
// — payroll-Rechte werden explizit über assertRoleAllowed/has_role gewährt.
export type AppRole = "admin" | "manager" | "staff" | "payroll";

const RANK: Record<AppRole, number> = { payroll: 0, staff: 1, manager: 2, admin: 3 };

export class ForbiddenError extends Error {
  constructor(message = "Forbidden") {
    super(message);
    this.name = "ForbiddenError";
  }
}

export function hasMinRole(actual: AppRole | null, min: AppRole): boolean {
  if (!actual) return false;
  // payroll steht ausserhalb der Hierarchie und erfüllt KEINE Mindestrolle.
  if (actual === "payroll" || min === "payroll") return actual === min;
  return RANK[actual] >= RANK[min];
}

export function assertMinRole(actual: AppRole | null, min: AppRole): void {
  if (!hasMinRole(actual, min)) {
    throw new ForbiddenError();
  }
}

export function isRoleAllowed(actual: AppRole | null, allowed: readonly AppRole[]): boolean {
  return actual !== null && allowed.includes(actual);
}

export function assertRoleAllowed(actual: AppRole | null, allowed: readonly AppRole[]): void {
  if (!isRoleAllowed(actual, allowed)) {
    throw new ForbiddenError();
  }
}
