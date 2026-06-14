// Pure CSV-Parser + Namens-Auflösung für den einmaligen Import der
// Mitarbeiter-Zuordnungen (Teil Y, einmaliger Auslöse-Weg).
// Keine I/O. Liefert das Input-Format der Server-Function
// `importStaffAssignments` plus eine Warnliste für nicht eindeutig
// auflösbare Skill-Zeilen.

import type { AssignmentInput, SkillInput, ZtDepartment } from "./import-assignments";

export type ParseWarning =
  | { kind: "skill_name_not_found"; name: string; nickname: string; skillName: string }
  | { kind: "skill_name_ambiguous"; name: string; nickname: string; skillName: string; matches: string[] }
  | { kind: "assignment_unknown_zt_department"; row: number; raw: string }
  | { kind: "assignment_missing_field"; row: number; field: string };

export type ParseResult = {
  assignments: AssignmentInput[];
  skills: SkillInput[];
  warnings: ParseWarning[];
  /** Anzahl distinct altStaffIds in Zuordnungs-CSV. */
  staffCount: number;
};

function stripBom(s: string): string {
  return s.charCodeAt(0) === 0xfeff ? s.slice(1) : s;
}

function splitLines(csv: string): string[] {
  return stripBom(csv)
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
}

function splitRow(line: string): string[] {
  return line.split(";").map((c) => c.trim());
}

function parseHeader(line: string): Map<string, number> {
  const cols = splitRow(line).map((c) => c.toLowerCase());
  const map = new Map<string, number>();
  cols.forEach((c, i) => map.set(c, i));
  return map;
}

const ZT_VALUES = new Set<ZtDepartment>(["Küche", "Service", "GL"]);

export function parseAssignmentsCsv(csv: string): {
  assignments: AssignmentInput[];
  warnings: ParseWarning[];
  /** altStaffId → (name, nickname) für Skill-Auflösung. */
  nameIndex: Map<string, { name: string; nickname: string }>;
} {
  const lines = splitLines(csv);
  const warnings: ParseWarning[] = [];
  const assignments: AssignmentInput[] = [];
  const nameIndex = new Map<string, { name: string; nickname: string }>();
  if (lines.length === 0) return { assignments, warnings, nameIndex };

  const header = parseHeader(lines[0]);
  const iAltStaff = header.get("alt_staff_id");
  const iName = header.get("name");
  const iNick = header.get("nickname");
  const iLoc = header.get("restaurant_id");
  const iZt = header.get("zt_department");
  if (iAltStaff == null || iLoc == null || iZt == null) {
    throw new Error(
      "Zuordnungs-CSV: Spalten alt_staff_id;name;nickname;restaurant_id;restaurant_name;role;zt_department erwartet.",
    );
  }

  for (let r = 1; r < lines.length; r++) {
    const cols = splitRow(lines[r]);
    const altStaffId = cols[iAltStaff] ?? "";
    const altLocationId = cols[iLoc] ?? "";
    const ztRaw = cols[iZt] ?? "";
    const name = (iName != null ? cols[iName] : "") ?? "";
    const nickname = (iNick != null ? cols[iNick] : "") ?? "";
    if (!altStaffId) {
      warnings.push({ kind: "assignment_missing_field", row: r, field: "alt_staff_id" });
      continue;
    }
    if (!altLocationId) {
      warnings.push({ kind: "assignment_missing_field", row: r, field: "restaurant_id" });
      continue;
    }
    if (!ZT_VALUES.has(ztRaw as ZtDepartment)) {
      warnings.push({ kind: "assignment_unknown_zt_department", row: r, raw: ztRaw });
      continue;
    }
    assignments.push({
      altStaffId,
      altLocationId,
      ztDepartment: ztRaw as ZtDepartment,
    });
    if (!nameIndex.has(altStaffId)) nameIndex.set(altStaffId, { name, nickname });
  }

  return { assignments, warnings, nameIndex };
}

function normName(s: string): string {
  return s.trim().toLowerCase();
}

export function parseSkillsCsv(
  csv: string,
  nameIndex: Map<string, { name: string; nickname: string }>,
): { skills: SkillInput[]; warnings: ParseWarning[] } {
  const lines = splitLines(csv);
  const warnings: ParseWarning[] = [];
  const skills: SkillInput[] = [];
  if (lines.length === 0) return { skills, warnings };

  const header = parseHeader(lines[0]);
  const iName = header.get("name");
  const iNick = header.get("nickname");
  const iSkill = header.get("skill");
  if (iName == null || iSkill == null) {
    throw new Error("Skill-CSV: Spalten category;name;nickname;skill erwartet.");
  }

  // Index: name/nickname → Set<altStaffId>
  const byName = new Map<string, Set<string>>();
  const byNick = new Map<string, Set<string>>();
  for (const [altId, info] of nameIndex) {
    if (info.name) {
      const k = normName(info.name);
      const s = byName.get(k) ?? new Set<string>();
      s.add(altId);
      byName.set(k, s);
    }
    if (info.nickname) {
      const k = normName(info.nickname);
      const s = byNick.get(k) ?? new Set<string>();
      s.add(altId);
      byNick.set(k, s);
    }
  }

  // Dedupe (altStaffId, skillName) — Skill-CSV kann doppelt enthalten.
  const seen = new Set<string>();

  for (let r = 1; r < lines.length; r++) {
    const cols = splitRow(lines[r]);
    const name = cols[iName] ?? "";
    const nickname = (iNick != null ? cols[iNick] : "") ?? "";
    const skillName = cols[iSkill] ?? "";
    if (!skillName) continue;

    // Versuche zuerst nickname (eindeutiger), dann name.
    let matches: Set<string> | undefined;
    if (nickname) matches = byNick.get(normName(nickname));
    if ((!matches || matches.size === 0) && name) matches = byName.get(normName(name));

    if (!matches || matches.size === 0) {
      warnings.push({ kind: "skill_name_not_found", name, nickname, skillName });
      continue;
    }
    if (matches.size > 1) {
      warnings.push({
        kind: "skill_name_ambiguous",
        name,
        nickname,
        skillName,
        matches: Array.from(matches),
      });
      continue;
    }
    const altStaffId = matches.values().next().value as string;
    const key = `${altStaffId}::${skillName}`;
    if (seen.has(key)) continue;
    seen.add(key);
    skills.push({ altStaffId, skillName });
  }

  return { skills, warnings };
}

export function parseImportCsvs(input: {
  assignmentsCsv: string;
  skillsCsv: string;
}): ParseResult {
  const a = parseAssignmentsCsv(input.assignmentsCsv);
  const s = parseSkillsCsv(input.skillsCsv, a.nameIndex);
  const staffCount = new Set(a.assignments.map((x) => x.altStaffId)).size;
  return {
    assignments: a.assignments,
    skills: s.skills,
    warnings: [...a.warnings, ...s.warnings],
    staffCount,
  };
}