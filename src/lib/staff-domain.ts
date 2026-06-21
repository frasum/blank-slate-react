// Kanonische Domänen-Typen, gespiegelt aus den Postgres-Enums
// `staff_department` und `skill_category`. EINZIGE Stelle, an der diese
// Union-Literale stehen — alle anderen Module re-exportieren/importieren von hier.
export type StaffDepartment = "kitchen" | "service" | "gl";
export type SkillCategory = "kitchen" | "service" | "gl" | "other";