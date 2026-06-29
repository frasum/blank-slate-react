import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { fmtCents } from "@/lib/format";
import {
  deleteSessionTipPoolEntry,
  getTipPoolOverview,
  listSessionTipPoolEntries,
  upsertSessionTipPoolEntry,
} from "@/lib/cash/cash.functions";
import { kitchenShiftMinutes } from "@/lib/cash/kitchen-shift-hours";

type StaffListItem = {
  id: string;
  displayName: string;
  isActive: boolean;
  locationIds: string[];
};

type ManualDraft = {
  staffId: string;
  department: "kitchen" | "service";
  hours: string;
  minutes: string;
  shiftStart: string;
  shiftEnd: string;
};

export function TipPoolCard({
  sessionId,
  locationId,
  hasSettlements,
  editable,
  staffList,
}: {
  sessionId: string;
  locationId: string;
  hasSettlements: boolean;
  editable: boolean;
  staffList: StaffListItem[];
}) {
  const qc = useQueryClient();
  const fetchPool = useServerFn(getTipPoolOverview);
  const fetchEntries = useServerFn(listSessionTipPoolEntries);
  const callUpsert = useServerFn(upsertSessionTipPoolEntry);
  const callDelete = useServerFn(deleteSessionTipPoolEntry);

  const poolQ = useQuery({
    queryKey: ["cash", "tip-pool", sessionId],
    queryFn: () => fetchPool({ data: { sessionId } }),
    enabled: hasSettlements,
  });
  const entriesQ = useQuery({
    queryKey: ["cash", "tip-pool-entries", sessionId],
    queryFn: () => fetchEntries({ data: { sessionId } }),
    enabled: hasSettlements,
  });

  const [editOpen, setEditOpen] = useState(false);
  const [draft, setDraft] = useState<ManualDraft>({
    staffId: "",
    department: "service",
    hours: "0",
    minutes: "00",
    shiftStart: "",
    shiftEnd: "",
  });

  const invalidatePool = () => {
    void qc.invalidateQueries({ queryKey: ["cash", "tip-pool", sessionId] });
    void qc.invalidateQueries({ queryKey: ["cash", "tip-pool-entries", sessionId] });
  };

  const upsertMut = useMutation({
    mutationFn: () => {
      if (!draft.staffId) throw new Error("Bitte einen Mitarbeiter wählen.");
      const useShift =
        draft.department === "kitchen" && Boolean(poolQ.data?.kitchenManualOnly);
      if (useShift) {
        if (!draft.shiftStart || !draft.shiftEnd) {
          throw new Error("Start- und Endzeit angeben.");
        }
        // Validierung serverseitig, hier nur frühe Fehlermeldung:
        kitchenShiftMinutes(draft.shiftStart, draft.shiftEnd);
        return callUpsert({
          data: {
            sessionId,
            staffId: draft.staffId,
            department: draft.department,
            shiftStart: draft.shiftStart,
            shiftEnd: draft.shiftEnd,
          },
        });
      }
      const h = Number.parseInt(draft.hours, 10);
      const m = Number.parseInt(draft.minutes, 10);
      if (!Number.isFinite(h) || h < 0 || h > 24) throw new Error("Stunden 0–24.");
      if (!Number.isFinite(m) || m < 0 || m > 59) throw new Error("Minuten 0–59.");
      const total = h * 60 + m;
      if (total > 1440) throw new Error("Maximal 24 Stunden.");
      return callUpsert({
        data: {
          sessionId,
          staffId: draft.staffId,
          department: draft.department,
          hoursMinutes: total,
        },
      });
    },
    onSuccess: () => {
      toast.success("Pool-Eintrag gespeichert.");
      setDraft({
        staffId: "",
        department: "service",
        hours: "0",
        minutes: "00",
        shiftStart: "",
        shiftEnd: "",
      });
      invalidatePool();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMut = useMutation({
    mutationFn: (staffId: string) => callDelete({ data: { sessionId, staffId } }),
    onSuccess: () => {
      toast.success("Pool-Eintrag entfernt.");
      invalidatePool();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!hasSettlements) return null;
  if (poolQ.isLoading) {
    return <Card className="p-4 text-sm text-muted-foreground">Lade Trinkgeld-Pool…</Card>;
  }
  if (poolQ.error || !poolQ.data) {
    return (
      <Card className="p-4 text-sm text-destructive">
        Trinkgeld-Pool konnte nicht geladen werden.
      </Card>
    );
  }
  const data = poolQ.data;
  const kitchenManualOnly = data.kitchenManualOnly;
  const manualSet = new Set(data.manualStaffIds);
  const kitchen = data.shares.filter((s) => s.department === "kitchen");
  const service = data.shares.filter((s) => s.department === "service");
  const entries = entriesQ.data ?? [];
  const eligibleStaff = staffList.filter(
    (s) => s.isActive && (locationId === "" || s.locationIds.includes(locationId)),
  );

  const renderTable = (title: string, rows: typeof data.shares, _poolCents: number) => {
    return (
      <Card className="flex-1">
        <div className="border-b px-4 py-3 text-sm font-medium">{title}</div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Mitarbeiter</TableHead>
              <TableHead>Abt.</TableHead>
              <TableHead className="text-right">Stunden</TableHead>
              <TableHead className="text-right">Anteil</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={4} className="text-center text-muted-foreground">
                  Keine teilnehmenden Mitarbeiter.
                </TableCell>
              </TableRow>
            )}
            {rows.map((r) => (
              <TableRow key={r.staffId}>
                <TableCell>
                  {data.staffNames[r.staffId] ?? r.staffId}
                  {manualSet.has(r.staffId) && (
                    <Badge variant="secondary" className="ml-2">
                      manuell
                    </Badge>
                  )}
                </TableCell>
                <TableCell>{r.department}</TableCell>
                <TableCell className="text-right font-mono">
                  {r.hoursWorked.toFixed(2).replace(".", ",")}
                </TableCell>
                <TableCell className="text-right font-mono">{fmtCents(r.shareCents)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    );
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="text-sm font-medium">Trinkgeld-Pool</div>
        <Button size="sm" variant="outline" disabled={!editable} onClick={() => setEditOpen(true)}>
          Pool bearbeiten
        </Button>
      </div>
      <div className="flex flex-col gap-4 md:flex-row">
        {renderTable(
          kitchenManualOnly
            ? "Küchen-Pool (manuell — Stempelzeiten der Küche werden ignoriert)"
            : "Küchen-Pool",
          kitchen,
          data.kitchenPoolCents,
        )}
        {renderTable("Service-Pool", service, data.servicePoolCents)}
      </div>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Manuelle Pool-Einträge</DialogTitle>
            <DialogDescription>
              Manueller Eintrag ersetzt die Stempelzeiten dieses Mitarbeiters für die
              Pool-Verteilung. Stunden = 0 schließt jemanden explizit aus.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Mitarbeiter</TableHead>
                  <TableHead>Abt.</TableHead>
                  <TableHead className="text-right">Stunden</TableHead>
                  <TableHead className="w-20"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {entries.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center text-muted-foreground">
                      Noch keine manuellen Einträge.
                    </TableCell>
                  </TableRow>
                )}
                {entries.map((e) => {
                  const h = Math.floor(e.hoursMinutes / 60);
                  const m = e.hoursMinutes % 60;
                  return (
                    <TableRow key={e.staffId}>
                      <TableCell>{data.staffNames[e.staffId] ?? e.staffId}</TableCell>
                      <TableCell>{e.department}</TableCell>
                      <TableCell className="text-right font-mono">
                        {h}:{m.toString().padStart(2, "0")}
                      </TableCell>
                      <TableCell>
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={deleteMut.isPending}
                          onClick={() => deleteMut.mutate(e.staffId)}
                        >
                          <X className="size-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>

            <div className="grid grid-cols-12 items-end gap-2 border-t pt-3">
              <div className="col-span-5">
                <Label className="text-xs">Mitarbeiter</Label>
                <Select
                  value={draft.staffId}
                  onValueChange={(v) => setDraft({ ...draft, staffId: v })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Wählen…" />
                  </SelectTrigger>
                  <SelectContent>
                    {eligibleStaff.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.displayName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="col-span-3">
                <Label className="text-xs">Abt.</Label>
                <Select
                  value={draft.department}
                  onValueChange={(v) =>
                    setDraft({ ...draft, department: v as "kitchen" | "service" })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="service">service</SelectItem>
                    <SelectItem value="kitchen">kitchen</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {draft.department === "kitchen" && kitchenManualOnly ? (
                <>
                  <div className="col-span-2">
                    <Label className="text-xs">Von</Label>
                    <Input
                      type="time"
                      value={draft.shiftStart}
                      onChange={(e) => setDraft({ ...draft, shiftStart: e.target.value })}
                    />
                  </div>
                  <div className="col-span-2">
                    <Label className="text-xs">Bis</Label>
                    <Input
                      type="time"
                      value={draft.shiftEnd}
                      onChange={(e) => setDraft({ ...draft, shiftEnd: e.target.value })}
                    />
                  </div>
                  {draft.shiftStart && draft.shiftEnd && (
                    <div className="col-span-12 -mt-1 text-xs text-muted-foreground">
                      Dauer:{" "}
                      {(() => {
                        try {
                          const mins = kitchenShiftMinutes(draft.shiftStart, draft.shiftEnd);
                          const hh = Math.floor(mins / 60);
                          const mm = mins % 60;
                          return `${hh}:${mm.toString().padStart(2, "0")} h`;
                        } catch {
                          return "ungültig";
                        }
                      })()}
                    </div>
                  )}
                </>
              ) : (
                <>
                  <div className="col-span-2">
                    <Label className="text-xs">Std.</Label>
                    <Input
                      inputMode="numeric"
                      value={draft.hours}
                      onChange={(e) => setDraft({ ...draft, hours: e.target.value })}
                    />
                  </div>
                  <div className="col-span-2">
                    <Label className="text-xs">Min.</Label>
                    <Input
                      inputMode="numeric"
                      value={draft.minutes}
                      onChange={(e) => setDraft({ ...draft, minutes: e.target.value })}
                    />
                  </div>
                </>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditOpen(false)}>
              Schließen
            </Button>
            <Button
              onClick={() => upsertMut.mutate()}
              disabled={!draft.staffId || upsertMut.isPending}
            >
              {upsertMut.isPending ? "Speichert…" : "Eintrag speichern"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
