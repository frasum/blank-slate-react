// Pure CSV-Parser für Personaldaten Welle 2 (sensible Daten).
// Semikolon, BOM-toleriert, Trim, leere Zellen → null.
// Deutsche Boolean-Konventionen: ja/nein, true/false, 1/0, x/leer.
// Dezimal-Komma → Punkt für child_tax_allowances.

import type { DetailsRowInput } from "./import-details";

export type DetailsParseWarning =
  | { kind: "missing_field"; row: number; field: string }
  | { kind: "invalid_number"; row: number; field: string; raw: string }
  | { kind: "invalid_boolean"; row: number; field: string; raw: string }
  | { kind: "invalid_date"; row: number; field: string; raw: string };

export type DetailsParseResult = {
  rows: DetailsRowInput[];
  warnings: DetailsParseWarning[];
};

function stripBom(s: string): string {
  return s.charCodeAt(0) === 0xfeff ? s.slice(1) : s;
}
function splitLines(csv: string): string[] {
  return stripBom(csv)
    .split(/\r?\n/)
    .map((l) => l.replace(/\s+$/, ""))
    .filter((l) => l.length > 0);
}
function splitRow(line: string): string[] {
  return line.split(";").map((c) => c.trim());
}

function emptyOr(s: string | undefined): string | null {
  if (s === undefined) return null;
  const t = s.trim();
  return t.length === 0 ? null : t;
}

function parseBool(
  raw: string | null,
  field: string,
  row: number,
  warnings: DetailsParseWarning[],
): boolean | null {
  if (raw === null) return null;
  const v = raw.toLowerCase();
  if (["ja", "yes", "true", "1", "x"].includes(v)) return true;
  if (["nein", "no", "false", "0"].includes(v)) return false;
  warnings.push({ kind: "invalid_boolean", row, field, raw });
  return null;
}

function parseNum(
  raw: string | null,
  field: string,
  row: number,
  warnings: DetailsParseWarning[],
): number | null {
  if (raw === null) return null;
  const v = Number(raw.replace(",", "."));
  if (!Number.isFinite(v)) {
    warnings.push({ kind: "invalid_number", row, field, raw });
    return null;
  }
  return v;
}

function parseInt2(
  raw: string | null,
  field: string,
  row: number,
  warnings: DetailsParseWarning[],
): number | null {
  const n = parseNum(raw, field, row, warnings);
  if (n === null) return null;
  if (!Number.isInteger(n)) {
    warnings.push({ kind: "invalid_number", row, field, raw: String(raw) });
    return null;
  }
  return n;
}

function parseDate(
  raw: string | null,
  field: string,
  row: number,
  warnings: DetailsParseWarning[],
): string | null {
  if (raw === null) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const m = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(raw);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  warnings.push({ kind: "invalid_date", row, field, raw });
  return null;
}

const REQUIRED = ["personnel_number", "first_name", "last_name"] as const;

export function parseDetailsCsv(csv: string): DetailsParseResult {
  const lines = splitLines(csv);
  const warnings: DetailsParseWarning[] = [];
  const rows: DetailsRowInput[] = [];
  if (lines.length === 0) return { rows, warnings };

  const header = splitRow(lines[0]).map((c) => c.toLowerCase());
  const idx = new Map<string, number>();
  header.forEach((c, i) => idx.set(c, i));
  for (const req of REQUIRED) {
    if (!idx.has(req)) {
      throw new Error(`Details-CSV: Pflichtspalte "${req}" fehlt.`);
    }
  }
  const col = (name: string, line: string[]): string | null => {
    const i = idx.get(name);
    if (i === undefined) return null;
    return emptyOr(line[i]);
  };

  for (let r = 1; r < lines.length; r++) {
    const cols = splitRow(lines[r]);
    const personnelNumber = col("personnel_number", cols);
    const firstName = col("first_name", cols);
    const lastName = col("last_name", cols);
    if (!personnelNumber) {
      warnings.push({ kind: "missing_field", row: r, field: "personnel_number" });
      continue;
    }
    if (!firstName) {
      warnings.push({ kind: "missing_field", row: r, field: "first_name" });
      continue;
    }
    if (!lastName) {
      warnings.push({ kind: "missing_field", row: r, field: "last_name" });
      continue;
    }

    rows.push({
      personnelNumber,
      firstName,
      lastName,
      salutation: col("salutation", cols),
      phone: col("phone", cols),
      email: col("email", cols),
      address: col("address", cols),
      dateOfBirth: parseDate(col("date_of_birth", cols), "date_of_birth", r, warnings),
      placeOfBirth: col("place_of_birth", cols),
      nationality: col("nationality", cols),
      taxClass: col("tax_class", cols),
      taxId: col("tax_id", cols),
      socialSecurityNumber: col("social_security_number", cols),
      isMinijob: parseBool(col("is_minijob", cols), "is_minijob", r, warnings),
      isSvExempt: parseBool(col("is_sv_exempt", cols), "is_sv_exempt", r, warnings),
      healthInsurance: col("health_insurance", cols),
      churchTaxLiable: parseBool(col("church_tax_liable", cols), "church_tax_liable", r, warnings),
      childTaxAllowances: parseNum(
        col("child_tax_allowances", cols),
        "child_tax_allowances",
        r,
        warnings,
      ),
      iban: col("iban", cols),
      bankName: col("bank_name", cols),
      accountHolder: col("account_holder", cols),
      employmentStartDate: parseDate(
        col("employment_start_date", cols),
        "employment_start_date",
        r,
        warnings,
      ),
      employmentEndDate: parseDate(
        col("employment_end_date", cols),
        "employment_end_date",
        r,
        warnings,
      ),
      personnelGroup: col("personnel_group", cols),
      jobTitle: col("job_title", cols),
      vacationDaysContractual: parseInt2(
        col("vacation_days_contractual", cols),
        "vacation_days_contractual",
        r,
        warnings,
      ),
      vacationDaysPreviousYear: parseInt2(
        col("vacation_days_previous_year", cols),
        "vacation_days_previous_year",
        r,
        warnings,
      ),
      vacationDaysCurrentYear: parseInt2(
        col("vacation_days_current_year", cols),
        "vacation_days_current_year",
        r,
        warnings,
      ),
      vacationDaysTaken: parseInt2(
        col("vacation_days_taken", cols),
        "vacation_days_taken",
        r,
        warnings,
      ),
    });
  }

  return { rows, warnings };
}
