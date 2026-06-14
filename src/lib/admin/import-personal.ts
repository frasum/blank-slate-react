// Reines Mapping-/Diff-Modul für `importStaffPersonalData` (Welle 1).
// Keine I/O — alle Daten kommen als Parameter rein, das Ergebnis ist ein
// Plan-Objekt mit Diff je MA, Skip-Liste und Bilanz. Damit ist die komplette
// Geschäftslogik (Namens-Diff, display_name-Schutz, perso_nr-Schutz,
// comp-UPSERT-Klassifikation, Fallback-Datum) ohne DB testbar.

export type PersonalRowInput = {
  altStaffId: string;
  firstName: string;
  lastName: string;
  /** Spitzname aus dem Alt-System (Quelle für `display_name`). */
  nickname: string;
  /** Personalnummer; `null` = im CSV leer → NICHT überschreiben. */
  persoNr: number | null;
  /** Stundenlohn in EUR (auch 0 ist gültig — bewusst, kein Skip). */
  hourlyRate: number;
  /** YYYY-MM-DD; `null` = leer → Fallback auf `fallbackValidFrom`. */
  employmentStart: string | null;
};

export type CurrentStaffRow = {
  staffId: string;
  firstName: string;
  lastName: string;
  displayName: string;
  persoNr: number | null;
};
export type CurrentCompRow = {
  staffId: string;
  hourlyRate: number;
  validFrom: string;
};

export type PersonalSkipReason = "unknown_alt_staff";
export type SkippedPersonalRow = {
  reason: PersonalSkipReason;
  altStaffId: string;
  firstName?: string;
  lastName?: string;
};

export type StaffFieldChange<T> = { from: T; to: T };
export type StaffUpdateFields = {
  first_name?: string;
  last_name?: string;
  display_name?: string;
  perso_nr?: number;
};

export type CompOp =
  | {
      op: "insert";
      staffId: string;
      hourly_rate: number;
      valid_from: string;
      fallback: boolean;
    }
  | {
      op: "update";
      staffId: string;
      hourly_rate: number;
      valid_from: string;
      fallback: boolean;
    };

export type PersonalStaffDiff = {
  staffId: string;
  altStaffId: string;
  nameDiff: {
    first_name?: StaffFieldChange<string>;
    last_name?: StaffFieldChange<string>;
    display_name?: StaffFieldChange<string>;
    perso_nr?: StaffFieldChange<number | null>;
  };
  compDiff: {
    hourly_rate?: StaffFieldChange<number>;
    valid_from?: StaffFieldChange<string>;
  };
  compOp: "insert" | "update" | "noop";
  compFallback: boolean;
};

export type StaffUpdateOp = {
  staffId: string;
  fields: StaffUpdateFields;
};

export type ComputePersonalPlanInput = {
  rows: PersonalRowInput[];
  /** altStaffId → staff_id (org-scoped, aus staff_identity_map mit confirmed_at). */
  staffMap: Map<string, string>;
  /** staffId → bestehende staff-Felder (für Diff + display_name-Schutz). */
  currentStaff: Map<string, CurrentStaffRow>;
  /** staffId → bestehende staff_compensation-Zeile (Unique staff_id). */
  currentComp: Map<string, CurrentCompRow>;
  /** YYYY-MM-DD; greift bei leerem employmentStart. */
  fallbackValidFrom: string;
};

export type PersonalPlan = {
  perStaff: PersonalStaffDiff[];
  staffUpdates: StaffUpdateOp[];
  compOps: CompOp[];
  skippedRows: SkippedPersonalRow[];
  totals: {
    rows: number;
    staff: number;
    nameUpdates: number;
    compInserts: number;
    compUpdates: number;
    compFallbacks: number;
    skippedCount: number;
  };
};

