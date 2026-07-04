import { useDraggable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import type { Task } from "@/lib/aufgaben/types";
import { CategoryBadge } from "./CategoryBadge";
import { PriorityChip } from "./PriorityChip";

type Props = {
  task: Task;
  assigneeName?: string | null;
  onOpen: (task: Task) => void;
  draggable?: boolean;
  canClaim?: boolean;
  onClaim?: (task: Task) => void;
  claimPending?: boolean;
  photoCount?: number;
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

export function KanbanCard({
  task,
  assigneeName,
  onOpen,
  draggable = true,
  canClaim = false,
  onClaim,
  claimPending = false,
  photoCount = 0,
}: Props) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: task.id,
    data: { taskId: task.id, status: task.status, sortOrder: task.sort_order },
    disabled: !draggable,
  });
  const due = formatDue(task.due_at);
  return (
    <div
      ref={setNodeRef}
      {...(draggable ? listeners : {})}
      {...(draggable ? attributes : {})}
      style={{
        transform: CSS.Translate.toString(transform),
        opacity: isDragging ? 0.5 : 1,
      }}
      className={`w-full rounded-md border border-border bg-card p-3 text-left shadow-sm transition-shadow hover:shadow-md ${
        draggable ? "cursor-grab active:cursor-grabbing" : ""
      }`}
    >
      <button type="button" onClick={() => onOpen(task)} className="w-full text-left">
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
          <span className="flex items-center gap-2">
            {photoCount > 0 ? <span title="Fotos">📷 {photoCount}</span> : null}
            {due ? <span>{due}</span> : null}
          </span>
        </div>
      </button>
      {canClaim && onClaim ? (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onClaim(task);
          }}
          disabled={claimPending}
          className="mt-2 w-full rounded-md border border-foreground/20 bg-background px-2 py-1 text-xs font-medium text-foreground hover:bg-muted disabled:opacity-50"
        >
          {claimPending ? "Übernehme…" : "Übernehmen"}
        </button>
      ) : null}
    </div>
  );
}
