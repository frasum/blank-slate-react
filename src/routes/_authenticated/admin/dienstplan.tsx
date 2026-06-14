// D1 — Dienstplan (Read-only Grid). Vorausplanung; getrennt von time_entries.

import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { listLocations } from "@/lib/admin/locations.functions";
import { listPeriods } from "@/lib/time/time-admin.functions";
import {
  getRosterShifts,
  getStaffForRoster,
  listSkills,
  type RosterShift,
  type RosterStaffRow,
} from "@/lib/roster/roster.functions";

export const Route = createFileRoute("/_authenticated/admin/dienstplan")({
  head: () => ({ meta: [{ title: "Dienstplan" }] }),
  component: DienstplanPage,
});

type Area = "kitchen" | "service" | "gl";

const AREA_LABEL: Record<Area, string> = {
  kitchen: "KÜCHE",
  service: "SERVICE",
  gl: "GESCHÄFTSLEITUNG",
};
const AREA_BAR: Record<Area, string> = {
  kitchen: "bg-orange-400",
  service: "bg-blue-400",
  gl: "bg-gray-400",
};
const AREA_BG: Record<Area, string> = {
  kitchen: "bg-orange-50",
  service: "bg-blue-50",
  gl: "bg-gray-50",
};
const AREA_ORDER: Area[] = ["kitchen", "service", "gl"];

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

function ShiftPill({ shift }: { shift: RosterShift }) {
  const bg = shift.skillColor ?? "#9ca3af";
  const text = abbr(shift.skillName);
  const opacity = shift.status === "confirmed" ? "opacity-100" : "opacity-70";
  return (
    <div
      className={`mx-auto flex h-6 w-10 items-center justify-center rounded text-[11px] font-bold text-white ${opacity}`}
      style={{ backgroundColor: bg }}
      title={`${shift.skillName ?? "—"} (${shift.status})${shift.notes ? ` · ${shift.notes}` : ""}`}
    >
      {text}
    </div>
  );
}

function DienstplanPage() {
  const today = todayIso();
  const periodsQ = useQuery({ queryKey: ["periods"], queryFn: () => listPeriods() });
  const locationsQ = useQuery({ queryKey: ["locations"], queryFn: () => listLocations() });

  const [periodId, setPeriodId] = useState<string | null>(null);
  const [locationId, setLocationId] = useState<string | null>(null);

  const periods = useMemo(() => periodsQ.data ?? [], [periodsQ.data]);
  const locations = useMemo(() => locationsQ.data ?? [], [locationsQ.data]);

  const effectivePeriod = useMemo(() => {
    if (periodId) return periods.find((p) => p.id === periodId) ?? null;
    return periods.find((p) => p.startDate <= today && today <= p.endDate) ?? periods[0] ?? null;
  }, [periods, periodId, today]);
  const effectiveLocationId = locationId ?? locations[0]?.id ?? null;

  const days = useMemo(
    () => (effectivePeriod ? daysBetween(effectivePeriod.startDate, effectivePeriod.endDate) : []),
    [effectivePeriod],
  );

  const staffQ = useQuery({
    queryKey: ["roster-staff", effectiveLocationId],
    queryFn: () => getStaffForRoster({ data: { locationId: effectiveLocationId! } }),
    enabled: !!effectiveLocationId,
  });
  const shiftsQ = useQuery({
    queryKey: [
      "roster-shifts",
      effectiveLocationId,
      effectivePeriod?.startDate,
      effectivePeriod?.endDate,
    ],
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
  // Skills wird in D1 nicht direkt benötigt fürs Grid (Pille rendert aus Join),
  // aber wir prefetchen für spätere Edit-Funktionen + um die Function zu validieren.
  useQuery({ queryKey: ["skills"], queryFn: () => listSkills() });

  const staff = useMemo(() => staffQ.data ?? [], [staffQ.data]);
  const shifts = useMemo(() => shiftsQ.data ?? [], [shiftsQ.data]);

  const shiftIndex = useMemo(() => {
    const m = new Map<string, RosterShift>();
    for (const s of shifts) {
      m.set(`${s.staffId}|${s.shiftDate}|${s.area}`, s);
    }
    return m;
  }, [shifts]);

  const grouped = useMemo(() => {
    const g = new Map<Area, RosterStaffRow[]>();
    for (const a of AREA_ORDER) g.set(a, []);
    for (const row of staff) g.get(row.department)?.push(row);
    return g;
  }, [staff]);

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Dienstplan</h1>
          <p className="text-sm text-muted-foreground">
            Vorausplanung — wer arbeitet wann wo. (Read-only)
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
                  <>
                    <tr key={`hdr-${area}`} className={AREA_BG[area]}>
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
                          return (
                            <td
                              key={iso}
                              className={`px-0.5 py-1 text-center ${
                                we ? "bg-muted/40" : ""
                              } ${isToday ? "bg-primary/5" : ""}`}
                            >
                              {shift ? <ShiftPill shift={shift} /> : null}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </>
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
    </div>
  );
}
