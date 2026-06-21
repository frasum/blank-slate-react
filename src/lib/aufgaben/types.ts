// Geteilte Typen für das Kanban-Modul. Quelle der Wahrheit für DB-Zeilen
// sind die generierten Supabase-Types — wir derivieren statt zu duplizieren.

import type { Database } from "@/integrations/supabase/types";

export type Task = Database["public"]["Tables"]["tasks"]["Row"];
export type TaskStatus = Database["public"]["Enums"]["task_status"];
export type TaskCategory = Database["public"]["Enums"]["task_category"];

export const TASK_STATUSES: readonly TaskStatus[] = [
  "open",
  "in_progress",
  "done",
  "cancelled",
] as const;

export const TASK_CATEGORIES: readonly TaskCategory[] = [
  "service",
  "kitchen",
  "maintenance",
  "manager_admin",
] as const;

export const TASK_STATUS_LABEL: Record<TaskStatus, string> = {
  open: "Offen",
  in_progress: "Läuft",
  done: "Erledigt",
  cancelled: "Abgebrochen",
};

export const TASK_CATEGORY_LABEL: Record<TaskCategory, string> = {
  service: "Service",
  kitchen: "Küche",
  maintenance: "Wartung",
  manager_admin: "Manager",
};

export const TASK_PRIORITY_LABEL: Record<0 | 1 | 2 | 3, string> = {
  0: "Normal",
  1: "Niedrig",
  2: "Hoch",
  3: "Dringend",
};

/** Board-Spalten in der Anzeige-Reihenfolge (cancelled wird separat eingeklappt). */
export const BOARD_COLUMNS: readonly TaskStatus[] = ["open", "in_progress", "done"] as const;
