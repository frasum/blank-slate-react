// D1/D2a — Dienstplan-Grid. D1 = Read-only. D2a = Manager+ können Schichten
// per Klick auf Zellen anlegen/ändern/löschen; Updates kommen per Realtime
// live bei allen Clients an. Periode 'locked' = serverseitig blockiert.

import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import * as React from "react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { listLocations } from "@/lib/admin/locations.functions";
import { listPeriods } from "@/lib/time/time-admin.functions";
import { serviceMarker } from "@/lib/roster/service-marker";
import {
  createRosterShift,
  deleteRosterShift,
  getRosterShifts,
  getStaffForRoster,
  getStaffCrossBookings,
  listSkills,
  updateRosterShiftSkill,
  updateRosterShiftStatus,
  type RosterShift,
  type RosterCrossBooking,
  type RosterSkill,
  type RosterStaffRow,
} from "@/lib/roster/roster.functions";

export const Route = createFileRoute("/_authenticated/admin/dienstplan")({
  head: () => ({ meta: [{ title: "Dienstplan" }] }),
  component: DienstplanPage,
});

type GridArea = "kitchen" | "service";

const AREA_LABEL: Record<GridArea, string> = {
  kitchen: "KÜCHE",
  service: "SERVICE",
};
const AREA_BAR: Record<GridArea, string> = {
  kitchen: "bg-orange-400",
  service: "bg-blue-400",
};
const AREA_BG: Record<GridArea, string> = {
  kitchen: "bg-orange-50",
  service: "bg-blue-50",
};
const AREA_ORDER: GridArea[] = ["kitchen", "service"];
const AREA_SHORT: Record<"kitchen" | "service" | "gl", string> = {
  kitchen: "Küche",
  service: "Service",
  gl: "Service",
};

function parseIsoDate(iso: string): Date {
  return new Date(`${iso}T12:00:00Z`);
}
function fmtIso(d: Date): string {
  return d.toISOString().slice(0, 10);
}
function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setUTCDate(x.getUTCDate() + n);
  return x;
}
function daysBetween(fromIso: string, toIso: string): string[] {
  const out: string[] = [];
  let cur = parseIsoDate(fromIso);
  const end = parseIsoDate(toIso);
  while (cur.getTime() <= end.getTime()) {
    out.push(fmtIso(cur));
    cur = addDays(cur, 1);
  }
  return out;
}
function isWeekend(iso: string): boolean {
  const dow = parseIsoDate(iso).getUTCDay();
  return dow === 0 || dow === 6;
}
function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}
function abbr(name: string | null | undefined): string {
  if (!name) return "";
  const trimmed = name.trim();
  if (trimmed.length === 0) return "";
  return trimmed.slice(0, 2).toUpperCase();
}
function dayLabel(iso: string): string {
  const d = parseIsoDate(iso);
  const dows = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];
  return `${dows[d.getUTCDay()]} ${String(d.getUTCDate()).padStart(2, "0")}.${String(d.getUTCMonth() + 1).padStart(2, "0")}.`;
}

// Skills, die der Mitarbeiter laut staff_skills hat. Falls leer:
// Fallback = alle Skills der zur Area passenden Kategorie.
function skillsForCell(
  staffRow: RosterStaffRow,
  area: GridArea,
  allSkills: RosterSkill[],
): RosterSkill[] {
  const assigned = allSkills.filter((s) => staffRow.skillIds.includes(s.id));
  // Service-Bereich akzeptiert auch gl/other Skills (GL, Hausmeister)
  const allowedCategories =
    area === "service"
      ? new Set<RosterSkill["category"]>(["service", "gl", "other"])
      : new Set<RosterSkill["category"]>(["kitchen"]);
  if (assigned.length > 0) {
    return assigned.filter((s) => allowedCategories.has(s.category));
  }
  return allSkills.filter((s) => allowedCategories.has(s.category));
}

