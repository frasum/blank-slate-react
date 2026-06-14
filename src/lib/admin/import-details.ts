// Reines Mapping-/Diff-Modul für `importStaffPersonalDetails` (Welle 2).
// Keine I/O — alle Daten kommen als Parameter rein. Das Ergebnis ist ein
// Plan-Objekt mit Diff je MA, Skip-Liste, Bilanz. Sensible Felder werden im
// Bericht-Diff maskiert (kein Klartext in Plan/Audit).

export type DetailsRowInput = {
  /** Personalnummer aus thaitime (Text mit führenden Nullen). */
  personnelNumber: string;
  firstName: string;
  lastName: string;
  salutation: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  dateOfBirth: string | null;
  placeOfBirth: string | null;
  nationality: string | null;
  taxClass: string | null;
  taxId: string | null;
  socialSecurityNumber: string | null;
  isMinijob: boolean | null;
  isSvExempt: boolean | null;
  healthInsurance: string | null;
  churchTaxLiable: boolean | null;
  childTaxAllowances: number | null;
  iban: string | null;
  bankName: string | null;
  accountHolder: string | null;
  employmentStartDate: string | null;
  employmentEndDate: string | null;
  personnelGroup: string | null;
  jobTitle: string | null;
  vacationDaysContractual: number | null;
  vacationDaysPreviousYear: number | null;
  vacationDaysCurrentYear: number | null;
  vacationDaysTaken: number | null;
};

/** Felder, die im Bericht/Audit niemals im Klartext erscheinen. */
export const SENSITIVE_FIELDS = ["iban", "social_security_number", "tax_id"] as const;
export type SensitiveField = (typeof SENSITIVE_FIELDS)[number];

export type DetailsSkipReason = "unknown_personnel_number" | "ambiguous_or_null_perso_nr";
export type SkippedDetailsRow = {
  reason: DetailsSkipReason;
  personnelNumber: string;
  firstName?: string;
  lastName?: string;
};

/** Felder der Datenbankzeile, gemappt aus DetailsRowInput. */
export type DetailsDbFields = {
  phone: string | null;
  email: string | null;
  address: string | null;
  date_of_birth: string | null;
  place_of_birth: string | null;
  salutation: string | null;
  nationality: string | null;
  tax_class: string | null;
  tax_id: string | null;
  social_security_number: string | null;
  is_minijob: boolean | null;
  is_sv_exempt: boolean | null;
  health_insurance: string | null;
  church_tax_liable: boolean | null;
  child_tax_allowances: number | null;
  iban: string | null;
  bank_name: string | null;
  account_holder: string | null;
  employment_start_date: string | null;
  employment_end_date: string | null;
  personnel_group: string | null;
  job_title: string | null;
  vacation_days_contractual: number | null;
  vacation_days_previous_year: number | null;
  vacation_days_current_year: number | null;
  vacation_days_taken: number | null;
};

export type CurrentDetailsRow = { staffId: string } & Partial<DetailsDbFields>;

export type FieldDiffState = "set" | "changed" | "unchanged";
export type DiffValue = string | number | boolean | null;
/** Diff-Eintrag: bei sensiblen Feldern werden Werte unterdrückt. */
export type DetailsFieldDiff = {
  field: keyof DetailsDbFields;
  state: FieldDiffState;
  sensitive: boolean;
  /** Nur für nicht-sensible Felder befüllt. */
  from?: DiffValue;
  to?: DiffValue;
};

export type DetailsOp =
  | { op: "insert"; staffId: string; fields: Partial<DetailsDbFields> }
  | { op: "update"; staffId: string; fields: Partial<DetailsDbFields> };

export type DetailsStaffDiff = {
  staffId: string;
  personnelNumber: string;
  firstName: string;
  lastName: string;
  op: "insert" | "update" | "noop";
  fieldDiffs: DetailsFieldDiff[];
};

export type DetailsPlan = {
  perStaff: DetailsStaffDiff[];
  ops: DetailsOp[];
  skippedRows: SkippedDetailsRow[];
  totals: {
    rows: number;
    staff: number;
    inserts: number;
    updates: number;
    fieldsTouched: number;
    skippedCount: number;
  };
};

export type ComputeDetailsPlanInput = {
  rows: DetailsRowInput[];
  /** perso_nr (int) → staff_id. Eindeutige Treffer. */
  staffByPersoNr: Map<number, string>;
  /** Set der perso_nr-Werte mit >1 staff-Treffer (ambiguous). */
  ambiguousPersoNrs: Set<number>;
  /** staffId → bestehende Detail-Zeile (UPSERT-Quelle). */
  currentDetails: Map<string, CurrentDetailsRow>;
};

function mapInputToDbFields(row: DetailsRowInput): DetailsDbFields {
  return {
    phone: row.phone,
    email: row.email,
    address: row.address,
    date_of_birth: row.dateOfBirth,
    place_of_birth: row.placeOfBirth,
    salutation: row.salutation,
    nationality: row.nationality,
    tax_class: row.taxClass,
    tax_id: row.taxId,
    social_security_number: row.socialSecurityNumber,
    is_minijob: row.isMinijob,
    is_sv_exempt: row.isSvExempt,
    health_insurance: row.healthInsurance,
    church_tax_liable: row.churchTaxLiable,
    child_tax_allowances: row.childTaxAllowances,
    iban: row.iban,
    bank_name: row.bankName,
    account_holder: row.accountHolder,
    employment_start_date: row.employmentStartDate,
    employment_end_date: row.employmentEndDate,
    personnel_group: row.personnelGroup,
    job_title: row.jobTitle,
    vacation_days_contractual: row.vacationDaysContractual,
    vacation_days_previous_year: row.vacationDaysPreviousYear,
    vacation_days_current_year: row.vacationDaysCurrentYear,
    vacation_days_taken: row.vacationDaysTaken,
  };
}

