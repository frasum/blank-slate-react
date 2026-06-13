// B2b — Manager-Korrektur-UI für time_entries + Admin-Wasserlinie.
// Bewusst funktional gehalten: Tabelle, Bearbeiten-Dialog, Neu-Anlegen,
// Löschen mit Pflicht-Begründung, Wasserlinie verschieben (Admin).

import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { listStaff } from "@/lib/admin/staff.functions";
import {
  createManualEntry,
  deleteTimeEntry,
  listEntriesForCorrection,
  setTimeLock,
  updateTimeEntry,
} from "@/lib/time/time-admin.functions";

export const Route = createFileRoute("/_authenticated/admin/zeit")({
  head: () => ({ meta: [{ title: "Zeit-Korrektur" }] }),
  component: AdminZeitPage,
});

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function isoAddDays(iso: string, days: number): string {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fromLocalInput(value: string): string {
  return new Date(value).toISOString();
}

type Entry = {
  id: string;
  staffId: string;
  staffName: string;
  startedAt: string;
  endedAt: string | null;
  businessDate: string;
  breakMinutes: number;
  source: string;
};

type EditState =
  | {
      mode: "create";
      staffId: string;
      startedAt: string;
      endedAt: string;
      breakMinutes: string;
      reason: string;
    }
  | {
      mode: "edit";
      id: string;
      startedAt: string;
      endedAt: string;
      breakMinutes: string;
      reason: string;
    };

function AdminZeitPage() {
  const { identity } = Route.useRouteContext();
  const isAdmin = identity.role === "admin";
  const qc = useQueryClient();

  const [from, setFrom] = useState(isoAddDays(todayIso(), -14));
  const [to, setTo] = useState(todayIso());

  const fetchList = useServerFn(listEntriesForCorrection);
  const fetchStaff = useServerFn(listStaff);
  const callCreate = useServerFn(createManualEntry);
  const callUpdate = useServerFn(updateTimeEntry);
  const callDelete = useServerFn(deleteTimeEntry);
  const callLock = useServerFn(setTimeLock);

  const listQ = useQuery({
    queryKey: ["admin-time", from, to],
    queryFn: () => fetchList({ data: { from, to } }),
  });
  const staffQ = useQuery({ queryKey: ["admin-staff"], queryFn: () => fetchStaff() });

  const [edit, setEdit] = useState<EditState | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; reason: string } | null>(null);
  const [lockInput, setLockInput] = useState<string>("");

  const invalidate = () => qc.invalidateQueries({ queryKey: ["admin-time"] });

  const createMut = useMutation({
    mutationFn: () => {
      if (!edit || edit.mode !== "create") throw new Error("invalid state");
      return callCreate({
        data: {
          staffId: edit.staffId,
          startedAt: fromLocalInput(edit.startedAt),
          endedAt: edit.endedAt ? fromLocalInput(edit.endedAt) : null,
          breakMinutes: Number.parseInt(edit.breakMinutes, 10),
          reason: edit.reason,
        },
      });
    },
    onSuccess: () => {
      toast.success("Eintrag angelegt.");
      setEdit(null);
      void invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const updateMut = useMutation({
    mutationFn: () => {
      if (!edit || edit.mode !== "edit") throw new Error("invalid state");
      return callUpdate({
        data: {
          id: edit.id,
          startedAt: fromLocalInput(edit.startedAt),
          endedAt: edit.endedAt ? fromLocalInput(edit.endedAt) : null,
          breakMinutes: Number.parseInt(edit.breakMinutes, 10),
          reason: edit.reason,
        },
      });
    },
    onSuccess: () => {
      toast.success("Eintrag aktualisiert.");
      setEdit(null);
      void invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMut = useMutation({
    mutationFn: () => {
      if (!deleteTarget) throw new Error("invalid state");
      return callDelete({ data: { id: deleteTarget.id, reason: deleteTarget.reason } });
    },
    onSuccess: () => {
      toast.success("Eintrag gelöscht (im Audit-Log rekonstruierbar).");
      setDeleteTarget(null);
      void invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const lockMut = useMutation({
    mutationFn: () =>
      callLock({ data: { throughDate: lockInput.trim() === "" ? null : lockInput } }),
    onSuccess: () => {
      toast.success("Wasserlinie aktualisiert.");
      void invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const lockedThrough = listQ.data?.lockedThrough ?? null;
  const entries: Entry[] = listQ.data?.entries ?? [];

  function startCreate() {
    const firstStaff = staffQ.data?.[0]?.id ?? "";
    const start = `${todayIso()}T09:00`;
    setEdit({
      mode: "create",
      staffId: firstStaff,
      startedAt: start,
      endedAt: `${todayIso()}T17:00`,
      breakMinutes: "30",
      reason: "",
    });
  }

  function startEdit(e: Entry) {
    setEdit({
      mode: "edit",
      id: e.id,
      startedAt: toLocalInput(e.startedAt),
      endedAt: toLocalInput(e.endedAt),
      breakMinutes: String(e.breakMinutes),
      reason: "",
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Zeit-Korrektur</h1>
          <p className="text-sm text-muted-foreground">
            Stempelungen anlegen, bearbeiten, löschen. Jede Änderung erzeugt einen Audit-Eintrag.
          </p>
        </div>
        <Button onClick={startCreate} disabled={!staffQ.data?.length}>
          Neuer Eintrag
        </Button>
      </div>

      <Card className="p-4 space-y-3">
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <Label htmlFor="from">Von</Label>
            <Input id="from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="to">Bis</Label>
            <Input id="to" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
          <div className="ml-auto text-sm">
            Wasserlinie:{" "}
            {lockedThrough ? (
              <Badge variant="secondary">≤ {lockedThrough} gesperrt</Badge>
            ) : (
              <Badge variant="outline">keine Sperre</Badge>
            )}
          </div>
        </div>
      </Card>

      {isAdmin && (
        <Card className="p-4 space-y-3">
          <div className="font-medium">Wasserlinie verschieben (nur Admin)</div>
          <p className="text-sm text-muted-foreground">
            Alle Geschäftstage ≤ dem gewählten Datum werden für sämtliche Rollen gesperrt — auch für
            Manager. Leer lassen, um die Sperre aufzuheben.
          </p>
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1">
              <Label htmlFor="lock">Gesperrt bis (inklusive)</Label>
              <Input
                id="lock"
                type="date"
                value={lockInput}
                onChange={(e) => setLockInput(e.target.value)}
              />
            </div>
            <Button onClick={() => lockMut.mutate()} disabled={lockMut.isPending}>
              {lockMut.isPending ? "Wird gespeichert…" : "Speichern"}
            </Button>
          </div>
        </Card>
      )}

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Tag</TableHead>
              <TableHead>Mitarbeiter</TableHead>
              <TableHead>Beginn</TableHead>
              <TableHead>Ende</TableHead>
              <TableHead className="text-right">Pause</TableHead>
              <TableHead>Quelle</TableHead>
              <TableHead className="text-right">Aktion</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {listQ.isLoading && (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-muted-foreground">
                  Lade…
                </TableCell>
              </TableRow>
            )}
            {!listQ.isLoading && entries.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-muted-foreground">
                  Keine Einträge im Zeitraum.
                </TableCell>
              </TableRow>
            )}
            {entries.map((e) => {
              const locked = lockedThrough !== null && e.businessDate <= lockedThrough;
              return (
                <TableRow key={e.id}>
                  <TableCell>
                    {e.businessDate} {locked && <Badge variant="secondary">🔒</Badge>}
                  </TableCell>
                  <TableCell>{e.staffName}</TableCell>
                  <TableCell>
                    {new Date(e.startedAt).toLocaleTimeString("de-DE", {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </TableCell>
                  <TableCell>
                    {e.endedAt
                      ? new Date(e.endedAt).toLocaleTimeString("de-DE", {
                          hour: "2-digit",
                          minute: "2-digit",
                        })
                      : "läuft"}
                  </TableCell>
                  <TableCell className="text-right">{e.breakMinutes} min</TableCell>
                  <TableCell>
                    <Badge variant={e.source === "manual" ? "default" : "outline"}>
                      {e.source}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right space-x-2">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={locked}
                      onClick={() => startEdit(e)}
                    >
                      Bearbeiten
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      disabled={locked}
                      onClick={() => setDeleteTarget({ id: e.id, reason: "" })}
                    >
                      Löschen
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </Card>

      <Dialog open={edit !== null} onOpenChange={(o) => !o && setEdit(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {edit?.mode === "create" ? "Neuer Eintrag" : "Eintrag bearbeiten"}
            </DialogTitle>
            <DialogDescription>Begründung wird im Audit-Log gespeichert.</DialogDescription>
          </DialogHeader>
          {edit && (
            <div className="space-y-3">
              {edit.mode === "create" && (
                <div className="space-y-1">
                  <Label>Mitarbeiter</Label>
                  <select
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    value={edit.staffId}
                    onChange={(ev) => setEdit({ ...edit, staffId: ev.target.value })}
                  >
                    {(staffQ.data ?? []).map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.displayName}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              <div className="space-y-1">
                <Label>Beginn</Label>
                <Input
                  type="datetime-local"
                  value={edit.startedAt}
                  onChange={(ev) => setEdit({ ...edit, startedAt: ev.target.value })}
                />
              </div>
              <div className="space-y-1">
                <Label>Ende (leer = noch offen)</Label>
                <Input
                  type="datetime-local"
                  value={edit.endedAt}
                  onChange={(ev) => setEdit({ ...edit, endedAt: ev.target.value })}
                />
              </div>
              <div className="space-y-1">
                <Label>Pause (Minuten)</Label>
                <Input
                  type="number"
                  min={0}
                  max={479}
                  value={edit.breakMinutes}
                  onChange={(ev) => setEdit({ ...edit, breakMinutes: ev.target.value })}
                />
              </div>
              <div className="space-y-1">
                <Label>Begründung *</Label>
                <Input
                  placeholder="z. B. PIN-Stempelung nachgetragen"
                  value={edit.reason}
                  onChange={(ev) => setEdit({ ...edit, reason: ev.target.value })}
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEdit(null)}>
              Abbrechen
            </Button>
            <Button
              disabled={
                !edit || edit.reason.trim().length < 3 || createMut.isPending || updateMut.isPending
              }
              onClick={() => (edit?.mode === "create" ? createMut.mutate() : updateMut.mutate())}
            >
              Speichern
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteTarget !== null} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Eintrag löschen</DialogTitle>
            <DialogDescription>
              Der vollständige Zeilen-Snapshot wird im Audit-Log gespeichert und bleibt
              rekonstruierbar.
            </DialogDescription>
          </DialogHeader>
          {deleteTarget && (
            <div className="space-y-1">
              <Label>Begründung *</Label>
              <Input
                placeholder="z. B. Doppel-Stempelung"
                value={deleteTarget.reason}
                onChange={(ev) => setDeleteTarget({ ...deleteTarget, reason: ev.target.value })}
              />
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>
              Abbrechen
            </Button>
            <Button
              variant="destructive"
              disabled={
                !deleteTarget || deleteTarget.reason.trim().length < 3 || deleteMut.isPending
              }
              onClick={() => deleteMut.mutate()}
            >
              Löschen
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
