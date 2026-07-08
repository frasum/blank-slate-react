// D5 — Mobile Tagesansicht des Dienstplans (rein lesend). Nutzt exakt die
// bestehenden Server-Functions `getRosterShifts`, `getAbsences`,
// `getDayOffWishes` — dadurch greifen Planer-Scopes automatisch identisch
// zur Grid-Ansicht. KEINE Editier-Interaktion, kein Realtime; Refetch
// erfolgt bei Tageswechsel und Fokus.

import { useMemo, useState } from "react";
import { useQuery, useQueries } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, Heart, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { listLocations } from "@/lib/admin/locations.functions";
import {
  getRosterShifts,
  getAbsences,
  getDayOffWishes,
  getMyRosterScopes,
  getStaffForRoster,
  listSkills,
  type RosterShift,
  type RosterStaffRow,
} from "@/lib/roster/roster.functions";
import { allowedLocations, canEditScope } from "@/lib/roster/scope-util";
import { pillStyle } from "@/lib/roster/pill-style";
import { buildDayView, type DayViewEntry } from "@/lib/roster/day-view";
import { formatShortDate } from "@/lib/format-date";
import { todayIso } from "@/lib/format";
import { DayEditSheet, type DayEditTarget } from "./DayEditSheet";

type Props = {
  date: string;
  onDateChange: (iso: string) => void;
};

function addDaysIso(iso: string, delta: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + delta);
  return dt.toISOString().slice(0, 10);
}

