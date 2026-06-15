// Roster-Grid mit Tabs (Küche/Service), Header-Zählungen, Σ-Spalte
// mit Cross-Restaurant-Tooltip, Drag-&-Drop-Drop-Zellen und
// Paint-Mode-Klicklogik. Service-Schichten nutzen service-marker.ts.
import * as React from "react";
import { useDroppable } from "@dnd-kit/core";
import { ChefHat, UtensilsCrossed, Umbrella, HeartPulse } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { ShiftPill } from "./ShiftPill";
import { CellQuickPopover } from "./CellQuickPopover";
import { PillConfirmPopover } from "./PillConfirmPopover";
import type { PaintSelection } from "./PaintToolbar";
import type {
  RosterShift,
  RosterSkill,
  RosterStaffRow,
  RosterCrossBooking,
} from "@/lib/roster/roster.functions";
import { DENSITY_ROW_HEIGHT, type Density } from "@/hooks/use-density";

type GridArea = "kitchen" | "service";

const AREA_LABEL: Record<GridArea, string> = { kitchen: "Küche", service: "Service" };
const AREA_SHORT: Record<"kitchen" | "service" | "gl", string> = {
  kitchen: "Küche",
  service: "Service",
  gl: "Service",
};

function parseIso(iso: string): Date {
  return new Date(`${iso}T12:00:00Z`);
}
function isWeekendIso(iso: string): boolean {
  const dow = parseIso(iso).getUTCDay();
  return dow === 0 || dow === 6;
}
function dayHeader(iso: string): { dow: string; dm: string } {
  const d = parseIso(iso);
  const dows = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];
  return {
    dow: dows[d.getUTCDay()],
    dm: `${String(d.getUTCDate()).padStart(2, "0")}.${String(d.getUTCMonth() + 1).padStart(2, "0")}.`,
  };
}

import { skillsForCell } from "./skills-for-cell";

type Props = {
  activeArea: GridArea;
  onActiveAreaChange: (a: GridArea) => void;
  days: string[];
  today: string;
  staff: RosterStaffRow[];
  shifts: RosterShift[];
  allSkills: RosterSkill[];
  crossBookings: RosterCrossBooking[];
  unavailableSet: Set<string>;
  absenceMap: Map<string, "urlaub" | "krank">;
  density: Density;
  canEdit: boolean;
  locked: boolean;
  paint: PaintSelection;
  busy: boolean;
  onCreate: (staffId: string, iso: string, area: GridArea, skillId: string) => Promise<void> | void;
  onDelete: (id: string) => Promise<void> | void;
  onChangeSkill: (id: string, skillId: string) => Promise<void> | void;
  onChangeStatus: (id: string, status: "planned" | "confirmed") => Promise<void> | void;
  onSetUnavailable: (staffId: string, iso: string) => Promise<void> | void;
  onClearUnavailable: (staffId: string, iso: string) => Promise<void> | void;
  onSetAbsence: (staffId: string, iso: string, type: "urlaub" | "krank") => Promise<void> | void;
  onClearAbsence: (staffId: string, iso: string) => Promise<void> | void;
};

