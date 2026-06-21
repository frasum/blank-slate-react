// Reines, getestetes Modul für die Skill↔Abteilung-Eligibility-Regel.
// Single Source of Truth für UI und Server. Keine Imports aus DB/React.
//
// Regel: Ein MA darf einen Skill der Kategorie C nur halten, wenn
// - C === "other" → immer erlaubt, ODER
// - der MA an irgendeinem Standort die Abteilung C hat (kitchen/service/gl).
// Abteilungen werden org-weit aggregiert (Skills haben keinen Standortbezug).

import type { StaffDepartment, SkillCategory } from "@/lib/staff-domain";
export type { StaffDepartment, SkillCategory };

/** Eligible, wenn Kategorie 'other' ODER die passende Abteilung vorhanden ist. */
export function isSkillCategoryEligible(
  category: SkillCategory,
  departments: readonly StaffDepartment[],
): boolean {
  if (category === "other") return true;
  return departments.includes(category);
}

/**
 * Skills, die bei gegebenem Abteilungs-Stand NICHT (mehr) eligible wären.
 * Leeres Array = alles in Ordnung. Generisch, damit Aufrufer ihre eigene
 * Skill-Form (mit id/name) durchreichen können.
 */
export function ineligibleSkills<T extends { category: SkillCategory }>(
  skillsHeld: readonly T[],
  departments: readonly StaffDepartment[],
): T[] {
  return skillsHeld.filter((s) => !isSkillCategoryEligible(s.category, departments));
}

/** Distinct-Abteilungen aus (location, department)-Paaren, Reihenfolge stabil. */
export function distinctDepartments(
  rows: readonly { department: StaffDepartment }[],
): StaffDepartment[] {
  return Array.from(new Set(rows.map((r) => r.department)));
}
