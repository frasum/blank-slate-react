// D5 — Mobile Tagesansicht des Dienstplans (rein lesend). Nutzt exakt die
// bestehenden Server-Functions `getRosterShifts`, `getAbsences`,
// `getDayOffWishes` — dadurch greifen Planer-Scopes automatisch identisch
// zur Grid-Ansicht. KEINE Editier-Interaktion, kein Realtime; Refetch
// erfolgt bei Tageswechsel und Fokus.

import { useMemo } from "react";
import { useQuery, useQueries } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, Heart } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { listLocations } from "@/lib/admin/locations.functions";
import {
  getRosterShifts,
  getAbsences,
  getDayOffWishes,
  getMyRosterScopes,
  type RosterShift,
} from "@/lib/roster/roster.functions";
import { allowedLocations } from "@/lib/roster/scope-util";
import { pillStyle } from "@/lib/roster/pill-style";
import { buildDayView, type DayViewEntry } from "@/lib/roster/day-view";
import { formatShortDate } from "@/lib/format-date";
import { todayIso } from "@/lib/format";

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
  const shifts: RosterShift[] = useMemo(
    () => shiftsQs.flatMap((q) => q.data ?? []),
    [shiftsQs],
  );
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
              {g.kitchen.length > 0 && (
                <section>
                  <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Küche
                  </h3>
                  <ul className="flex flex-wrap gap-2">
                    {g.kitchen.map((e) => (
                      <DayPill key={e.shiftId} entry={e} area="kitchen" />
                    ))}
                  </ul>
                </section>
              )}
              {g.service.length > 0 && (
                <section>
                  <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Service
                  </h3>
                  <ul className="flex flex-col gap-1">
                    {g.service.map((e) => (
                      <li key={e.shiftId} className="flex items-center gap-2 text-sm">
                        <span
                          className="inline-flex h-6 min-w-[2rem] shrink-0 items-center justify-center rounded-md px-1.5 text-xs font-semibold"
                          style={pillServiceStyle(e)}
                        >
                          {e.marker ?? "X"}
                        </span>
                        <span className="min-w-0 flex-1 truncate">{e.staffName}</span>
                        <BadgeRow entry={e} />
                      </li>
                    ))}
                  </ul>
                </section>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
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

function DayPill({ entry, area }: { entry: DayViewEntry; area: "kitchen" }) {
  const st = pillStyle({
    skillColor: entry.skillColor,
    area,
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
      className="flex items-center gap-2 rounded-md px-2 py-1 text-sm"
      style={style}
      title={entry.skillName ?? ""}
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