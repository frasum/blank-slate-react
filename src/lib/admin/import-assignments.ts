// Reines Mapping-/Diff-Modul für `importStaffAssignments` (Teil Y).
// Keine I/O — alle Daten kommen als Parameter rein, alle Entscheidungen
// kommen als Plan-Objekt raus. Damit ist die komplette Logik (Mapping,
// Diff, Platzhalter-Schutz, skippedRows) ohne DB testbar.

export type ZtDepartment = "Küche" | "Service" | "GL";
export type StaffDepartment = "kitchen" | "service" | "gl";
export type SkillsMode = "merge" | "replace";

export type AssignmentInput = {
  altStaffId: string;
  altLocationId: string;
  ztDepartment: ZtDepartment;
};
export type SkillInput = { altStaffId: string; skillName: string };

export type CurrentLocationRow = {
  staffId: string;
  locationId: string;
  department: StaffDepartment;
};
export type CurrentSkillRow = { staffId: string; skillId: string };

export type SkipReason =
  | "unknown_alt_staff"
  | "unknown_location"
  | "unknown_skill";

export type SkippedRow = {
  kind: "assignment" | "skill";
  reason: SkipReason;
  altStaffId: string;
  altLocationId?: string;
  ztDepartment?: ZtDepartment;
  skillName?: string;
};

export type LocationOp =
  | { op: "add"; staffId: string; locationId: string; department: StaffDepartment }
  | { op: "remove"; staffId: string; locationId: string; department: StaffDepartment };

export type SkillOp =
  | { op: "add"; staffId: string; skillId: string }
  | { op: "remove"; staffId: string; skillId: string };

export type StaffDiff = {
  staffId: string;
  locations: {
    added: Array<{ locationId: string; department: StaffDepartment }>;
    removed: Array<{ locationId: string; department: StaffDepartment }>;
    kept: Array<{ locationId: string; department: StaffDepartment }>;
  };
  skills: {
    added: string[];
    removed: string[];
    kept: string[];
  };
};

export type ComputePlanInput = {
  assignments: AssignmentInput[];
  skills: SkillInput[];
  /** altStaffId → staff_id (Org-scoped, aus staff_identity_map mit confirmed_at). */
  staffMap: Map<string, string>;
  /** altLocationId → location_id. */
  locationMap: Map<string, string>;
  /** skillName → skill_id (Org-scoped). */
  skillMap: Map<string, string>;
  /** Bestehende staff_locations-Zeilen für die betroffenen Mitarbeiter (Org-scoped). */
  currentLocations: CurrentLocationRow[];
  /** Bestehende staff_skills-Zeilen für die betroffenen Mitarbeiter (Org-scoped). */
  currentSkills: CurrentSkillRow[];
  skillsMode: SkillsMode;
};

export type ComputePlanResult = {
  perStaff: StaffDiff[];
  locationOps: LocationOp[];
  skillOps: SkillOp[];
  skippedRows: SkippedRow[];
  totals: {
    staff: number;
    assignments: number;
    skills: number;
    locationsAdded: number;
    locationsRemoved: number;
    skillsAdded: number;
    skillsRemoved: number;
    skippedCount: number;
  };
};

export const ZT_DEPARTMENT_MAP: Record<ZtDepartment, StaffDepartment> = {
  Küche: "kitchen",
  Service: "service",
  GL: "gl",
};

export function mapZtDepartment(zt: ZtDepartment): StaffDepartment {
  return ZT_DEPARTMENT_MAP[zt];
}

function locKey(loc: string, dept: StaffDepartment): string {
  return `${loc}::${dept}`;
}

/**
 * Berechnet einen vollständigen Diff-Plan aus Soll (Alt-Daten) und Ist (DB).
 * Schreibt nichts. Identisch für Dry-Run und Commit; der Commit verwendet das
 * Ergebnis als Quelle der Wahrheit für die DB-Operationen.
 */
