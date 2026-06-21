import { TASK_PRIORITY_LABEL } from "@/lib/aufgaben/types";

const COLOR: Record<0 | 1 | 2 | 3, string> = {
  0: "bg-muted text-muted-foreground",
  1: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200",
  2: "bg-yellow-100 text-yellow-900 dark:bg-yellow-900/40 dark:text-yellow-100",
  3: "bg-red-100 text-red-900 dark:bg-red-900/40 dark:text-red-100",
};

export function PriorityChip({ priority }: { priority: number }) {
  const p = (Math.max(0, Math.min(3, priority)) as 0 | 1 | 2 | 3);
  if (p === 0) return null;
  return (
    <span className={`inline-flex rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${COLOR[p]}`}>
      {TASK_PRIORITY_LABEL[p]}
    </span>
  );
}