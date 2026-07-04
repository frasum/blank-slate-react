import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { DndContext, PointerSensor, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import {
  BOARD_COLUMNS,
  TASK_CATEGORIES,
  TASK_CATEGORY_LABEL,
  type Task,
  type TaskCategory,
  type TaskStatus,
} from "@/lib/aufgaben/types";
import {
  useBoardTasks,
  useClaimTask,
  useSetTaskStatus,
  useTasksRealtime,
} from "@/lib/aufgaben/tasks.queries";
import { sortOrderForInsert } from "@/lib/aufgaben/sort-order";
import { KanbanColumn } from "./KanbanColumn";
import { TaskCreateDialog } from "./TaskCreateDialog";
import { TaskDetailDialog } from "./TaskDetailDialog";
import { Button } from "@/components/ui/button";
import { CategoryBadge } from "./CategoryBadge";
import type { StaffOption } from "@/lib/aufgaben/filter-staff-by-category";
import { countTaskPhotos } from "@/lib/aufgaben/task-photos.functions";

type Props = {
  locationId: string;
  staff: StaffOption[];
  canCreate: boolean;
  /**
   * Volle Manager-Rechte: jede Karte ziehen, Detaildialog mit Bearbeiten/Archivieren.
   * Wenn false (Staff): nur eigene Karten ziehbar, Detaildialog read-only +
   * Status-Buttons nur für eigene Karten, fremde unzugewiesene Karten zeigen "Übernehmen".
   */
  canManage?: boolean;
  /** Effektive Staff-Id des Aufrufers — für "eigene Karte?"-Checks. */
  currentStaffId?: string | null;
};

export function KanbanBoard({
  locationId,
  staff,
  canCreate,
  canManage = true,
  currentStaffId = null,
}: Props) {
  const tasksQ = useBoardTasks(locationId);
  const setStatus = useSetTaskStatus(locationId);
  const claim = useClaimTask(locationId);
  useTasksRealtime(locationId);
  const countFn = useServerFn(countTaskPhotos);
  const taskIds = useMemo(() => (tasksQ.data ?? []).map((t) => t.id), [tasksQ.data]);
  const countsQ = useQuery({
    queryKey: ["task-photos", "counts", locationId, taskIds.length, taskIds.join(",")],
    enabled: taskIds.length > 0,
    queryFn: () => countFn({ data: { taskIds } }),
  });
  const photoCounts = countsQ.data ?? {};
  const [createOpen, setCreateOpen] = useState(false);
  const [openTask, setOpenTask] = useState<Task | null>(null);
  const [categoryFilter, setCategoryFilter] = useState<Set<TaskCategory>>(new Set());

  const assigneeNames = useMemo(() => {
    const m: Record<string, string> = {};
    for (const s of staff) m[s.id] = s.name;
    return m;
  }, [staff]);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const filtered = useMemo(() => {
    const all = tasksQ.data ?? [];
    if (categoryFilter.size === 0) return all;
    return all.filter((t) => categoryFilter.has(t.category));
  }, [tasksQ.data, categoryFilter]);

  const byStatus = useMemo(() => {
    const groups: Record<TaskStatus, Task[]> = {
      open: [],
      in_progress: [],
      done: [],
      cancelled: [],
    };
    for (const t of filtered) groups[t.status].push(t);
    for (const s of Object.keys(groups) as TaskStatus[]) {
      groups[s].sort((a, b) => Number(a.sort_order) - Number(b.sort_order));
    }
    return groups;
  }, [filtered]);

  function toggleCategory(c: TaskCategory) {
    setCategoryFilter((prev) => {
      const next = new Set(prev);
      if (next.has(c)) next.delete(c);
      else next.add(c);
      return next;
    });
  }

  function handleDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over) return;
    const overId = String(over.id);
    if (!overId.startsWith("col:")) return;
    const targetStatus = overId.slice(4) as TaskStatus;
    const taskId = String(active.id);
    const task = (tasksQ.data ?? []).find((t) => t.id === taskId);
    if (!task) return;
    // Staff darf nur eigene Karten ziehen — DnD-Schutz greift, aber doppelt hält besser.
    if (!canManage && task.assignee_staff_id !== currentStaffId) return;
    // Karte ans Ende der Zielspalte (ohne sich selbst) einfügen.
    const colTasks = byStatus[targetStatus].filter((t) => t.id !== taskId);
    const sortOrder = sortOrderForInsert(
      colTasks.map((t) => ({ sort_order: Number(t.sort_order) })),
      colTasks.length,
    );
    if (task.status === targetStatus && sortOrder === Number(task.sort_order)) return;
    setStatus.mutate({ taskId, status: targetStatus, sortOrder });
  }

  const isDraggable = (t: Task) =>
    canManage || (currentStaffId !== null && t.assignee_staff_id === currentStaffId);
  const canClaimCard = (t: Task) =>
    !canManage && t.status === "open" && t.assignee_staff_id === null && currentStaffId !== null;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium text-muted-foreground">Kategorie:</span>
          {TASK_CATEGORIES.map((c) => {
            const active = categoryFilter.has(c);
            return (
              <button
                key={c}
                type="button"
                onClick={() => toggleCategory(c)}
                className={`rounded-full border px-2 py-0.5 text-xs transition-colors ${
                  active
                    ? "border-foreground bg-foreground text-background"
                    : "border-border bg-card text-foreground hover:bg-muted"
                }`}
                aria-pressed={active}
              >
                {TASK_CATEGORY_LABEL[c]}
              </button>
            );
          })}
          {categoryFilter.size > 0 ? (
            <button
              type="button"
              onClick={() => setCategoryFilter(new Set())}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              Zurücksetzen
            </button>
          ) : null}
        </div>
        {canCreate ? (
          <Button type="button" onClick={() => setCreateOpen(true)} size="sm">
            + Neue Aufgabe
          </Button>
        ) : null}
      </div>

      {tasksQ.isLoading ? (
        <p className="text-sm text-muted-foreground">Lade Aufgaben…</p>
      ) : tasksQ.isError ? (
        <p className="text-sm text-destructive">
          Fehler beim Laden: {(tasksQ.error as Error).message}
        </p>
      ) : (
        <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            {BOARD_COLUMNS.map((status) => (
              <KanbanColumn
                key={status}
                status={status}
                tasks={byStatus[status]}
                assigneeNames={assigneeNames}
                onOpen={setOpenTask}
                isDraggable={isDraggable}
                canClaim={canClaimCard}
                onClaim={(t) => claim.mutate({ taskId: t.id })}
                claimPendingId={claim.isPending ? (claim.variables?.taskId ?? null) : null}
                photoCounts={photoCounts}
              />
            ))}
          </div>
          {byStatus.cancelled.length > 0 ? (
            <details className="rounded-lg border border-border bg-muted/20 p-3">
              <summary className="cursor-pointer text-sm font-medium text-muted-foreground">
                Abgebrochen ({byStatus.cancelled.length})
              </summary>
              <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {byStatus.cancelled.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setOpenTask(t)}
                    className="rounded-md border border-border bg-card p-2 text-left text-sm hover:bg-muted"
                  >
                    <div className="mb-1">
                      <CategoryBadge category={t.category} />
                    </div>
                    {t.title}
                  </button>
                ))}
              </div>
            </details>
          ) : null}
        </DndContext>
      )}

      {canCreate ? (
        <TaskCreateDialog
          open={createOpen}
          onOpenChange={setCreateOpen}
          locationId={locationId}
          staff={staff}
        />
      ) : null}
      <TaskDetailDialog
        task={openTask}
        onOpenChange={(o) => !o && setOpenTask(null)}
        locationId={locationId}
        staff={staff}
        canManage={canManage}
        currentStaffId={currentStaffId}
      />
    </div>
  );
}