export function computePersonalPlan(input: ComputePersonalPlanInput): PersonalPlan {
  const skipped: SkippedPersonalRow[] = [];
  const perStaff: PersonalStaffDiff[] = [];
  const staffUpdates: StaffUpdateOp[] = [];
  const compOps: CompOp[] = [];
  const touched = new Set<string>();

  for (const row of input.rows) {
    const staffId = input.staffMap.get(row.altStaffId);
    if (!staffId) {
      skipped.push({
        reason: "unknown_alt_staff",
        altStaffId: row.altStaffId,
        firstName: row.firstName,
        lastName: row.lastName,
      });
      continue;
    }
    if (touched.has(staffId)) {
      // Duplikat im CSV — defensiv überspringen (erster Treffer gewinnt).
      continue;
    }
    touched.add(staffId);

    const current = input.currentStaff.get(staffId);
    const nameDiff: PersonalStaffDiff["nameDiff"] = {};
    const fields: StaffUpdateFields = {};

    if (current) {
      if (current.firstName !== row.firstName) {
        nameDiff.first_name = { from: current.firstName, to: row.firstName };
        fields.first_name = row.firstName;
      }
      if (current.lastName !== row.lastName) {
        nameDiff.last_name = { from: current.lastName, to: row.lastName };
        fields.last_name = row.lastName;
      }
      // display_name = nickname, ABER nur wenn nickname nicht leer
      // (display_name ist NOT NULL — leeren String nicht reinschreiben).
      if (row.nickname.length > 0 && current.displayName !== row.nickname) {
        nameDiff.display_name = { from: current.displayName, to: row.nickname };
        fields.display_name = row.nickname;
      }
      // perso_nr leer im CSV → NICHT anfassen (defensiv, kein Datenverlust).
      if (row.persoNr !== null && current.persoNr !== row.persoNr) {
        nameDiff.perso_nr = { from: current.persoNr, to: row.persoNr };
        fields.perso_nr = row.persoNr;
      }
    } else {
      // Sollte praktisch nie passieren (identity_map verweist auf staff),
      // aber defensiv: behandle als „alle Felder neu".
      nameDiff.first_name = { from: "", to: row.firstName };
      nameDiff.last_name = { from: "", to: row.lastName };
      fields.first_name = row.firstName;
      fields.last_name = row.lastName;
      if (row.nickname.length > 0) {
        nameDiff.display_name = { from: "", to: row.nickname };
        fields.display_name = row.nickname;
      }
      if (row.persoNr !== null) {
        nameDiff.perso_nr = { from: null, to: row.persoNr };
        fields.perso_nr = row.persoNr;
      }
    }

    if (Object.keys(fields).length > 0) {
      staffUpdates.push({ staffId, fields });
    }

    // --- staff_compensation ---
    const fallback = !row.employmentStart;
    const validFrom = row.employmentStart ?? input.fallbackValidFrom;
    const compDiff: PersonalStaffDiff["compDiff"] = {};
    const existingComp = input.currentComp.get(staffId);
    let compOp: PersonalStaffDiff["compOp"] = "noop";

    if (!existingComp) {
      compDiff.hourly_rate = { from: 0, to: row.hourlyRate };
      compDiff.valid_from = { from: "", to: validFrom };
      compOps.push({
        op: "insert",
        staffId,
        hourly_rate: row.hourlyRate,
        valid_from: validFrom,
        fallback,
      });
      compOp = "insert";
    } else {
      const rateChanged = existingComp.hourlyRate !== row.hourlyRate;
      const dateChanged = existingComp.validFrom !== validFrom;
      if (rateChanged) {
        compDiff.hourly_rate = { from: existingComp.hourlyRate, to: row.hourlyRate };
      }
      if (dateChanged) {
        compDiff.valid_from = { from: existingComp.validFrom, to: validFrom };
      }
      if (rateChanged || dateChanged) {
        compOps.push({
          op: "update",
          staffId,
          hourly_rate: row.hourlyRate,
          valid_from: validFrom,
          fallback,
        });
        compOp = "update";
      }
    }

    perStaff.push({
      staffId,
      altStaffId: row.altStaffId,
      nameDiff,
      compDiff,
      compOp,
      compFallback: fallback && compOp !== "noop",
    });
  }

  const nameUpdates = staffUpdates.length;
  const compInserts = compOps.filter((o) => o.op === "insert").length;
  const compUpdates = compOps.filter((o) => o.op === "update").length;
  const compFallbacks = perStaff.filter((p) => p.compFallback).length;

  return {
    perStaff,
    staffUpdates,
    compOps,
    skippedRows: skipped,
    totals: {
      rows: input.rows.length,
      staff: touched.size,
      nameUpdates,
      compInserts,
      compUpdates,
      compFallbacks,
      skippedCount: skipped.length,
    },
  };
}

/** SHA-256 der normalisierten Eingabe für Audit-Reproduzierbarkeit. */
export async function hashPersonalInput(rows: PersonalRowInput[]): Promise<string> {
  const norm = [...rows]
    .map((r) => ({
      altStaffId: r.altStaffId,
      firstName: r.firstName,
      lastName: r.lastName,
      nickname: r.nickname,
      persoNr: r.persoNr,
      hourlyRate: r.hourlyRate,
      employmentStart: r.employmentStart,
    }))
    .sort((a, b) => a.altStaffId.localeCompare(b.altStaffId));
  const buf = new TextEncoder().encode(JSON.stringify(norm));
  const digest = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}