function PillVisual({ shift, area }: { shift: RosterShift; area: GridArea }) {
  const opacity = shift.status === "confirmed" ? "opacity-100" : "opacity-70";
  if (area === "service") {
    const label = serviceMarker(shift.skillName);
    return (
      <div
        className={`mx-auto flex h-6 w-10 items-center justify-center rounded border border-foreground/40 bg-background text-[11px] font-bold text-foreground ${opacity}`}
        title={`${shift.skillName ?? "—"} (${shift.status})`}
      >
        {label}
      </div>
    );
  }
  const bg = shift.skillColor ?? "#9ca3af";
  return (
    <div
      className={`mx-auto flex h-6 w-10 items-center justify-center rounded text-[11px] font-bold text-white ${opacity}`}
      style={{ backgroundColor: bg }}
      title={`${shift.skillName ?? "—"} (${shift.status})`}
    >
      {abbr(shift.skillName)}
    </div>
  );
}

function EmptyCellMarker({ canEdit }: { canEdit: boolean }) {
  return (
    <div
      className={`mx-auto h-6 w-10 rounded border border-dashed ${
        canEdit ? "border-muted-foreground/30 hover:border-primary" : "border-transparent"
      }`}
    />
  );
}

type CellAction =
  | { kind: "create"; staffId: string; shiftDate: string; area: GridArea; skillId: string | null }
  | { kind: "delete"; id: string }
  | { kind: "status"; id: string; status: "planned" | "confirmed" }
  | { kind: "skill"; id: string; skillId: string };

function CellPopover({
  open,
  onOpenChange,
  staffRow,
  area,
  iso,
  shift,
  allSkills,
  onAction,
  busy,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  staffRow: RosterStaffRow;
  area: GridArea;
  iso: string;
  shift: RosterShift | undefined;
  allSkills: RosterSkill[];
  onAction: (a: CellAction) => void;
  busy: boolean;
  children: React.ReactNode;
}) {
  const candidates = skillsForCell(staffRow, area, allSkills);

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent className="w-64 p-3" align="center">
        <div className="mb-2 text-xs text-muted-foreground">
          {staffRow.displayName} · {AREA_LABEL[area]} · {dayLabel(iso)}
        </div>

        {shift ? (
          <>
            <div className="mb-2 text-xs font-medium">Skill ändern</div>
            <div className="mb-3 flex flex-wrap gap-1.5">
              {candidates.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  disabled={busy}
                  onClick={() => onAction({ kind: "skill", id: shift.id, skillId: s.id })}
                  className={`rounded px-2 py-1 text-[11px] font-bold text-white disabled:opacity-50 ${
                    s.id === shift.skillId ? "ring-2 ring-offset-1 ring-foreground" : ""
                  }`}
                  style={{ backgroundColor: s.color ?? "#9ca3af" }}
                >
                  {s.name}
                </button>
              ))}
              {candidates.length === 0 && (
                <span className="text-xs text-muted-foreground">Keine Skills verfügbar.</span>
              )}
            </div>

            <div className="mb-3 flex items-center justify-between gap-2">
              <span className="text-xs font-medium">Status</span>
              <div className="flex gap-1">
                <Button
                  size="sm"
                  variant={shift.status === "planned" ? "default" : "outline"}
                  disabled={busy || shift.status === "planned"}
                  onClick={() => onAction({ kind: "status", id: shift.id, status: "planned" })}
                  className="h-7 text-xs"
                >
                  geplant
                </Button>
                <Button
                  size="sm"
                  variant={shift.status === "confirmed" ? "default" : "outline"}
                  disabled={busy || shift.status === "confirmed"}
                  onClick={() => onAction({ kind: "status", id: shift.id, status: "confirmed" })}
                  className="h-7 text-xs"
                >
                  bestätigt
                </Button>
              </div>
            </div>

            <Button
              size="sm"
              variant="destructive"
              disabled={busy}
              onClick={() => onAction({ kind: "delete", id: shift.id })}
              className="h-7 w-full text-xs"
            >
              Schicht löschen
            </Button>
          </>
        ) : (
          <>
            <div className="mb-2 text-xs font-medium">Schicht anlegen — Skill wählen</div>
            <div className="flex flex-wrap gap-1.5">
              {candidates.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  disabled={busy}
                  onClick={() =>
                    onAction({
                      kind: "create",
                      staffId: staffRow.staffId,
                      shiftDate: iso,
                      area,
                      skillId: s.id,
                    })
                  }
                  className="rounded px-2 py-1 text-[11px] font-bold text-white disabled:opacity-50"
                  style={{ backgroundColor: s.color ?? "#9ca3af" }}
                >
                  {s.name}
                </button>
              ))}
              {candidates.length === 0 && (
                <span className="text-xs text-muted-foreground">
                  Keine passenden Skills hinterlegt.
                </span>
              )}
            </div>
          </>
        )}
      </PopoverContent>
    </Popover>
  );
}

