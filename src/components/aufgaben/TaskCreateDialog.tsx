import { useEffect, useMemo, useState } from "react";
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
  TASK_CATEGORIES,
  TASK_CATEGORY_LABEL,
  TASK_PRIORITY_LABEL,
  type TaskCategory,
} from "@/lib/aufgaben/types";
import { useCreateTask } from "@/lib/aufgaben/tasks.queries";
import { filterStaffByCategory, type StaffOption } from "@/lib/aufgaben/filter-staff-by-category";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  locationId: string;
  staff: StaffOption[];
};

export function TaskCreateDialog({ open, onOpenChange, locationId, staff }: Props) {
  const create = useCreateTask(locationId);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState<TaskCategory>("service");
  const [priority, setPriority] = useState<number>(0);
  const [assignee, setAssignee] = useState<string>("");
  const [dueAt, setDueAt] = useState<string>("");
  const [err, setErr] = useState<string | null>(null);

  const filteredStaff = useMemo(() => filterStaffByCategory(staff, category), [staff, category]);

  useEffect(() => {
    if (assignee && !filteredStaff.some((s) => s.id === assignee)) {
      setAssignee("");
    }
  }, [filteredStaff, assignee]);

  function reset() {
    setTitle("");
    setDescription("");
    setCategory("service");
    setPriority(0);
    setAssignee("");
    setDueAt("");
    setErr(null);
  }

  async function submit() {
    setErr(null);
    try {
      await create.mutateAsync({
        locationId,
        title: title.trim(),
        description: description.trim() || null,
        category,
        priority,
        assigneeStaffId: assignee || null,
        dueAt: dueAt ? new Date(dueAt).toISOString() : null,
      });
      reset();
      onOpenChange(false);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Anlegen fehlgeschlagen");
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) reset();
        onOpenChange(o);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Neue Aufgabe</DialogTitle>
          <DialogDescription>Aufgabe für den aktuellen Standort anlegen.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="grid gap-1.5">
            <Label htmlFor="task-title">Titel</Label>
            <Input
              id="task-title"
              value={title}
              maxLength={200}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Was ist zu tun?"
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="task-desc">Beschreibung</Label>
            <Textarea
              id="task-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label>Kategorie</Label>
              <Select value={category} onValueChange={(v) => setCategory(v as TaskCategory)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TASK_CATEGORIES.map((c) => (
                    <SelectItem key={c} value={c}>
                      {TASK_CATEGORY_LABEL[c]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
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
          </div>
          <div className="grid grid-cols-2 gap-3">
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
                  {filteredStaff.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {filteredStaff.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  Keine passenden Mitarbeiter für diese Kategorie.
                </p>
              ) : null}
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="task-due">Fälligkeit</Label>
              <Input
                id="task-due"
                type="datetime-local"
                value={dueAt}
                onChange={(e) => setDueAt(e.target.value)}
              />
            </div>
          </div>
          {err ? <p className="text-sm text-destructive">{err}</p> : null}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} type="button">
            Abbrechen
          </Button>
          <Button onClick={submit} disabled={!title.trim() || create.isPending} type="button">
            {create.isPending ? "Speichert…" : "Anlegen"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
