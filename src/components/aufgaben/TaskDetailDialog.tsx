import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  TASK_PRIORITY_LABEL,
  TASK_STATUSES,
  TASK_STATUS_LABEL,
  type Task,
  type TaskStatus,
} from "@/lib/aufgaben/types";
import {
  useArchiveTask,
  useReassignTask,
  useSetTaskStatus,
  useUpdateTask,
} from "@/lib/aufgaben/tasks.queries";

type Props = {
  task: Task | null;
  onOpenChange: (open: boolean) => void;
  locationId: string;
  staff: { id: string; name: string }[];
  /** Volle Rechte (admin/manager) — Bearbeiten/Archivieren/Reassign sichtbar. */
  canManage?: boolean;
  /** Effektive Staff-Id (für Status-Aktionen bei Staff: nur eigene Karte). */
  currentStaffId?: string | null;
};

export function TaskDetailDialog({
  task,
  onOpenChange,
  locationId,
  staff,
  canManage = true,
  currentStaffId = null,
}: Props) {
  const update = useUpdateTask(locationId);
  const reassign = useReassignTask(locationId);
  const setStatus = useSetTaskStatus(locationId);
  const archive = useArchiveTask(locationId);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState(0);
  const [dueAt, setDueAt] = useState("");
  const [assignee, setAssignee] = useState("");
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!task) return;
    setTitle(task.title);
    setDescription(task.description ?? "");
    setPriority(task.priority);
    setDueAt(task.due_at ? task.due_at.slice(0, 16) : "");
    setAssignee(task.assignee_staff_id ?? "");
    setErr(null);
  }, [task]);

  if (!task) return null;
  const isOwner = currentStaffId !== null && task.assignee_staff_id === currentStaffId;
  const canChangeStatus = canManage || isOwner;

  async function save() {
    if (!task) return;
    setErr(null);
    try {
      await update.mutateAsync({
        taskId: task.id,
        title: title.trim(),
        description: description.trim() || null,
        priority,
        dueAt: dueAt ? new Date(dueAt).toISOString() : null,
      });
      if ((task.assignee_staff_id ?? "") !== assignee && assignee) {
        await reassign.mutateAsync({ taskId: task.id, newAssigneeStaffId: assignee });
      }
      onOpenChange(false);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Speichern fehlgeschlagen");
    }
  }

  async function changeStatus(s: TaskStatus) {
    if (!task) return;
    setErr(null);
    try {
      await setStatus.mutateAsync({ taskId: task.id, status: s });
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Status-Wechsel fehlgeschlagen");
    }
  }

  async function doArchive() {
    if (!task) return;
    if (!window.confirm("Aufgabe archivieren? (bleibt im Audit erhalten)")) return;
    setErr(null);
    try {
      await archive.mutateAsync({ taskId: task.id });
      onOpenChange(false);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Archivieren fehlgeschlagen");
    }
  }

  return (
    <Dialog open={!!task} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{canManage ? "Aufgabe bearbeiten" : "Aufgabe"}</DialogTitle>
          <DialogDescription>
            Status: {TASK_STATUS_LABEL[task.status]} · Sortier-Pos: {task.sort_order}
          </DialogDescription>
        </DialogHeader>
        {canManage ? (
          <div className="grid gap-3">
            <div className="grid gap-1.5">
              <Label>Titel</Label>
              <Input value={title} maxLength={200} onChange={(e) => setTitle(e.target.value)} />
            </div>
            <div className="grid gap-1.5">
              <Label>Beschreibung</Label>
              <Textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={4}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label>Priorität</Label>
                <Select value={String(priority)} onValueChange={(v) => setPriority(Number(v))}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {([0, 1, 2, 3] as const).map((p) => (
                      <SelectItem key={p} value={String(p)}>
                        {TASK_PRIORITY_LABEL[p]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-1.5">
                <Label>Fälligkeit</Label>
                <Input
                  type="datetime-local"
                  value={dueAt}
                  onChange={(e) => setDueAt(e.target.value)}
                />
              </div>
            </div>
            <div className="grid gap-1.5">
              <Label>Zugewiesen</Label>
              <Select
                value={assignee || "__none"}
                onValueChange={(v) => setAssignee(v === "__none" ? "" : v)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Unzugewiesen" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none">Unzugewiesen</SelectItem>
                  {staff.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="rounded-md border border-border bg-muted/30 p-3">
              <div className="mb-2 text-xs font-medium text-muted-foreground">Status-Aktionen</div>
              <div className="flex flex-wrap gap-2">
                {TASK_STATUSES.map((s) => (
                  <Button
                    key={s}
                    type="button"
                    size="sm"
                    variant={task.status === s ? "default" : "outline"}
                    onClick={() => changeStatus(s)}
                    disabled={setStatus.isPending}
                  >
                    {TASK_STATUS_LABEL[s]}
                  </Button>
                ))}
              </div>
            </div>
            {err ? <p className="text-sm text-destructive">{err}</p> : null}
          </div>
        ) : (
          <div className="grid gap-3">
            <div className="grid gap-1.5">
              <Label>Titel</Label>
              <div className="text-sm font-medium text-foreground">{task.title}</div>
            </div>
            {task.description ? (
              <div className="grid gap-1.5">
                <Label>Beschreibung</Label>
                <div className="whitespace-pre-wrap text-sm text-muted-foreground">
                  {task.description}
                </div>
              </div>
            ) : null}
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <Label>Priorität</Label>
                <div className="text-foreground">
                  {TASK_PRIORITY_LABEL[task.priority as 0 | 1 | 2 | 3]}
                </div>
              </div>
              <div>
                <Label>Fälligkeit</Label>
                <div className="text-foreground">
                  {task.due_at ? new Date(task.due_at).toLocaleString("de-DE") : "—"}
                </div>
              </div>
            </div>
            <div className="grid gap-1.5 text-sm">
              <Label>Zugewiesen</Label>
              <div className="text-foreground">
                {task.assignee_staff_id
                  ? (staff.find((s) => s.id === task.assignee_staff_id)?.name ?? "—")
                  : "unzugewiesen"}
              </div>
            </div>
            {canChangeStatus ? (
              <div className="rounded-md border border-border bg-muted/30 p-3">
                <div className="mb-2 text-xs font-medium text-muted-foreground">
                  Status-Aktionen
                </div>
                <div className="flex flex-wrap gap-2">
                  {TASK_STATUSES.map((s) => (
                    <Button
                      key={s}
                      type="button"
                      size="sm"
                      variant={task.status === s ? "default" : "outline"}
                      onClick={() => changeStatus(s)}
                      disabled={setStatus.isPending}
                    >
                      {TASK_STATUS_LABEL[s]}
                    </Button>
                  ))}
                </div>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">
                Nur die zugewiesene Person oder Manager können den Status ändern.
              </p>
            )}
            {err ? <p className="text-sm text-destructive">{err}</p> : null}
          </div>
        )}
        <DialogFooter className="flex sm:justify-between">
          {canManage ? (
            <>
              <Button
                variant="destructive"
                type="button"
                onClick={doArchive}
                disabled={archive.isPending}
              >
                Archivieren
              </Button>
              <div className="flex gap-2">
                <Button variant="outline" type="button" onClick={() => onOpenChange(false)}>
                  Abbrechen
                </Button>
                <Button type="button" onClick={save} disabled={!title.trim() || update.isPending}>
                  Speichern
                </Button>
              </div>
            </>
          ) : (
            <Button variant="outline" type="button" onClick={() => onOpenChange(false)}>
              Schließen
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
