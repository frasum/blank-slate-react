import { useDroppable } from "@dnd-kit/core";
import type { Task, TaskStatus } from "@/lib/aufgaben/types";
import { TASK_STATUS_LABEL } from "@/lib/aufgaben/types";
import { KanbanCard } from "./KanbanCard";

type Props = {
  status: TaskStatus;
  tasks: Task[];
  assigneeNames: Record<string, string>;
  onOpen: (task: Task) => void;
  isDraggable?: (task: Task) => boolean;
  canClaim?: (task: Task) => boolean;
  onClaim?: (task: Task) => void;
  claimPendingId?: string | null;
  photoCounts?: Record<string, number>;
};

export function KanbanColumn({
  status,
  tasks,
  assigneeNames,
  onOpen,
  isDraggable,
  canClaim,
  onClaim,
  claimPendingId,
  photoCounts,
}: Props) {
  const { setNodeRef, isOver } = useDroppable({ id: `col:${status}`, data: { status } });
  return (
    <div
      ref={setNodeRef}
      className={`flex h-full min-h-[400px] flex-col rounded-lg border bg-muted/30 p-3 transition-colors ${
        isOver ? "border-foreground/30 bg-muted/60" : "border-border"
      }`}
      data-testid={`column-${status}`}
    >
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground">{TASK_STATUS_LABEL[status]}</h3>
        <span className="rounded-full bg-background px-2 py-0.5 text-xs text-muted-foreground">
          {tasks.length}
        </span>
      </div>
      <div className="flex flex-col gap-2">
        {tasks.length === 0 ? (
          <div className="rounded-md border border-dashed border-border p-4 text-center text-xs text-muted-foreground">
            Keine Aufgaben
          </div>
        ) : (
          tasks.map((t) => (
            <KanbanCard
              key={t.id}
              task={t}
              assigneeName={t.assignee_staff_id ? assigneeNames[t.assignee_staff_id] : null}
              onOpen={onOpen}
              draggable={isDraggable ? isDraggable(t) : true}
              canClaim={canClaim ? canClaim(t) : false}
              onClaim={onClaim}
              claimPending={claimPendingId === t.id}
              photoCount={photoCounts?.[t.id] ?? 0}
            />
          ))
        )}
      </div>
    </div>
  );
}
