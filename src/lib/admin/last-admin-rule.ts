// Reine Geschäftsregel: „Es muss in jeder Organisation IMMER mindestens
// ein aktiver Admin existieren."
//
// Vor jeder schreibenden Aktion, die Rolle oder Aktiv-Status eines
// Mitarbeiters verändert (setStaffActive, setStaffRole, updateStaffBasics
// mit is_active-Wechsel), wird `wouldRemoveLastActiveAdmin` mit dem
// IST-Snapshot und der geplanten Änderung aufgerufen. Liefert sie true,
// wird die Aktion mit einem Fehler abgelehnt — KEIN Schreibvorgang,
// KEIN audit_log-Eintrag.

import type { AppRole } from "./role-guard";

export type AdminSnapshotEntry = {
  staffId: string;
  isActive: boolean;
  role: AppRole | null;
};

export type AdminChange = {
  staffId: string;
  nextActive?: boolean;
  nextRole?: AppRole | null;
};

export function wouldRemoveLastActiveAdmin(
  snapshot: AdminSnapshotEntry[],
  change: AdminChange,
): boolean {
  const after = snapshot.map((entry) => {
    if (entry.staffId !== change.staffId) return entry;
    return {
      staffId: entry.staffId,
      isActive: change.nextActive ?? entry.isActive,
      role: change.nextRole !== undefined ? change.nextRole : entry.role,
    };
  });
  const activeAdminsAfter = after.filter((e) => e.isActive && e.role === "admin").length;
  return activeAdminsAfter < 1;
}