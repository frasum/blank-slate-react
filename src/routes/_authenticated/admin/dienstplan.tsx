// D2a/D2b/D2c/D2f — Dienstplan-Seite. Schlanke Shell: lädt Periode/Standort,
// abonniert Realtime, ruft Server-Functions auf. UI in <RosterGrid>.
// Erhaltungs-Constraints: Realtime, Cross-Booking-Markierung, Service-Marker,
// GL→Service-Mapping bleiben funktional erhalten (vgl. .lovable/plan.md).

import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { DndContext, PointerSensor, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { Card } from "@/components/ui/card";
import { parseIso, todayIso } from "@/lib/format";
import { TooltipProvider } from "@/components/ui/tooltip";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { listLocations } from "@/lib/admin/locations.functions";
import { LocationPills } from "@/components/shared/LocationPills";
import { listPeriods } from "@/lib/time/time-admin.functions";
import {
  createRosterShift,
  deleteRosterShift,
  getRosterShifts,
  getStaffForRoster,
  getStaffCrossBookings,
  getAvailability,
  setUnavailable,
  clearUnavailable,
  getAbsences,
  setAbsenceRange,
  clearAbsence,
  getDayOffWishes,
  listSkills,
  moveRosterShift,
  updateRosterShiftSkill,
  updateRosterShiftStatus,
  getRosterRelease,
  setRosterRelease,
  type RosterShift,
  type RosterSkill,
} from "@/lib/roster/roster.functions";
import { Button } from "@/components/ui/button";
import { RosterGrid } from "@/components/roster/RosterGrid";
import { PaintToolbar, type PaintSelection } from "@/components/roster/PaintToolbar";
import { SkillFilterChips } from "@/components/roster/SkillFilterChips";
import { PeriodNav } from "@/components/roster/PeriodNav";

export const Route = createFileRoute("/_authenticated/admin/dienstplan")({
  head: () => ({ meta: [{ title: "Dienstplan" }] }),
  component: DienstplanPage,
});

type GridArea = "kitchen" | "service";

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
  let cur = parseIso(fromIso);
  const end = parseIso(toIso);
  while (cur.getTime() <= end.getTime()) {
    out.push(fmtIso(cur));
    cur = addDays(cur, 1);
  }
  return out;
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
  // Halb-Offset: false = Periode 1:1, true = Fenster +14 Tage (überlappt
  // in die Folgeperiode). Wird über die einzelnen Pfeile ‹/› gesteuert.
  const [halfOffset, setHalfOffset] = useState(false);
  const [locationId, setLocationId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [activeArea, setActiveArea] = useState<GridArea>("kitchen");
  const [skillFilter, setSkillFilter] = useState<string[]>([]);
  const [paintEnabled, setPaintEnabled] = useState(false);
  const [paint, setPaint] = useState<PaintSelection>(null);

  const periods = useMemo(
    () => [...(periodsQ.data ?? [])].sort((a, b) => a.startDate.localeCompare(b.startDate)),
    [periodsQ.data],
  );
  const locations = useMemo(() => locationsQ.data ?? [], [locationsQ.data]);
  const allSkills: RosterSkill[] = useMemo(() => skillsQ.data ?? [], [skillsQ.data]);

  const effectivePeriod = useMemo(() => {
    if (periodId) return periods.find((p) => p.id === periodId) ?? null;
    return periods.find((p) => p.startDate <= today && today <= p.endDate) ?? periods[0] ?? null;
  }, [periods, periodId, today]);
  const effectiveLocationId = locationId ?? locations[0]?.id ?? null;

  const periodLocked = effectivePeriod?.status === "locked";

  const releaseQ = useQuery({
    queryKey: ["roster-release", effectiveLocationId, effectivePeriod?.id],
    queryFn: () =>
      getRosterRelease({
        data: { locationId: effectiveLocationId!, periodId: effectivePeriod!.id },
      }),
    enabled: !!effectiveLocationId && !!effectivePeriod,
  });
  const released = releaseQ.data?.released ?? false;

  async function handleToggleRelease() {
    if (!canEdit || !effectiveLocationId || !effectivePeriod) return;
    setBusy(true);
    try {
      await setRosterRelease({
        data: {
          locationId: effectiveLocationId,
          periodId: effectivePeriod.id,
          released: !released,
        },
      });
      qc.invalidateQueries({ queryKey: ["roster-release"] });
      toast.success(released ? "Freigabe zurückgezogen." : "Dienstplan freigegeben.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  // Anzeigefenster = Periode ± 14 Tage je nach Halb-Offset.
  const windowStart = useMemo(() => {
    if (!effectivePeriod) return null;
    return halfOffset
      ? fmtIso(addDays(parseIso(effectivePeriod.startDate), 14))
      : effectivePeriod.startDate;
  }, [effectivePeriod, halfOffset]);
  const windowEnd = useMemo(() => {
    if (!effectivePeriod) return null;
    return halfOffset
      ? fmtIso(addDays(parseIso(effectivePeriod.endDate), 14))
      : effectivePeriod.endDate;
  }, [effectivePeriod, halfOffset]);

  const days = useMemo(
    () => (windowStart && windowEnd ? daysBetween(windowStart, windowEnd) : []),
    [windowStart, windowEnd],
  );

  const staffQ = useQuery({
    queryKey: ["roster-staff", effectiveLocationId],
    queryFn: () => getStaffForRoster({ data: { locationId: effectiveLocationId! } }),
    enabled: !!effectiveLocationId,
  });
  const shiftsQ = useQuery({
    queryKey: ["roster-shifts", effectiveLocationId, windowStart, windowEnd],
    queryFn: () =>
      getRosterShifts({
        data: {
          locationId: effectiveLocationId!,
          fromDate: windowStart!,
          toDate: windowEnd!,
        },
      }),
    enabled: !!effectiveLocationId && !!windowStart && !!windowEnd,
  });
  const crossQ = useQuery({
    queryKey: ["roster-cross-bookings", windowStart, windowEnd],
    queryFn: () =>
      getStaffCrossBookings({
        data: {
          fromDate: windowStart!,
          toDate: windowEnd!,
        },
      }),
    enabled: !!windowStart && !!windowEnd,
  });
  const availabilityQ = useQuery({
    queryKey: ["roster-availability", windowStart, windowEnd],
    queryFn: () =>
      getAvailability({
        data: {
          fromDate: windowStart!,
          toDate: windowEnd!,
        },
      }),
    enabled: !!windowStart && !!windowEnd,
  });
  const absenceQ = useQuery({
    queryKey: ["roster-absence", windowStart, windowEnd],
    queryFn: () =>
      getAbsences({
        data: {
          fromDate: windowStart!,
          toDate: windowEnd!,
        },
      }),
    enabled: !!windowStart && !!windowEnd,
  });
  const wishesQ = useQuery({
    queryKey: ["day-off-wishes", windowStart, windowEnd],
    queryFn: () =>
      getDayOffWishes({
        data: {
          fromDate: windowStart!,
          toDate: windowEnd!,
        },
      }),
    enabled: !!windowStart && !!windowEnd,
  });

  // Realtime: jede Änderung an roster_shifts → invalidate (live update).
  useEffect(() => {
    if (!effectiveLocationId) return;
    const channel = supabase
      .channel(`roster-shifts-${effectiveLocationId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "roster_shifts" }, () => {
        qc.invalidateQueries({ queryKey: ["roster-shifts"] });
        qc.invalidateQueries({ queryKey: ["roster-cross-bookings"] });
      })
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "roster_availability" },
        () => {
          qc.invalidateQueries({ queryKey: ["roster-availability"] });
        },
      )
      .on("postgres_changes", { event: "*", schema: "public", table: "roster_absence" }, () => {
        qc.invalidateQueries({ queryKey: ["roster-absence"] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "day_off_wishes" }, () => {
        qc.invalidateQueries({ queryKey: ["day-off-wishes"] });
      })
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [effectiveLocationId, qc]);

  const staff = useMemo(() => staffQ.data ?? [], [staffQ.data]);
  const shifts: RosterShift[] = useMemo(() => shiftsQ.data ?? [], [shiftsQ.data]);
  const crossBookings = useMemo(() => crossQ.data ?? [], [crossQ.data]);
  const unavailable = useMemo(() => availabilityQ.data ?? [], [availabilityQ.data]);
  const unavailableSet = useMemo(() => {
    const s = new Set<string>();
    for (const a of unavailable) s.add(`${a.staffId}|${a.date}`);
    return s;
  }, [unavailable]);
  const absences = useMemo(() => absenceQ.data ?? [], [absenceQ.data]);
  const absenceMap = useMemo(() => {
    const m = new Map<string, "urlaub" | "krank">();
    for (const a of absences) m.set(`${a.staffId}|${a.date}`, a.type);
    return m;
  }, [absences]);
  const wishMap = useMemo(() => {
    const m = new Map<string, string | null>();
    for (const w of wishesQ.data ?? []) m.set(`${w.staffId}|${w.wishDate}`, w.note);
    return m;
  }, [wishesQ.data]);
  const staffNameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const r of staff) m.set(r.staffId, r.displayName);
    return m;
  }, [staff]);

  // Lock-Map: max. 1 Einteilung pro MA/Tag (standort-/bereichsübergreifend).
  // Speist sich aus crossBookings (Realtime-invalidated).
  const lockMap = useMemo(() => {
    const m = new Map<
      string,
      { locationId: string; locationName: string; area: "kitchen" | "service" | "gl" }
    >();
    for (const b of crossBookings) {
      const k = `${b.staffId}|${b.shiftDate}`;
      if (!m.has(k)) {
        m.set(k, { locationId: b.locationId, locationName: b.locationName, area: b.area });
      }
    }
    return m;
  }, [crossBookings]);

  function warnIfUnavailable(staffId: string, iso: string) {
    if (!unavailableSet.has(`${staffId}|${iso}`)) return;
    const name = staffNameById.get(staffId) ?? "Mitarbeiter";
    toast.message(`Hinweis: ${name} ist an diesem Tag als nicht verfügbar markiert.`);
  }

  // Skill-Filter (Mehrfach, ODER): nur Mitarbeiter zeigen, die mind. einen
  // der gewählten Skills haben. Leere Auswahl = alle.
  const filteredStaff = useMemo(() => {
    if (skillFilter.length === 0) return staff;
    return staff.filter((r) => r.skillIds.some((sid) => skillFilter.includes(sid)));
  }, [staff, skillFilter]);

  // Skill-Pool fürs Paint-Toolbar: passende Kategorien je aktivem Tab.
  const paintSkills = useMemo(() => {
    const allowed =
      activeArea === "service"
        ? new Set<RosterSkill["category"]>(["service", "gl", "other"])
        : new Set<RosterSkill["category"]>(["kitchen"]);
    return allSkills.filter((s) => allowed.has(s.category));
  }, [allSkills, activeArea]);

  // Filter-Chips zeigen ebenfalls nur Skills der aktiven Area-Kategorien.
  const filterSkills = paintSkills;

  async function handleCreate(staffId: string, iso: string, area: GridArea, skillId: string) {
    if (!canEdit || periodLocked || !effectiveLocationId) return;
    const lock = lockMap.get(`${staffId}|${iso}`);
    if (lock) {
      const name = staffNameById.get(staffId) ?? "Mitarbeiter";
      toast.error(`${name} ist bereits in ${lock.locationName} · ${lock.area} eingeteilt.`);
      return;
    }
    setBusy(true);
    try {
      await createRosterShift({
        data: {
          locationId: effectiveLocationId,
          staffId,
          shiftDate: iso,
          area,
          skillId,
        },
      });
      qc.invalidateQueries({ queryKey: ["roster-shifts"] });
      qc.invalidateQueries({ queryKey: ["roster-cross-bookings"] });
      warnIfUnavailable(staffId, iso);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete(id: string) {
    if (!canEdit || periodLocked) return;
    setBusy(true);
    try {
      await deleteRosterShift({ data: { id } });
      qc.invalidateQueries({ queryKey: ["roster-shifts"] });
      qc.invalidateQueries({ queryKey: ["roster-cross-bookings"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleChangeSkill(id: string, skillId: string) {
    if (!canEdit || periodLocked) return;
    setBusy(true);
    try {
      await updateRosterShiftSkill({ data: { id, skillId } });
      qc.invalidateQueries({ queryKey: ["roster-shifts"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleChangeStatus(id: string, status: "planned" | "confirmed") {
    if (!canEdit || periodLocked) return;
    setBusy(true);
    try {
      await updateRosterShiftStatus({ data: { id, status } });
      qc.invalidateQueries({ queryKey: ["roster-shifts"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  async function handleDragEnd(e: DragEndEvent) {
    if (!canEdit || periodLocked) return;
    const { active, over } = e;
    if (!over) return;
    const shift = active.data.current?.shift as RosterShift | undefined;
    const target = over.data.current as
      | { staffId?: string; iso?: string; area?: GridArea }
      | undefined;
    if (!shift || !target?.staffId || !target?.iso || !target?.area) return;
    if (
      shift.staffId === target.staffId &&
      shift.shiftDate === target.iso &&
      shift.area === target.area
    ) {
      return;
    }
    const lock = lockMap.get(`${target.staffId}|${target.iso}`);
    // Eigene Schicht ausschließen (Bereichswechsel desselben Tages bleibt erlaubt).
    if (
      lock &&
      !(
        lock.locationId === shift.locationId &&
        lock.area === shift.area &&
        shift.staffId === target.staffId &&
        shift.shiftDate === target.iso
      )
    ) {
      const name = staffNameById.get(target.staffId) ?? "Mitarbeiter";
      toast.error(`${name} ist bereits in ${lock.locationName} · ${lock.area} eingeteilt.`);
      return;
    }
    setBusy(true);
    try {
      await moveRosterShift({
        data: {
          id: shift.id,
          staffId: target.staffId,
          shiftDate: target.iso,
          area: target.area,
        },
      });
      qc.invalidateQueries({ queryKey: ["roster-shifts"] });
      qc.invalidateQueries({ queryKey: ["roster-cross-bookings"] });
      warnIfUnavailable(target.staffId, target.iso);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  function togglePaint() {
    setPaintEnabled((v) => {
      const next = !v;
      if (!next) setPaint(null);
      return next;
    });
  }

  async function handleSetUnavailable(staffId: string, iso: string) {
    if (!canEdit) return;
    setBusy(true);
    try {
      await setUnavailable({ data: { staffId, date: iso } });
      qc.invalidateQueries({ queryKey: ["roster-availability"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleClearUnavailable(staffId: string, iso: string) {
    if (!canEdit) return;
    setBusy(true);
    try {
      await clearUnavailable({ data: { staffId, date: iso } });
      qc.invalidateQueries({ queryKey: ["roster-availability"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleSetAbsenceRange(
    staffId: string,
    fromIso: string,
    toIso: string,
    type: "urlaub" | "krank",
  ) {
    if (!canEdit) return;
    setBusy(true);
    try {
      const res = await setAbsenceRange({
        data: { staffId, fromDate: fromIso, toDate: toIso, type },
      });
      qc.invalidateQueries({ queryKey: ["roster-absence"] });
      qc.invalidateQueries({ queryKey: ["roster-shifts"] });
      const label = type === "urlaub" ? "Urlaub" : "Krank";
      const days = res.daysCount;
      const del = res.deletedShiftCount;
      toast.success(
        del > 0
          ? `${label} für ${days} ${days === 1 ? "Tag" : "Tage"} eingetragen — ${del} ${del === 1 ? "Schicht" : "Schichten"} entfernt.`
          : `${label} für ${days} ${days === 1 ? "Tag" : "Tage"} eingetragen.`,
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleClearAbsence(staffId: string, iso: string) {
    if (!canEdit) return;
    setBusy(true);
    try {
      await clearAbsence({ data: { staffId, date: iso } });
      qc.invalidateQueries({ queryKey: ["roster-absence"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <TooltipProvider delayDuration={150}>
        <header>
          <h1 className="text-2xl font-semibold">Dienstplan</h1>
          {(periodLocked || !canEdit) && (
            <p className="text-sm text-muted-foreground">
              {!canEdit ? (
                <span>(Read-only)</span>
              ) : (
                <span className="text-destructive">Periode gesperrt.</span>
              )}
            </p>
          )}
        </header>

        {!effectivePeriod ? (
          <Card className="p-6 text-sm text-muted-foreground">
            Keine Periode angelegt. Lege im Tab „Perioden" eine an.
          </Card>
        ) : !effectiveLocationId ? (
          <Card className="p-6 text-sm text-muted-foreground">Kein Standort verfügbar.</Card>
        ) : (
          <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
            {canEdit && !periodLocked && (
              <PaintToolbar
                enabled={paintEnabled}
                onToggle={togglePaint}
                skills={paintSkills}
                active={paintEnabled ? paint : null}
                onChange={setPaint}
              />
            )}
            <SkillFilterChips
              skills={filterSkills}
              selected={skillFilter}
              onChange={setSkillFilter}
            />
            <div className="grid grid-cols-3 items-end gap-3">
              <LocationPills
                locations={locations}
                value={effectiveLocationId ?? ""}
                onChange={setLocationId}
              />
              <div className="flex justify-center">
                <PeriodNav
                  periods={periods}
                  currentPeriodId={effectivePeriod?.id ?? null}
                  halfOffset={halfOffset}
                  hasTodayJump={(() => {
                    const todayPeriod = periods.find(
                      (p) => p.startDate <= today && today <= p.endDate,
                    );
                    if (!todayPeriod) return false;
                    return halfOffset || todayPeriod.id !== effectivePeriod?.id;
                  })()}
                  onToday={() => {
                    const todayPeriod = periods.find(
                      (p) => p.startDate <= today && today <= p.endDate,
                    );
                    if (todayPeriod) setPeriodId(todayPeriod.id);
                    setHalfOffset(false);
                  }}
                  onPrevPeriod={() => {
                    if (!effectivePeriod) return;
                    const i = periods.findIndex((p) => p.id === effectivePeriod.id);
                    if (i > 0) {
                      setPeriodId(periods[i - 1].id);
                      setHalfOffset(false);
                    }
                  }}
                  onNextPeriod={() => {
                    if (!effectivePeriod) return;
                    const i = periods.findIndex((p) => p.id === effectivePeriod.id);
                    if (i >= 0 && i < periods.length - 1) {
                      setPeriodId(periods[i + 1].id);
                      setHalfOffset(false);
                    }
                  }}
                  onPrevHalf={() => {
                    if (!effectivePeriod) return;
                    if (halfOffset) {
                      // Aus 2. Hälfte zurück auf volle Periode.
                      setHalfOffset(false);
                    } else {
                      // Aus voller Periode in 2. Hälfte der Vorperiode.
                      const i = periods.findIndex((p) => p.id === effectivePeriod.id);
                      if (i > 0) {
                        setPeriodId(periods[i - 1].id);
                        setHalfOffset(true);
                      }
                    }
                  }}
                  onNextHalf={() => {
                    if (!effectivePeriod) return;
                    if (halfOffset) {
                      // Aus 2. Hälfte in volle Folgeperiode.
                      const i = periods.findIndex((p) => p.id === effectivePeriod.id);
                      if (i >= 0 && i < periods.length - 1) {
                        setPeriodId(periods[i + 1].id);
                        setHalfOffset(false);
                      }
                    } else {
                      // Aus voller Periode in 2. Hälfte derselben.
                      setHalfOffset(true);
                    }
                  }}
                />
              </div>
              <div />
            </div>
            <RosterGrid
              activeArea={activeArea}
              onActiveAreaChange={(a) => {
                setActiveArea(a);
                setPaint(null); // Paint-Auswahl zurücksetzen, da Skill-Pool wechselt
                setSkillFilter([]);
              }}
              days={days}
              today={today}
              staff={filteredStaff}
              shifts={shifts}
              allSkills={allSkills}
              crossBookings={crossBookings}
              lockMap={lockMap}
              unavailableSet={unavailableSet}
              absenceMap={absenceMap}
              wishMap={wishMap}
              canEdit={canEdit}
              locked={!!periodLocked}
              paint={paintEnabled ? paint : null}
              busy={busy}
              onCreate={handleCreate}
              onDelete={handleDelete}
              onChangeSkill={handleChangeSkill}
              onChangeStatus={handleChangeStatus}
              onSetUnavailable={handleSetUnavailable}
              onClearUnavailable={handleClearUnavailable}
              onSetAbsenceRange={handleSetAbsenceRange}
              onClearAbsence={handleClearAbsence}
            />
          </DndContext>
        )}
      </TooltipProvider>
    </div>
  );
}
