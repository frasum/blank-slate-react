import { useDraggable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import type { Task } from "@/lib/aufgaben/types";
import { CategoryBadge } from "./CategoryBadge";
import { PriorityChip } from "./PriorityChip";

type Props = {
  task: Task;
  assigneeName?: string | null;
  onOpen: (task: Task) => void;
};

function formatDue(due: string | null): string | null {
  if (!due) return null;
  const d = new Date(due);
  return d.toLocaleDateString("de-DE", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function KanbanCard({ task, assigneeName, onOpen }: Props) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: task.id,
    data: { taskId: task.id, status: task.status, sortOrder: task.sort_order },
  });
  const due = formatDue(task.due_at);
  return (
    <button
      ref={setNodeRef}
      type="button"
      {...listeners}
      {...attributes}
      onClick={() => onOpen(task)}
      style={{
        transform: CSS.Translate.toString(transform),
        opacity: isDragging ? 0.5 : 1,
      }}
      className="w-full cursor-grab rounded-md border border-border bg-card p-3 text-left shadow-sm transition-shadow hover:shadow-md active:cursor-grabbing"
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <CategoryBadge category={task.category} />
        <PriorityChip priority={task.priority} />
      </div>
      <div className="text-sm font-medium text-foreground">{task.title}</div>
      {task.description ? (
        <div className="mt-1 line-clamp-2 text-xs text-muted-foreground">{task.description}</div>
      ) : null}
      <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
        <span>{assigneeName ?? (task.assignee_staff_id ? "—" : "unzugewiesen")}</span>
        {due ? <span>{due}</span> : null}
      </div>
    </button>
  );
}
