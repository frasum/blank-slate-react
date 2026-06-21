// Reine Filterfunktion: schränkt die Assignee-Liste eines Aufgaben-Dialogs
// auf die für die jeweilige Kategorie passenden Mitarbeiter ein. Standort
// wird BEREITS außerhalb erzwungen (Admin: locationIds.includes; Staff:
// listStaffForLocation ist standort-gescopt). Dieser Filter kommt nur obendrauf.
//
// Mapping:
//   service       → skillCategories.includes("service")
//   kitchen       → skillCategories.includes("kitchen")
//   manager_admin → role === "admin" || role === "manager"
//   maintenance   → role === "admin" || role === "manager"
//                   || skillCategories.includes("other")

import type { AppRole } from "@/lib/admin/role-guard";
import type { TaskCategory } from "./types";

export type StaffOption = {
  id: string;
  name: string;
  role: AppRole | null;
  skillCategories: string[];
};

export function filterStaffByCategory(staff: StaffOption[], category: TaskCategory): StaffOption[] {
  return staff.filter((s) => {
    switch (category) {
      case "service":
        return s.skillCategories.includes("service");
      case "kitchen":
        return s.skillCategories.includes("kitchen");
      case "manager_admin":
        return s.role === "admin" || s.role === "manager";
      case "maintenance":
        return s.role === "admin" || s.role === "manager" || s.skillCategories.includes("other");
      default:
        return true;
    }
  });
}