const DB_FIELD_NAMES = [
  "phone",
  "email",
  "address",
  "date_of_birth",
  "place_of_birth",
  "salutation",
  "nationality",
  "tax_class",
  "tax_id",
  "social_security_number",
  "is_minijob",
  "is_sv_exempt",
  "health_insurance",
  "church_tax_liable",
  "child_tax_allowances",
  "iban",
  "bank_name",
  "account_holder",
  "employment_start_date",
  "employment_end_date",
  "personnel_group",
  "job_title",
  "vacation_days_contractual",
  "vacation_days_previous_year",
  "vacation_days_current_year",
  "vacation_days_taken",
] as const satisfies ReadonlyArray<keyof DetailsDbFields>;

function isSensitive(field: keyof DetailsDbFields): boolean {
  return (SENSITIVE_FIELDS as readonly string[]).includes(field);
}

function parsePersoNr(raw: string): number | null {
  const trimmed = raw.trim();
  if (trimmed.length === 0) return null;
  // Entferne führende Nullen via parseInt(.., 10).
  const n = parseInt(trimmed, 10);
  return Number.isInteger(n) ? n : null;
}

export function computeDetailsPlan(input: ComputeDetailsPlanInput): DetailsPlan {
  const perStaff: DetailsStaffDiff[] = [];
  const ops: DetailsOp[] = [];
  const skipped: SkippedDetailsRow[] = [];
  const touched = new Set<string>();
  let fieldsTouched = 0;

  for (const row of input.rows) {
    const persoNr = parsePersoNr(row.personnelNumber);
    if (persoNr === null) {
      skipped.push({
        reason: "unknown_personnel_number",
        personnelNumber: row.personnelNumber,
        firstName: row.firstName,
        lastName: row.lastName,
      });
      continue;
    }
    if (input.ambiguousPersoNrs.has(persoNr)) {
      skipped.push({
        reason: "ambiguous_or_null_perso_nr",
        personnelNumber: row.personnelNumber,
        firstName: row.firstName,
        lastName: row.lastName,
      });
      continue;
    }
    const staffId = input.staffByPersoNr.get(persoNr);
    if (!staffId) {
      skipped.push({
        reason: "unknown_personnel_number",
        personnelNumber: row.personnelNumber,
        firstName: row.firstName,
        lastName: row.lastName,
      });
      continue;
    }
    if (touched.has(staffId)) continue;
    touched.add(staffId);

    const incoming = mapInputToDbFields(row);
    const current = input.currentDetails.get(staffId);
    const writeFields: Partial<DetailsDbFields> = {};
    const fieldDiffs: DetailsFieldDiff[] = [];

    for (const field of DB_FIELD_NAMES) {
      const newVal = incoming[field];
      // Leere CSV-Werte (null) NICHT schreiben — bestehender Wert bleibt.
      if (newVal === null || newVal === undefined) continue;
      const oldVal = current ? (current[field] ?? null) : null;
      const sensitive = isSensitive(field);
      if (oldVal === newVal) {
        fieldDiffs.push({
          field,
          state: "unchanged",
          sensitive,
          ...(sensitive ? {} : { from: oldVal as DiffValue, to: newVal as DiffValue }),
        });
        continue;
      }
      // Wert ändert sich (oder ist neu).
      (writeFields as Record<string, unknown>)[field] = newVal as unknown;
      const state: FieldDiffState = current ? "changed" : "set";
      fieldDiffs.push({
        field,
        state,
        sensitive,
        ...(sensitive ? {} : { from: oldVal as DiffValue, to: newVal as DiffValue }),
      });
      fieldsTouched++;
    }

    let op: DetailsStaffDiff["op"] = "noop";
    if (Object.keys(writeFields).length > 0) {
      if (current) {
        ops.push({ op: "update", staffId, fields: writeFields });
        op = "update";
      } else {
        ops.push({ op: "insert", staffId, fields: writeFields });
        op = "insert";
      }
    } else if (!current) {
      // Keine Felder im CSV vorhanden UND noch keine Zeile → kein leerer Insert.
      op = "noop";
    }

    perStaff.push({
      staffId,
      personnelNumber: row.personnelNumber,
      firstName: row.firstName,
      lastName: row.lastName,
      op,
      fieldDiffs,
    });
  }

  const inserts = ops.filter((o) => o.op === "insert").length;
  const updates = ops.filter((o) => o.op === "update").length;

  return {
    perStaff,
    ops,
    skippedRows: skipped,
    totals: {
      rows: input.rows.length,
      staff: touched.size,
      inserts,
      updates,
      fieldsTouched,
      skippedCount: skipped.length,
    },
  };
}

/** SHA-256 der normalisierten Eingabe (Audit-Reproduzierbarkeit, ohne Klartext-Werte). */
export async function hashDetailsInput(rows: DetailsRowInput[]): Promise<string> {
  // Sortiere nach personnelNumber für stabilen Hash.
  const norm = [...rows].sort((a, b) => a.personnelNumber.localeCompare(b.personnelNumber));
  const buf = new TextEncoder().encode(JSON.stringify(norm));
  const digest = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export { DB_FIELD_NAMES };
