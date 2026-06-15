// Skill-Auswahl pro Zelle: Profil-Skills (Mitarbeiter besitzt + Kategorie
// passt zur Area) zuerst, sonst alle Skills der passenden Kategorien.
// Service-Area akzeptiert auch gl/other (GL, Hausmeister).
import type { RosterSkill, RosterStaffRow } from "@/lib/roster/roster.functions";

export function skillsForCell(
  staffRow: RosterStaffRow,
  area: "kitchen" | "service",
  allSkills: RosterSkill[],
): { profile: RosterSkill[]; other: RosterSkill[] } {
  const allowed =
    area === "service"
      ? new Set<RosterSkill["category"]>(["service", "gl", "other"])
      : new Set<RosterSkill["category"]>(["kitchen"]);
  const inArea = allSkills.filter((s) => allowed.has(s.category));
  const owned = new Set(staffRow.skillIds);
  const profile = inArea.filter((s) => owned.has(s.id));
  if (profile.length === 0) return { profile: inArea, other: [] };
  const other = inArea.filter((s) => !owned.has(s.id));
  return { profile, other };
}
