// Reine Klassifizierung Datei → staff. Keine DB.

import type { ParsedPayslipName } from "./payslip-filename";

export type AssignStatus =
  | "matched"
  | "matched_inactive"
  | "unknown_perso"
  | "ambiguous"
  | "unparsable";

export type StaffLite = { id: string; display_name: string; is_active: boolean };

export type AssignDecision = {
  fileName: string;
  persoNr: number | null;
  staffId: string | null;
  displayName: string | null;
  status: AssignStatus;
};

/**
 * Klassifiziert eine Datei anhand des Parse-Ergebnisses und der bereits
 * gefilterten staff-Zeilen (org-scoped + perso_nr). Mehrdeutige Treffer
 * werden als `ambiguous` markiert — Sicherheitsnetz, kein Upload.
 */
export function classifyAssignment(
  fileName: string,
  parsed: ParsedPayslipName | null,
  staffRows: StaffLite[],
): AssignDecision {
  if (!parsed) {
    return { fileName, persoNr: null, staffId: null, displayName: null, status: "unparsable" };
  }
  if (staffRows.length === 0) {
    return {
      fileName,
      persoNr: parsed.persoNr,
      staffId: null,
      displayName: null,
      status: "unknown_perso",
    };
  }
  if (staffRows.length > 1) {
    return {
      fileName,
      persoNr: parsed.persoNr,
      staffId: null,
      displayName: null,
      status: "ambiguous",
    };
  }
  const row = staffRows[0];
  return {
    fileName,
    persoNr: parsed.persoNr,
    staffId: row.id,
    displayName: row.display_name,
    status: row.is_active ? "matched" : "matched_inactive",
  };
}