export function RosterDayView({ date, onDateChange }: Props) {
  const today = todayIso();

  const locationsQ = useQuery({ queryKey: ["locations"], queryFn: () => listLocations() });
  const scopesQ = useQuery({
    queryKey: ["roster-scopes"],
    queryFn: () => getMyRosterScopes(),
  });
  const scopes = useMemo(() => scopesQ.data ?? [], [scopesQ.data]);
  const locations = useMemo(
    () => allowedLocations(locationsQ.data ?? [], scopes),
    [locationsQ.data, scopes],
  );
  const skillsQ = useQuery({ queryKey: ["skills"], queryFn: () => listSkills() });
  const skills = useMemo(() => skillsQ.data ?? [], [skillsQ.data]);

  // Ein-Tages-Fenster: gleiche Lesepfade wie das Grid, nur mit
  // fromDate === toDate === `date`.
  const shiftsQs = useQueries({
    queries: locations.map((loc) => ({
      queryKey: ["roster-shifts", loc.id, date, date],
      queryFn: () =>
        getRosterShifts({ data: { locationId: loc.id, fromDate: date, toDate: date } }),
      enabled: locations.length > 0,
    })),
  });
  const shifts: RosterShift[] = useMemo(() => shiftsQs.flatMap((q) => q.data ?? []), [shiftsQs]);
  // Staff pro Standort (für „+ Einteilen" / Skill-Picker / Absence-Hinweis).
  const staffQs = useQueries({
    queries: locations.map((loc) => ({
      queryKey: ["roster-staff", loc.id],
      queryFn: () => getStaffForRoster({ data: { locationId: loc.id } }),
      enabled: locations.length > 0,
    })),
  });
  const staffByLoc = useMemo(() => {
    const m = new Map<string, RosterStaffRow[]>();
    locations.forEach((loc, i) => m.set(loc.id, staffQs[i]?.data ?? []));
    return m;
  }, [locations, staffQs]);
  const absencesQ = useQuery({
    queryKey: ["roster-absence", date, date],
    queryFn: () => getAbsences({ data: { fromDate: date, toDate: date } }),
  });
  const wishesQ = useQuery({
    queryKey: ["day-off-wishes", date, date],
    queryFn: () => getDayOffWishes({ data: { fromDate: date, toDate: date } }),
  });

  const groups = useMemo(
    () =>
      buildDayView({
        date,
        locations,
        shifts,
        absences: absencesQ.data ?? [],
        wishes: wishesQ.data ?? [],
      }),
    [date, locations, shifts, absencesQ.data, wishesQ.data],
  );

  const isLoading =
    locationsQ.isLoading ||
    scopesQ.isLoading ||
    shiftsQs.some((q) => q.isLoading) ||
    absencesQ.isLoading ||
    wishesQ.isLoading;

  const [editTarget, setEditTarget] = useState<DayEditTarget | null>(null);
  const canEditFor = (locId: string, area: "kitchen" | "service") =>
    canEditScope(scopes, locId, area);

  // Bereits am Tag eingeteilte Staff-IDs pro Standort (für „+ Einteilen"-Kandidatenfilter).
  const bookedByLoc = useMemo(() => {
    const m = new Map<string, Set<string>>();
    for (const s of shifts) {
      if (s.shiftDate !== date) continue;
      const set = m.get(s.locationId) ?? new Set<string>();
      set.add(s.staffId);
      m.set(s.locationId, set);
    }
    return m;
  }, [shifts, date]);

  function openAdd(loc: { id: string; name: string }, area: "kitchen" | "service") {
    const all = staffByLoc.get(loc.id) ?? [];
    const dept = area === "kitchen" ? "kitchen" : "service";
    const booked = bookedByLoc.get(loc.id) ?? new Set<string>();
    const candidates = all.filter((s) => s.department === dept && !booked.has(s.staffId));
    setEditTarget({
      mode: "add",
      locationId: loc.id,
      locationName: loc.name,
      area,
      date,
      candidates,
    });
  }
  function openEdit(
    loc: { id: string; name: string },
    area: "kitchen" | "service",
    e: DayViewEntry,
  ) {
    setEditTarget({
      mode: "edit",
      locationId: loc.id,
      locationName: loc.name,
      area,
      date,
      staffId: e.staffId,
      staffName: e.staffName,
      shiftId: e.shiftId,
      status: e.status,
      currentSkillId: e.skillId,
      hasAbsenceToday: e.absence != null,
    });
  }

  const activeStaffForLoc = editTarget ? (staffByLoc.get(editTarget.locationId) ?? []) : [];
  const activeShifts = shifts;
  const todaysShiftDates = (staffId: string) =>
    activeShifts.filter((s) => s.staffId === staffId).map((s) => s.shiftDate);

  return (
    <div className="space-y-4">
      <h1 className="truncate text-2xl font-semibold">Dienstplan</h1>

      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="icon"
          variant="outline"
          onClick={() => onDateChange(addDaysIso(date, -1))}
          aria-label="Vorheriger Tag"
          className="shrink-0"
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <div className="min-w-0 flex-1 text-center text-base font-medium">
          {formatShortDate(date)}
        </div>
        <Button
          size="icon"
          variant="outline"
          onClick={() => onDateChange(addDaysIso(date, 1))}
          aria-label="Nächster Tag"
          className="shrink-0"
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
        <input
          type="date"
          value={date}
          onChange={(e) => {
            if (e.target.value) onDateChange(e.target.value);
          }}
          className="rounded-md border bg-background px-2 py-1 text-sm"
          aria-label="Datum wählen"
        />
        {date !== today && (
          <Button size="sm" variant="secondary" onClick={() => onDateChange(today)}>
            Heute
          </Button>
        )}
      </div>

      {locations.length === 0 && !isLoading ? (
        <Card className="p-6 text-sm text-muted-foreground">Kein Standort verfügbar.</Card>
      ) : groups.length === 0 ? (
        <Card className="p-6 text-sm text-muted-foreground">
          {isLoading ? "Lade…" : "Keine Einteilungen an diesem Tag."}
        </Card>
      ) : (
        <div className="space-y-3">
          {groups.map((g) => (
            <Card key={g.locationId} className="space-y-3 p-4">
              <h2 className="text-lg font-semibold">{g.locationName}</h2>
              {(() => {
                const loc = { id: g.locationId, name: g.locationName };
                return (
                  <>
                    <AreaSection
                      title="Küche"
                      canEdit={canEditFor(g.locationId, "kitchen")}
                      onAdd={() => openAdd(loc, "kitchen")}
                      show={g.kitchen.length > 0 || canEditFor(g.locationId, "kitchen")}
                    >
                      <ul className="flex flex-wrap gap-2">
                        {g.kitchen.map((e) => (
                          <DayPill
                            key={e.shiftId}
                            entry={e}
                            clickable={canEditFor(g.locationId, "kitchen")}
                            onClick={() => openEdit(loc, "kitchen", e)}
                          />
                        ))}
                      </ul>
                    </AreaSection>
                    <AreaSection
                      title="Service"
                      canEdit={canEditFor(g.locationId, "service")}
                      onAdd={() => openAdd(loc, "service")}
                      show={g.service.length > 0 || canEditFor(g.locationId, "service")}
                    >
                      <ul className="flex flex-col gap-1">
                        {g.service.map((e) => {
                          const editable = canEditFor(g.locationId, "service");
                          return (
                            <li
                              key={e.shiftId}
                              className={`flex items-center gap-2 rounded-md text-sm ${
                                editable ? "cursor-pointer px-1 py-1 hover:bg-accent" : ""
                              }`}
                              onClick={
                                editable ? () => openEdit(loc, "service", e) : undefined
                              }
                            >
                              <span
                                className="inline-flex h-6 min-w-[2rem] shrink-0 items-center justify-center rounded-md px-1.5 text-xs font-semibold"
                                style={pillServiceStyle(e)}
                              >
                                {e.marker ?? "X"}
                              </span>
                              <span className="min-w-0 flex-1 truncate">{e.staffName}</span>
                              <BadgeRow entry={e} />
                            </li>
                          );
                        })}
                      </ul>
                    </AreaSection>
                  </>
                );
              })()}
            </Card>
          ))}
        </div>
      )}
      <DayEditSheet
        target={editTarget}
        onClose={() => setEditTarget(null)}
        skills={skills}
        staffForLocation={activeStaffForLoc}
        todaysShiftDates={todaysShiftDates}
      />
    </div>
  );
}