function DienstplanPage() {
  const today = todayIso();
  const auth = useAuth();
  const role = auth.identity?.role ?? null;
  const canEdit = role === "manager" || role === "admin";
  const qc = useQueryClient();

  const periodsQ = useQuery({ queryKey: ["periods"], queryFn: () => listPeriods() });
  const locationsQ = useQuery({ queryKey: ["locations"], queryFn: () => listLocations() });
  const skillsQ = useQuery({ queryKey: ["skills"], queryFn: () => listSkills() });

  const [periodId, setPeriodId] = useState<string | null>(null);
  const [locationId, setLocationId] = useState<string | null>(null);
  const [openCell, setOpenCell] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const periods = useMemo(() => periodsQ.data ?? [], [periodsQ.data]);
  const locations = useMemo(() => locationsQ.data ?? [], [locationsQ.data]);
  const allSkills = useMemo(() => skillsQ.data ?? [], [skillsQ.data]);

  const effectivePeriod = useMemo(() => {
    if (periodId) return periods.find((p) => p.id === periodId) ?? null;
    return periods.find((p) => p.startDate <= today && today <= p.endDate) ?? periods[0] ?? null;
  }, [periods, periodId, today]);
  const effectiveLocationId = locationId ?? locations[0]?.id ?? null;

  const periodLocked = effectivePeriod?.status === "locked";

  const days = useMemo(
    () => (effectivePeriod ? daysBetween(effectivePeriod.startDate, effectivePeriod.endDate) : []),
    [effectivePeriod],
  );

  const staffQ = useQuery({
    queryKey: ["roster-staff", effectiveLocationId],
    queryFn: () => getStaffForRoster({ data: { locationId: effectiveLocationId! } }),
    enabled: !!effectiveLocationId,
  });
  const shiftsKey = [
    "roster-shifts",
    effectiveLocationId,
    effectivePeriod?.startDate,
    effectivePeriod?.endDate,
  ];
  const shiftsQ = useQuery({
    queryKey: shiftsKey,
    queryFn: () =>
      getRosterShifts({
        data: {
          locationId: effectiveLocationId!,
          fromDate: effectivePeriod!.startDate,
          toDate: effectivePeriod!.endDate,
        },
      }),
    enabled: !!effectiveLocationId && !!effectivePeriod,
  });

  const crossQ = useQuery({
    queryKey: [
      "roster-cross-bookings",
      effectivePeriod?.startDate,
      effectivePeriod?.endDate,
    ],
    queryFn: () =>
      getStaffCrossBookings({
        data: {
          fromDate: effectivePeriod!.startDate,
          toDate: effectivePeriod!.endDate,
        },
      }),
    enabled: !!effectivePeriod,
  });

  // Realtime: jede Änderung an roster_shifts der aktuellen Org → Query invalidieren.
  useEffect(() => {
    if (!effectiveLocationId) return;
    const channel = supabase
      .channel(`roster-shifts-${effectiveLocationId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "roster_shifts" }, () => {
        qc.invalidateQueries({ queryKey: ["roster-shifts"] });
        qc.invalidateQueries({ queryKey: ["roster-cross-bookings"] });
      })
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [effectiveLocationId, qc]);

  const staff = useMemo(() => staffQ.data ?? [], [staffQ.data]);
  const shifts = useMemo(() => shiftsQ.data ?? [], [shiftsQ.data]);
  const crossBookings = useMemo<RosterCrossBooking[]>(() => crossQ.data ?? [], [crossQ.data]);

  const shiftIndex = useMemo(() => {
    const m = new Map<string, RosterShift>();
    for (const s of shifts) {
      m.set(`${s.staffId}|${s.shiftDate}|${s.area}`, s);
    }
    return m;
  }, [shifts]);

  // Index aller Buchungen pro (staffId, date), gesamtorgweit/standortweit.
  const bookingsByStaffDate = useMemo(() => {
    const m = new Map<string, RosterCrossBooking[]>();
    for (const b of crossBookings) {
      const k = `${b.staffId}|${b.shiftDate}`;
      const arr = m.get(k) ?? [];
      arr.push(b);
      m.set(k, arr);
    }
    return m;
  }, [crossBookings]);

  const grouped = useMemo(() => {
    const g = new Map<GridArea, RosterStaffRow[]>();
    for (const a of AREA_ORDER) g.set(a, []);
    for (const row of staff) g.get(row.department)?.push(row);
    return g;
  }, [staff]);

  async function handleAction(a: CellAction) {
    if (!canEdit || periodLocked) return;
    setBusy(true);
    try {
      if (a.kind === "create") {
        await createRosterShift({
          data: {
            locationId: effectiveLocationId!,
            staffId: a.staffId,
            shiftDate: a.shiftDate,
            area: a.area,
            skillId: a.skillId,
          },
        });
        toast.success("Schicht angelegt");
      } else if (a.kind === "delete") {
        await deleteRosterShift({ data: { id: a.id } });
        toast.success("Schicht gelöscht");
      } else if (a.kind === "status") {
        await updateRosterShiftStatus({ data: { id: a.id, status: a.status } });
      } else if (a.kind === "skill") {
        await updateRosterShiftSkill({ data: { id: a.id, skillId: a.skillId } });
      }
      setOpenCell(null);
      qc.invalidateQueries({ queryKey: ["roster-shifts"] });
      qc.invalidateQueries({ queryKey: ["roster-cross-bookings"] });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(msg);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <TooltipProvider delayDuration={150}>
      <header className="flex flex-wrap items-end gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Dienstplan</h1>
          <p className="text-sm text-muted-foreground">
            Vorausplanung — wer arbeitet wann wo.{" "}
            {canEdit ? (
              periodLocked ? (
                <span className="text-destructive">Periode gesperrt.</span>
              ) : (
                <span>Klick in Zelle zum Bearbeiten.</span>
              )
            ) : (
              <span>(Read-only)</span>
            )}
          </p>
        </div>
        <div className="ml-auto flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1 text-xs">
            <span className="text-muted-foreground">Standort</span>
            <select
              className="h-9 rounded-md border border-input bg-background px-2 text-sm"
              value={effectiveLocationId ?? ""}
              onChange={(e) => setLocationId(e.target.value || null)}
            >
              {locations.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs">
            <span className="text-muted-foreground">Periode</span>
            <select
              className="h-9 rounded-md border border-input bg-background px-2 text-sm"
              value={effectivePeriod?.id ?? ""}
              onChange={(e) => setPeriodId(e.target.value || null)}
            >
              {periods.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label} ({p.startDate} – {p.endDate})
                </option>
              ))}
            </select>
          </label>
        </div>
      </header>

      {!effectivePeriod ? (
        <Card className="p-6 text-sm text-muted-foreground">
          Keine Periode angelegt. Lege im Tab „Perioden" eine an.
        </Card>
      ) : !effectiveLocationId ? (
        <Card className="p-6 text-sm text-muted-foreground">Kein Standort verfügbar.</Card>
      ) : (
        <Card className="overflow-x-auto">
          <table className="w-full border-collapse text-xs">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="sticky left-0 z-10 min-w-[180px] bg-muted/50 px-3 py-2 text-left font-medium">
                  Mitarbeiter
                </th>
                {days.map((iso) => {
                  const we = isWeekend(iso);
                  const isToday = iso === today;
                  return (
                    <th
                      key={iso}
                      className={`min-w-[56px] px-1 py-2 text-center font-medium ${
                        we ? "bg-muted text-muted-foreground" : ""
                      } ${isToday ? "ring-2 ring-primary ring-inset" : ""}`}
                    >
                      {dayLabel(iso)}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {AREA_ORDER.map((area) => {
                const rows = grouped.get(area) ?? [];
                if (rows.length === 0) return null;
                return (
                  <React.Fragment key={`area-${area}`}>
                    <tr className={AREA_BG[area]}>
                      <td
                        colSpan={days.length + 1}
                        className="px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider text-foreground"
                      >
                        <span
                          className={`mr-2 inline-block h-2 w-2 rounded-full ${AREA_BAR[area]}`}
                        />
                        {AREA_LABEL[area]}
                      </td>
                    </tr>
                    {rows.map((row) => (
                      <tr
                        key={`${area}-${row.staffId}`}
                        className="border-b last:border-b-0 hover:bg-muted/30"
                      >
                        <td className="sticky left-0 z-10 min-w-[180px] bg-background px-3 py-1.5 font-medium">
                          {row.displayName}
                        </td>
                        {days.map((iso) => {
                          const we = isWeekend(iso);
                          const isToday = iso === today;
                          const shift = shiftIndex.get(`${row.staffId}|${iso}|${area}`);
                          const cellKey = `${row.staffId}|${iso}|${area}`;
                          const editable = canEdit && !periodLocked;
                          const otherBookings = !shift
                            ? bookingsByStaffDate.get(`${row.staffId}|${iso}`) ?? []
                            : [];
                          const cellBody = shift ? (
                            <PillVisual shift={shift} area={area} />
                          ) : (
                            <EmptyCellMarker canEdit={editable} />
                          );
                          return (
                            <td
                              key={iso}
                              className={`relative px-0.5 py-1 text-center ${
                                we ? "bg-muted/40" : ""
                              } ${isToday ? "bg-primary/5" : ""}`}
                            >
                              {editable ? (
                                <CellPopover
                                  open={openCell === cellKey}
                                  onOpenChange={(o) => setOpenCell(o ? cellKey : null)}
                                  staffRow={row}
                                  area={area}
                                  iso={iso}
                                  shift={shift}
                                  allSkills={allSkills}
                                  onAction={handleAction}
                                  busy={busy}
                                >
                                  <button
                                    type="button"
                                    className="block w-full cursor-pointer bg-transparent"
                                    aria-label={
                                      shift
                                        ? `Schicht bearbeiten: ${row.displayName}, ${iso}`
                                        : `Schicht anlegen: ${row.displayName}, ${iso}`
                                    }
                                  >
                                    {cellBody}
                                  </button>
                                </CellPopover>
                              ) : (
                                cellBody
                              )}
                              {otherBookings.length > 0 && (
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <span
                                      className="absolute right-0.5 top-0.5 inline-block h-1.5 w-1.5 rounded-full bg-red-500"
                                      aria-label="Bereits anderswo eingeteilt"
                                    />
                                  </TooltipTrigger>
                                  <TooltipContent className="max-w-xs">
                                    <div className="space-y-0.5 text-xs">
                                      {otherBookings.map((b, i) => (
                                        <div key={i}>
                                          Bereits: {b.locationName} · {AREA_SHORT[b.area]}
                                          {b.skillName ? ` · ${b.skillName}` : ""}
                                        </div>
                                      ))}
                                    </div>
                                  </TooltipContent>
                                </Tooltip>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </React.Fragment>
                );
              })}
              {staff.length === 0 && (
                <tr>
                  <td
                    colSpan={days.length + 1}
                    className="px-3 py-6 text-center text-muted-foreground"
                  >
                    Keine Mitarbeiter an diesem Standort.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </Card>
      )}
      </TooltipProvider>
    </div>
  );
}
