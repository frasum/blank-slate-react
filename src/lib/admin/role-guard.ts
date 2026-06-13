// Reine Rollenprüfung — keine I/O, keine DB. Wird in jeder
// schreibenden Server-Function VOR dem ersten DB-Schreibvorgang aufgerufen.
//
// ForbiddenError fliegt aus dem Handler raus, bevor irgendein audit_log-
// Eintrag erzeugt wird — siehe Negativtest (b) in docs/gruendungsdokument.md.

export type AppRole = "admin" | "manager" | "staff";

const RANK: Record<AppRole, number> = { staff: 1, manager: 2, admin: 3 };

export class ForbiddenError extends Error {
  constructor(message = "Forbidden") {
    super(message);
    this.name = "ForbiddenError";
  }
}

export function hasMinRole(actual: AppRole | null, min: AppRole): boolean {
  if (!actual) return false;
  return RANK[actual] >= RANK[min];
}

export function assertMinRole(actual: AppRole | null, min: AppRole): void {
  if (!hasMinRole(actual, min)) {
    throw new ForbiddenError();
  }
}
