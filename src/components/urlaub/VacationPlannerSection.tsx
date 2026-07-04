// UP1 — Jahresplaner-Sektion unter der Antrags-Liste auf /admin/urlaub.
// Kompaktes Balkendiagramm pro Standort × Jahr, gruppiert Küche/Service
// (gl → service, D-3-Regel). Quelle: roster_absence type='urlaub'.
// Proportional, kein horizontales Scrollen; Dichte-Streifen zeigt
// Frank-Frühwarnung (rot ab 3 gleichzeitig).

import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Card } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { LocationPills } from "@/components/shared/LocationPills";
import { listLocations } from "@/lib/admin/locations.functions";
import {
  getVacationPlanner,
  type VacationPlannerResult,
} from "@/lib/roster/vacation-planner.functions";
import { dayOfYearPct, monthOffsets, type AbsenceRange } from "@/lib/roster/vacation-planner";
import { cn } from "@/lib/utils";

const MONTH_LETTERS = ["J", "F", "M", "A", "M", "J", "J", "A", "S", "O", "N", "D"];

function formatDe(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function todayIso(): string {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(
    d.getUTCDate(),
  ).padStart(2, "0")}`;
}

function rangeGeometry(r: AbsenceRange, year: number): { leftPct: number; widthPct: number } {
  const start = dayOfYearPct(r.start, year);
  const end = dayOfYearPct(r.end, year);
  return { leftPct: start.leftPct, widthPct: end.leftPct + end.widthPct - start.leftPct };
}

function densityColor(count: number): string {
  if (count <= 0) return "transparent";
  if (count <= 2) return "rgba(59,130,246,0.35)"; // dezent blau
  return "rgba(220,38,38,0.85)"; // kräftig rot
}

export function VacationPlannerSection() {
  const fetchLocations = useServerFn(listLocations);
  const fetchPlanner = useServerFn(getVacationPlanner);

  const currentYear = new Date().getUTCFullYear();
  const [year, setYear] = useState<number>(currentYear);
  const [locationId, setLocationId] = useState<string>("");

  const locationsQuery = useQuery({
    queryKey: ["planner-locations"],
    queryFn: () => fetchLocations(),
  });

  const locations = useMemo(
    () => (locationsQuery.data ?? []).map((l) => ({ id: l.id, name: l.name })),
    [locationsQuery.data],
  );

  // Auto-Auswahl des ersten Standorts, sobald verfügbar.
  const effectiveLocationId = locationId || locations[0]?.id || "";

  const plannerQuery = useQuery({
    queryKey: ["vacation-planner", effectiveLocationId, year],
    queryFn: () => fetchPlanner({ data: { locationId: effectiveLocationId, year } }),
    enabled: Boolean(effectiveLocationId),
  });

  const months = useMemo(() => monthOffsets(year), [year]);
  const today = todayIso();
  const todayInYear = today.startsWith(`${year}-`);
  const todayPct = todayInYear ? (dayOfYearPct(today, year).leftPct as number) : null;

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-semibold tracking-tight">Jahresplaner</h2>
        <div className="flex items-center gap-1">
          <button
            type="button"
            className="h-9 w-9 rounded-full border border-gray-300 bg-white text-gray-700 hover:opacity-80 flex items-center justify-center"
            onClick={() => setYear((y) => y - 1)}
            aria-label="Vorheriges Jahr"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <div className="min-w-16 px-3 text-center text-sm font-semibold tabular-nums">{year}</div>
          <button
            type="button"
            className="h-9 w-9 rounded-full border border-gray-300 bg-white text-gray-700 hover:opacity-80 flex items-center justify-center"
            onClick={() => setYear((y) => y + 1)}
            aria-label="Nächstes Jahr"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      <LocationPills
        locations={locations}
        value={effectiveLocationId}
        onChange={setLocationId}
        size="sm"
        ariaLabel="Standort für Jahresplaner"
      />

      {!effectiveLocationId ? (
        <Card className="p-6 text-sm text-muted-foreground">
          {locationsQuery.isLoading ? "Lade Standorte…" : "Keine Standorte vorhanden."}
        </Card>
      ) : plannerQuery.isLoading ? (
        <Card className="p-6 text-sm text-muted-foreground">Lade Planer…</Card>
      ) : plannerQuery.isError ? (
        <Card className="p-6 text-sm text-destructive">Konnte Jahresplaner nicht laden.</Card>
      ) : plannerQuery.data ? (
        <PlannerBoard data={plannerQuery.data} months={months} todayPct={todayPct} year={year} />
      ) : null}
    </section>
  );
}

type PlannerData = VacationPlannerResult;

function PlannerBoard({
  data,
  months,
  todayPct,
  year,
}: {
  data: PlannerData;
  months: { month: number; leftPct: number }[];
  todayPct: number | null;
  year: number;
}) {
  return (
    <Card className="space-y-2 p-3">
      <MonthHeader months={months} />
      <DensityStrip counts={data.dailyCounts} year={year} todayPct={todayPct} />
      <PlannerBlock
        title="Küche"
        rows={data.kitchen}
        months={months}
        year={year}
        todayPct={todayPct}
      />
      <PlannerBlock
        title="Service"
        rows={data.service}
        months={months}
        year={year}
        todayPct={todayPct}
      />
    </Card>
  );
}

function MonthHeader({ months }: { months: { month: number; leftPct: number }[] }) {
  return (
    <div className="flex items-center gap-2">
      <div className="w-28 shrink-0" />
      <div className="relative h-4 flex-1">
        {months.map((m) => (
          <div
            key={m.month}
            className="absolute top-0 text-[10px] font-medium uppercase text-muted-foreground"
            style={{ left: `${m.leftPct}%` }}
          >
            {MONTH_LETTERS[m.month]}
          </div>
        ))}
      </div>
    </div>
  );
}

function DensityStrip({
  counts,
  year,
  todayPct,
}: {
  counts: Record<string, number>;
  year: number;
  todayPct: number | null;
}) {
  const entries = Object.entries(counts);
  return (
    <div className="flex items-center gap-2">
      <div className="w-28 shrink-0 text-[10px] uppercase tracking-wide text-muted-foreground">
        Dichte
      </div>
      <div className="relative h-4 flex-1 rounded-sm border border-gray-200 bg-gray-50 overflow-hidden">
        <MonthGridLines year={year} />
        {entries.map(([iso, count]) => {
          const { leftPct, widthPct } = dayOfYearPct(iso, year);
          return (
            <Tooltip key={iso}>
              <TooltipTrigger asChild>
                <div
                  className="absolute top-0 bottom-0"
                  style={{
                    left: `${leftPct}%`,
                    width: `${widthPct}%`,
                    backgroundColor: densityColor(count),
                  }}
                />
              </TooltipTrigger>
              <TooltipContent>
                {formatDe(iso)}: {count} im Urlaub
              </TooltipContent>
            </Tooltip>
          );
        })}
        {todayPct !== null ? <TodayLine leftPct={todayPct} /> : null}
      </div>
    </div>
  );
}

function PlannerBlock({
  title,
  rows,
  months,
  year,
  todayPct,
}: {
  title: string;
  rows: PlannerData["kitchen"];
  months: { month: number; leftPct: number }[];
  year: number;
  todayPct: number | null;
}) {
  return (
    <div className="space-y-0.5">
      <div className="pt-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </div>
      {rows.length === 0 ? (
        <div className="py-2 text-xs text-muted-foreground">
          Keine Mitarbeiter in diesem Bereich.
        </div>
      ) : rows.every((r) => r.ranges.length === 0) ? (
        <div className="py-2 text-xs text-muted-foreground">
          Keine genehmigten Urlaube in {year}.
        </div>
      ) : null}
      {rows.map((r) => (
        <StaffRow key={r.staffId} row={r} months={months} year={year} todayPct={todayPct} />
      ))}
    </div>
  );
}

function StaffRow({
  row,
  months,
  year,
  todayPct,
}: {
  row: PlannerData["kitchen"][number];
  months: { month: number; leftPct: number }[];
  year: number;
  todayPct: number | null;
}) {
  return (
    <div className="flex items-center gap-2">
      <div className="w-28 shrink-0 truncate text-xs" title={row.displayName}>
        {row.displayName}
      </div>
      <div className="relative h-5 flex-1 rounded-sm bg-gray-50">
        <MonthGridLines year={year} months={months} />
        {row.ranges.map((rg, i) => {
          const geo = rangeGeometry(rg, year);
          return (
            <Tooltip key={i}>
              <TooltipTrigger asChild>
                <div
                  className={cn(
                    "absolute top-0.5 bottom-0.5 rounded",
                    "bg-primary/80 hover:bg-primary",
                  )}
                  style={{ left: `${geo.leftPct}%`, width: `${geo.widthPct}%` }}
                />
              </TooltipTrigger>
              <TooltipContent>
                {formatDe(rg.start)} – {formatDe(rg.end)} ({rg.days}{" "}
                {rg.days === 1 ? "Tag" : "Tage"})
              </TooltipContent>
            </Tooltip>
          );
        })}
        {todayPct !== null ? <TodayLine leftPct={todayPct} /> : null}
      </div>
    </div>
  );
}

function MonthGridLines({
  year,
  months,
}: {
  year: number;
  months?: { month: number; leftPct: number }[];
}) {
  const ms = months ?? monthOffsets(year);
  return (
    <>
      {ms.map((m) =>
        m.month === 0 ? null : (
          <div
            key={m.month}
            className="pointer-events-none absolute top-0 bottom-0 w-px bg-gray-200"
            style={{ left: `${m.leftPct}%` }}
          />
        ),
      )}
    </>
  );
}

function TodayLine({ leftPct }: { leftPct: number }) {
  return (
    <div
      className="pointer-events-none absolute top-0 bottom-0 w-px bg-amber-500/80"
      style={{ left: `${leftPct}%` }}
      aria-hidden
    />
  );
}