function AreaSection({
  title,
  canEdit,
  onAdd,
  show,
  children,
}: {
  title: string;
  canEdit: boolean;
  onAdd: () => void;
  show: boolean;
  children: React.ReactNode;
}) {
  if (!show) return null;
  return (
    <section>
      <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {title}
      </h3>
      {children}
      {canEdit && (
        <Button
          size="sm"
          variant="ghost"
          className="mt-2 h-7 text-xs text-muted-foreground"
          onClick={onAdd}
        >
          <Plus className="mr-1 h-3.5 w-3.5" /> Einteilen
        </Button>
      )}
    </section>
  );
}

function pillServiceStyle(e: DayViewEntry): React.CSSProperties {
  const st = pillStyle({
    skillColor: e.skillColor,
    area: "service",
    label: e.marker ?? "X",
    status: e.status,
  });
  return {
    backgroundColor: st.backgroundColor,
    color: st.textClass.includes("text-white") ? "#fff" : "#000",
    border: e.status === "planned" ? "1px dashed rgba(0,0,0,0.35)" : "1px solid transparent",
  };
}

function DayPill({
  entry,
  clickable,
  onClick,
}: {
  entry: DayViewEntry;
  clickable: boolean;
  onClick: () => void;
}) {
  const st = pillStyle({
    skillColor: entry.skillColor,
    area: "kitchen",
    label: entry.skillName ?? "",
    status: entry.status,
  });
  const style: React.CSSProperties = {
    backgroundColor: st.backgroundColor,
    color: st.textClass.includes("text-white") ? "#fff" : "#000",
    border: entry.status === "planned" ? "1px dashed rgba(0,0,0,0.35)" : "1px solid transparent",
  };
  return (
    <li
      className={`flex items-center gap-2 rounded-md px-2 py-1 text-sm ${
        clickable ? "cursor-pointer" : ""
      }`}
      style={style}
      title={entry.skillName ?? ""}
      onClick={clickable ? onClick : undefined}
    >
      <span className="max-w-[10rem] truncate font-medium">{entry.staffName}</span>
      {entry.skillName && (
        <span className="rounded bg-black/20 px-1 text-xs">{entry.skillName}</span>
      )}
      <BadgeRow entry={entry} />
    </li>
  );
}

function BadgeRow({ entry }: { entry: DayViewEntry }) {
  return (
    <span className="flex shrink-0 items-center gap-1">
      {entry.absence && (
        <Badge variant="secondary" className="h-5 px-1.5 text-[10px]">
          {entry.absence}
        </Badge>
      )}
      {entry.wish && <Heart className="h-3.5 w-3.5 text-pink-500" aria-label="Freiwunsch" />}
    </span>
  );
}