export function computeAssignmentPlan(input: ComputePlanInput): ComputePlanResult {
  const skipped: SkippedRow[] = [];

  // --- Sollset Locations: staffId -> Set<locationId::department> ---
  const desiredLocBy = new Map<string, Set<string>>();
  // Sollset Skills: staffId -> Set<skillId>
  const desiredSkillBy = new Map<string, Set<string>>();

  const touchedStaff = new Set<string>();

  for (const a of input.assignments) {
    const staffId = input.staffMap.get(a.altStaffId);
    if (!staffId) {
      skipped.push({
        kind: "assignment",
        reason: "unknown_alt_staff",
        altStaffId: a.altStaffId,
        altLocationId: a.altLocationId,
        ztDepartment: a.ztDepartment,
      });
      continue;
    }
    const locationId = input.locationMap.get(a.altLocationId);
    if (!locationId) {
      skipped.push({
        kind: "assignment",
        reason: "unknown_location",
        altStaffId: a.altStaffId,
        altLocationId: a.altLocationId,
        ztDepartment: a.ztDepartment,
      });
      continue;
    }
    const dept = mapZtDepartment(a.ztDepartment);
    touchedStaff.add(staffId);
    const set = desiredLocBy.get(staffId) ?? new Set<string>();
    set.add(locKey(locationId, dept));
    desiredLocBy.set(staffId, set);
  }

  for (const s of input.skills) {
    const staffId = input.staffMap.get(s.altStaffId);
    if (!staffId) {
      skipped.push({
        kind: "skill",
        reason: "unknown_alt_staff",
        altStaffId: s.altStaffId,
        skillName: s.skillName,
      });
      continue;
    }
    const skillId = input.skillMap.get(s.skillName);
    if (!skillId) {
      skipped.push({
        kind: "skill",
        reason: "unknown_skill",
        altStaffId: s.altStaffId,
        skillName: s.skillName,
      });
      continue;
    }
    touchedStaff.add(staffId);
    const set = desiredSkillBy.get(staffId) ?? new Set<string>();
    set.add(skillId);
    desiredSkillBy.set(staffId, set);
  }

  // --- Istzustand: nach staffId gruppieren, NUR betroffene Mitarbeiter ---
  const currentLocBy = new Map<string, CurrentLocationRow[]>();
  for (const r of input.currentLocations) {
    if (!touchedStaff.has(r.staffId)) continue;
    const arr = currentLocBy.get(r.staffId) ?? [];
    arr.push(r);
    currentLocBy.set(r.staffId, arr);
  }
  const currentSkillBy = new Map<string, Set<string>>();
  for (const r of input.currentSkills) {
    if (!touchedStaff.has(r.staffId)) continue;
    const set = currentSkillBy.get(r.staffId) ?? new Set<string>();
    set.add(r.skillId);
    currentSkillBy.set(r.staffId, set);
  }

  // --- Diff je MA ---
  const perStaff: StaffDiff[] = [];
  const locationOps: LocationOp[] = [];
  const skillOps: SkillOp[] = [];

  for (const staffId of Array.from(touchedStaff).sort()) {
    const desiredLoc = desiredLocBy.get(staffId) ?? new Set<string>();
    const current = currentLocBy.get(staffId) ?? [];
    const currentKeys = new Set(current.map((r) => locKey(r.locationId, r.department)));

    const added: StaffDiff["locations"]["added"] = [];
    const removed: StaffDiff["locations"]["removed"] = [];
    const kept: StaffDiff["locations"]["kept"] = [];

    for (const key of desiredLoc) {
      const [locationId, dept] = key.split("::") as [string, StaffDepartment];
      if (currentKeys.has(key)) {
        kept.push({ locationId, department: dept });
      } else {
        added.push({ locationId, department: dept });
        locationOps.push({ op: "add", staffId, locationId, department: dept });
      }
    }
    for (const row of current) {
      const key = locKey(row.locationId, row.department);
      if (desiredLoc.has(key)) continue;
      // Platzhalter-Schutz: NUR P1-Platzhalter ('service') auto-entfernen.
      if (row.department !== "service") continue;
      removed.push({ locationId: row.locationId, department: row.department });
      locationOps.push({
        op: "remove",
        staffId,
        locationId: row.locationId,
        department: row.department,
      });
    }

    // Skills
    const desiredSk = desiredSkillBy.get(staffId) ?? new Set<string>();
    const currentSk = currentSkillBy.get(staffId) ?? new Set<string>();
    const sAdded: string[] = [];
    const sRemoved: string[] = [];
    const sKept: string[] = [];
    for (const id of desiredSk) {
      if (currentSk.has(id)) sKept.push(id);
      else {
        sAdded.push(id);
        skillOps.push({ op: "add", staffId, skillId: id });
      }
    }
    if (input.skillsMode === "replace") {
      for (const id of currentSk) {
        if (desiredSk.has(id)) continue;
        sRemoved.push(id);
        skillOps.push({ op: "remove", staffId, skillId: id });
      }
    }

    perStaff.push({
      staffId,
      locations: { added, removed, kept },
      skills: { added: sAdded, removed: sRemoved, kept: sKept },
    });
  }

  const locationsAdded = locationOps.filter((o) => o.op === "add").length;
  const locationsRemoved = locationOps.filter((o) => o.op === "remove").length;
  const skillsAdded = skillOps.filter((o) => o.op === "add").length;
  const skillsRemoved = skillOps.filter((o) => o.op === "remove").length;

  return {
    perStaff,
    locationOps,
    skillOps,
    skippedRows: skipped,
    totals: {
      staff: touchedStaff.size,
      assignments: input.assignments.length,
      skills: input.skills.length,
      locationsAdded,
      locationsRemoved,
      skillsAdded,
      skillsRemoved,
      skippedCount: skipped.length,
    },
  };
}

/** SHA-256 der normalisierten Eingabe (sortiert, kanonisch) für Audit-Reproduzierbarkeit. */
export async function hashInput(
  assignments: AssignmentInput[],
  skills: SkillInput[],
  skillsMode: SkillsMode,
): Promise<string> {
  const norm = {
    assignments: [...assignments]
      .map((a) => ({
        altStaffId: a.altStaffId,
        altLocationId: a.altLocationId,
        ztDepartment: a.ztDepartment,
      }))
      .sort((a, b) =>
        a.altStaffId === b.altStaffId
          ? a.altLocationId === b.altLocationId
            ? a.ztDepartment.localeCompare(b.ztDepartment)
            : a.altLocationId.localeCompare(b.altLocationId)
          : a.altStaffId.localeCompare(b.altStaffId),
      ),
    skills: [...skills]
      .map((s) => ({ altStaffId: s.altStaffId, skillName: s.skillName }))
      .sort((a, b) =>
        a.altStaffId === b.altStaffId
          ? a.skillName.localeCompare(b.skillName)
          : a.altStaffId.localeCompare(b.altStaffId),
      ),
    skillsMode,
  };
  const json = JSON.stringify(norm);
  const buf = new TextEncoder().encode(json);
  const digest = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}