import type { TaskCategory } from "@/lib/aufgaben/types";
import { TASK_CATEGORY_LABEL } from "@/lib/aufgaben/types";

const COLOR: Record<TaskCategory, string> = {
  service: "bg-blue-100 text-blue-900 dark:bg-blue-900/40 dark:text-blue-100",
  kitchen: "bg-orange-100 text-orange-900 dark:bg-orange-900/40 dark:text-orange-100",
  maintenance: "bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-100",
  manager_admin: "bg-violet-100 text-violet-900 dark:bg-violet-900/40 dark:text-violet-100",
};

export function CategoryBadge({ category }: { category: TaskCategory }) {
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${COLOR[category]}`}>
      {TASK_CATEGORY_LABEL[category]}
    </span>
  );
}