export function RosterGrid({
  activeArea,
  onActiveAreaChange,
  days,
  today,
  staff,
  shifts,
  allSkills,
  crossBookings,
  unavailableSet,
  absenceMap,
  density,
  canEdit,
  locked,
  paint,
  busy,
  onCreate,
  onDelete,
  onChangeSkill,
  onChangeStatus,
  onSetUnavailable,
  onClearUnavailable,
  onSetAbsence,
  onClearAbsence,
}: Props) {
  const [openCell, setOpenCell] = React.useState<string | null>(null);
  const [openPill, setOpenPill] = React.useState<string | null>(null);

  const editable = canEdit && !locked;

  const visibleStaff = React.useMemo(
    () => staff.filter((r) => r.department === activeArea),
    [staff, activeArea],
  );

  const shiftIndex = React.useMemo(() => {
    const m = new Map<string, RosterShift>();
    for (const s of shifts) m.set(`${s.staffId}|${s.shiftDate}|${s.area}`, s);
    return m;
  }, [shifts]);

  // Tages-Zählung pro (iso, area=activeArea).
  const dayCount = React.useMemo(() => {
    const m = new Map<string, number>();
    for (const s of shifts) {
      const a: GridArea = s.area === "kitchen" ? "kitchen" : "service";
      if (a !== activeArea) continue;
      m.set(s.shiftDate, (m.get(s.shiftDate) ?? 0) + 1);
    }
    return m;
  }, [shifts, activeArea]);

  // Monats-Σ pro Mitarbeiter (über alle Standorte/Bereiche via crossBookings).
  const monthSum = React.useMemo(() => {
    const m = new Map<string, number>();
    for (const b of crossBookings) m.set(b.staffId, (m.get(b.staffId) ?? 0) + 1);
    return m;
  }, [crossBookings]);

  const monthBreakdown = React.useMemo(() => {
    const m = new Map<string, Map<string, number>>();
    for (const b of crossBookings) {
      const inner = m.get(b.staffId) ?? new Map<string, number>();
      const k = `${b.locationName} · ${AREA_SHORT[b.area]}`;
      inner.set(k, (inner.get(k) ?? 0) + 1);
      m.set(b.staffId, inner);
    }
    return m;
  }, [crossBookings]);

  // Cross-Booking-Index für Markierungen in leeren Zellen.
  const otherByStaffDate = React.useMemo(() => {
    const m = new Map<string, RosterCrossBooking[]>();
    for (const b of crossBookings) {
      const k = `${b.staffId}|${b.shiftDate}`;
      const arr = m.get(k) ?? [];
      arr.push(b);
      m.set(k, arr);
    }
    return m;
  }, [crossBookings]);

  const totalArea = React.useMemo(() => {
    let n = 0;
    for (const v of dayCount.values()) n += v;
    return n;
  }, [dayCount]);

  const rowH = DENSITY_ROW_HEIGHT[density];

  async function handleEmptyCellClick(row: RosterStaffRow, iso: string) {
    if (!editable) return;
    if (paint?.kind === "skill") {
      await onCreate(row.staffId, iso, activeArea, paint.skillId);
      return;
    }
    // Eraser auf leerer Zelle: nichts tun.
    if (paint?.kind === "eraser") return;
    setOpenCell(`${row.staffId}|${iso}`);
  }

  async function handlePillClick(shift: RosterShift) {
    if (!editable) return;
    if (paint?.kind === "eraser") {
      await onDelete(shift.id);
      return;
    }
    if (paint?.kind === "skill") {
      if (shift.skillId !== paint.skillId) await onChangeSkill(shift.id, paint.skillId);
      return;
    }
    setOpenPill(shift.id);
  }

  return (
    <div className="space-y-2">
      <Tabs value={activeArea} onValueChange={(v) => onActiveAreaChange(v as GridArea)}>
        <TabsList>
          <TabsTrigger value="kitchen" className="gap-2">
            <ChefHat className="h-3.5 w-3.5" /> Küche
          </TabsTrigger>
          <TabsTrigger value="service" className="gap-2">
            <UtensilsCrossed className="h-3.5 w-3.5" /> Service
          </TabsTrigger>
        </TabsList>
      </Tabs>

      <Card className="overflow-x-auto">
        <table className="w-full border-collapse text-xs">
          <thead>
            <tr className="border-b bg-muted/50">
              <th className="sticky left-0 z-10 min-w-[180px] bg-muted/50 px-3 py-2 text-left font-medium">
                Mitarbeiter
              </th>
              {days.map((iso) => {
                const we = isWeekendIso(iso);
                const isToday = iso === today;
                const cnt = dayCount.get(iso) ?? 0;
                const { dow, dm } = dayHeader(iso);
                return (
                  <th
                    key={iso}
                    className={cn(
                      "min-w-[56px] px-1 py-1.5 text-center font-medium",
                      we && "bg-muted text-muted-foreground",
                      isToday && "ring-2 ring-primary ring-inset",
                    )}
                  >
                    <div className="flex flex-col items-center leading-tight">
                      <span className="text-[10px] uppercase">{dow}</span>
                      <span>{dm}</span>
                      <span
                        className={cn(
                          "mt-0.5 text-[10px] font-semibold tabular-nums",
                          cnt > 0 ? "text-foreground" : "text-muted-foreground/40",
                        )}
                      >
                        {cnt > 0 ? cnt : "·"}
                      </span>
                    </div>
                  </th>
                );
              })}
              <th className="min-w-[48px] border-l bg-muted px-1 py-1.5 text-center font-mono text-[10px] uppercase text-muted-foreground">
                <div className="flex flex-col items-center">
                  <span>Σ</span>
                  <span className="text-sm font-semibold tabular-nums text-foreground">
                    {totalArea}
                  </span>
                </div>
              </th>
            </tr>
          </thead>
          <tbody>
            {visibleStaff.length === 0 ? (
              <tr>
                <td
                  colSpan={days.length + 2}
                  className="px-3 py-6 text-center text-muted-foreground"
                >
                  Keine Mitarbeiter im Bereich {AREA_LABEL[activeArea]}.
                </td>
              </tr>
            ) : (
              visibleStaff.map((row) => {
                const sum = monthSum.get(row.staffId) ?? 0;
                const breakdown = monthBreakdown.get(row.staffId);
                return (
                  <tr
                    key={`${activeArea}-${row.staffId}`}
                    className="border-b last:border-b-0 hover:bg-muted/30"
                    style={{ height: rowH }}
                  >
                    <td className="sticky left-0 z-10 min-w-[180px] bg-background px-3 py-1 font-medium">
                      {row.displayName}
                    </td>
                    {days.map((iso) => {
                      const shift = shiftIndex.get(`${row.staffId}|${iso}|${activeArea}`);
                      const we = isWeekendIso(iso);
                      const isToday = iso === today;
                      const others = !shift
                        ? (otherByStaffDate.get(`${row.staffId}|${iso}`) ?? [])
                        : [];
                      const pickedSkills = skillsForCell(row, activeArea, allSkills);
                      const candidates = [...pickedSkills.profile, ...pickedSkills.other];
                      const isUnavailable = unavailableSet.has(`${row.staffId}|${iso}`);
                      const absenceType = absenceMap.get(`${row.staffId}|${iso}`) ?? null;
                      const isAbsent = absenceType !== null;
                      return (
                        <DropCell
                          key={iso}
                          staffId={row.staffId}
                          iso={iso}
                          area={activeArea}
                          editable={editable}
                          weekend={we}
                          today={isToday}
                          paintKind={paint?.kind ?? null}
                          unavailable={isUnavailable}
                          hasShift={!!shift}
                          absent={isAbsent}
                          absenceType={absenceType}
                        >
                          {shift ? (
                            <PillConfirmPopover
                              open={openPill === shift.id}
                              onOpenChange={(o) => setOpenPill(o ? shift.id : null)}
                              shift={shift}
                              candidates={candidates}
                              busy={busy}
                              isUnavailable={isUnavailable}
                              canEdit={editable}
                              onChangeSkill={async (sid) => {
                                await onChangeSkill(shift.id, sid);
                                setOpenPill(null);
                              }}
                              onChangeStatus={async (st) => {
                                await onChangeStatus(shift.id, st);
                                setOpenPill(null);
                              }}
                              onDelete={async () => {
                                await onDelete(shift.id);
                                setOpenPill(null);
                              }}
                              onSetUnavailable={async () => {
                                await onSetUnavailable(shift.staffId, shift.shiftDate);
                                setOpenPill(null);
                              }}
                              onClearUnavailable={async () => {
                                await onClearUnavailable(shift.staffId, shift.shiftDate);
                                setOpenPill(null);
                              }}
                              absenceType={absenceType}
                              onSetAbsence={async (t) => {
                                await onSetAbsence(shift.staffId, shift.shiftDate, t);
                                setOpenPill(null);
                              }}
                              onClearAbsence={async () => {
                                await onClearAbsence(shift.staffId, shift.shiftDate);
                                setOpenPill(null);
                              }}
                            >
                              <span className="block">
                                <ShiftPill
                                  shift={shift}
                                  area={activeArea}
                                  draggable={editable}
                                  density={density}
                                  onClick={() => void handlePillClick(shift)}
                                />
                              </span>
                            </PillConfirmPopover>
                          ) : (
                            <EmptyCell
                              row={row}
                              iso={iso}
                              activeArea={activeArea}
                              allSkills={allSkills}
                              editable={editable}
                              busy={busy}
                              paintActive={paint !== null}
                              open={openCell === `${row.staffId}|${iso}`}
                              onOpenChange={(o) => setOpenCell(o ? `${row.staffId}|${iso}` : null)}
                              onPick={async (skillId) => {
                                await onCreate(row.staffId, iso, activeArea, skillId);
                                setOpenCell(null);
                              }}
                              onCellClick={() => void handleEmptyCellClick(row, iso)}
                              others={others}
                              isUnavailable={isUnavailable}
                              onSetUnavailable={async () => {
                                await onSetUnavailable(row.staffId, iso);
                                setOpenCell(null);
                              }}
                              onClearUnavailable={async () => {
                                await onClearUnavailable(row.staffId, iso);
                                setOpenCell(null);
                              }}
                              absenceType={absenceType}
                              onSetAbsence={async (t) => {
                                await onSetAbsence(row.staffId, iso, t);
                                setOpenCell(null);
                              }}
                              onClearAbsence={async () => {
                                await onClearAbsence(row.staffId, iso);
                                setOpenCell(null);
                              }}
                            />
                          )}
                        </DropCell>
                      );
                    })}
                    <td className="border-l bg-muted/30 px-1 py-1 text-center font-mono text-xs tabular-nums">
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span
                            className={cn(
                              "inline-block min-w-[1.5rem]",
                              sum > 0 ? "text-foreground" : "text-muted-foreground/40",
                            )}
                          >
                            {sum > 0 ? sum : "·"}
                          </span>
                        </TooltipTrigger>
                        <TooltipContent className="max-w-xs">
                          {breakdown && breakdown.size > 0 ? (
                            <div className="space-y-0.5 text-xs">
                              {[...breakdown.entries()].map(([k, v]) => (
                                <div key={k}>
                                  {v}× {k}
                                </div>
                              ))}
                            </div>
                          ) : (
                            <span className="text-xs">Keine Schichten in dieser Periode.</span>
                          )}
                        </TooltipContent>
                      </Tooltip>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

function DropCell({
  staffId,
  iso,
  area,
  editable,
  weekend,
  today,
  paintKind,
  unavailable,
  hasShift,
  absent,
  absenceType,
  children,
}: {
  staffId: string;
  iso: string;
  area: GridArea;
  editable: boolean;
  weekend: boolean;
  today: boolean;
  paintKind: "skill" | "eraser" | null;
  unavailable: boolean;
  hasShift: boolean;
  absent: boolean;
  absenceType: "urlaub" | "krank" | null;
  children: React.ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: `cell:${staffId}:${iso}:${area}`,
    data: { staffId, iso, area },
    disabled: !editable,
  });
  const cursor =
    paintKind === "skill" ? "cursor-crosshair" : paintKind === "eraser" ? "cursor-not-allowed" : "";
  // Urlaub hat Vorrang vor der grauen Unavailable-Box, wenn beides leer ist.
  // Nicht-verfügbar wird als dezente, gefüllte graue Box dargestellt – aber nur,
  // wenn die Zelle leer ist UND kein Urlaub markiert ist. Pille gewinnt sonst.
  const showUnavailableBox = unavailable && !hasShift && !absent;
  const showAbsenceFull = absent && !hasShift;
  const showAbsenceCorner = absent && hasShift;
  // Hat die Zelle SOWOHL eine Schicht ALS AUCH den Unavailability-Marker, sollen
  // beide Infos lesbar bleiben: gestrichelter Rahmen über der Pille + grauer
  // Punkt unten links (analog zum roten Cross-Booking-Punkt oben rechts).
  const showUnavailableOnShift = unavailable && hasShift;
  const tdInner = (
    <td
      ref={setNodeRef}
      className={cn(
        "relative px-0.5 py-1 text-center align-middle",
        weekend && "bg-muted/40",
        today && "bg-primary/5",
        isOver && editable && "bg-accent/20 ring-1 ring-accent ring-inset",
        editable && cursor,
      )}
    >
      {showUnavailableBox ? (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-1 z-0 rounded-md"
          style={{
            backgroundColor: "color-mix(in oklch, var(--muted-foreground) 30%, transparent)",
          }}
        />
      ) : null}
      {showAbsenceFull ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <span
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center"
            >
              {absenceType === "krank" ? (
                <HeartPulse className="h-4 w-4 text-red-600" />
              ) : (
                <Umbrella className="h-4 w-4 text-green-600" />
              )}
            </span>
          </TooltipTrigger>
          <TooltipContent>{absenceType === "krank" ? "Krank" : "Urlaub"}</TooltipContent>
        </Tooltip>
      ) : null}
      {children}
      {showAbsenceCorner ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <span aria-hidden="true" className="pointer-events-none absolute left-0.5 top-0.5 z-20">
              {absenceType === "krank" ? (
                <HeartPulse className="h-3 w-3 text-red-600" />
              ) : (
                <Umbrella className="h-3 w-3 text-green-600" />
              )}
            </span>
          </TooltipTrigger>
          <TooltipContent>{absenceType === "krank" ? "Krank" : "Urlaub"}</TooltipContent>
        </Tooltip>
      ) : null}
      {showUnavailableOnShift ? (
        <>
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-1 z-20 rounded-md"
            style={{
              outline: "1.5px dashed color-mix(in oklch, var(--muted-foreground) 65%, transparent)",
              outlineOffset: "-1px",
            }}
          />
          <span
            aria-hidden="true"
            className="pointer-events-none absolute bottom-1 left-1 z-20 h-1.5 w-1.5 rounded-full"
            style={{
              backgroundColor: "color-mix(in oklch, var(--muted-foreground) 75%, transparent)",
            }}
          />
        </>
      ) : null}
    </td>
  );
  if (!unavailable) return tdInner;
  return (
    <Tooltip>
      <TooltipTrigger asChild>{tdInner}</TooltipTrigger>
      <TooltipContent>
        {hasShift ? "War als nicht verfügbar markiert" : "Nicht verfügbar"}
      </TooltipContent>
    </Tooltip>
  );
}

function EmptyCell({
  row,
  iso,
  activeArea,
  allSkills,
  editable,
  busy,
  paintActive,
  open,
  onOpenChange,
  onPick,
  onCellClick,
  others,
  isUnavailable,
  onSetUnavailable,
  onClearUnavailable,
  absenceType,
  onSetAbsence,
  onClearAbsence,
}: {
  row: RosterStaffRow;
  iso: string;
  activeArea: GridArea;
  allSkills: RosterSkill[];
  editable: boolean;
  busy: boolean;
  paintActive: boolean;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onPick: (skillId: string) => void;
  onCellClick: () => void;
  others: RosterCrossBooking[];
  isUnavailable: boolean;
  onSetUnavailable: () => void;
  onClearUnavailable: () => void;
  absenceType: "urlaub" | "krank" | null;
  onSetAbsence: (type: "urlaub" | "krank") => void;
  onClearAbsence: () => void;
}) {
  const { profile, other } = skillsForCell(row, activeArea, allSkills);
  const marker = (
    <button
      type="button"
      disabled={!editable}
      onClick={(e) => {
        e.stopPropagation();
        onCellClick();
      }}
      aria-label={`Schicht anlegen: ${row.displayName}, ${iso}`}
      className={cn(
        "mx-auto block h-6 w-10 rounded border border-dashed bg-transparent",
        editable ? "border-muted-foreground/30 hover:border-primary" : "border-transparent",
      )}
    />
  );

  const cellInner = (
    <span className="relative block">
      {marker}
      {others.length > 0 && (
        <Tooltip>
          <TooltipTrigger asChild>
            <span
              className="absolute right-0.5 top-0.5 inline-block h-1.5 w-1.5 rounded-full bg-red-500"
              aria-label="Bereits anderswo eingeteilt"
            />
          </TooltipTrigger>
          <TooltipContent className="max-w-xs">
            <div className="space-y-0.5 text-xs">
              {others.map((b, i) => (
                <div key={i}>
                  Bereits: {b.locationName} · {AREA_SHORT[b.area]}
                  {b.skillName ? ` · ${b.skillName}` : ""}
                </div>
              ))}
            </div>
          </TooltipContent>
        </Tooltip>
      )}
    </span>
  );

  if (!editable || paintActive) return cellInner;

  return (
    <CellQuickPopover
      open={open}
      onOpenChange={onOpenChange}
      profileSkills={profile}
      otherSkills={other}
      busy={busy}
      onPick={onPick}
      isUnavailable={isUnavailable}
      onSetUnavailable={onSetUnavailable}
      onClearUnavailable={onClearUnavailable}
      isAbsent={isAbsent}
      onSetAbsence={onSetAbsence}
      onClearAbsence={onClearAbsence}
    >
      {cellInner}
    </CellQuickPopover>
  );
}
