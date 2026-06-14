// B6 — Arbeitszeitübersicht (Zusammenfassung + Buchhaltung), 1:1 nach tagesabrechnung.

import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Fragment, useMemo, useState } from "react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { listLocations } from "@/lib/admin/locations.functions";
import {
  getTimeOverview,
  getWeeklyTimeEntries,
  listPayrollNotes,
  upsertPayrollNote,
} from "@/lib/time/time-admin.functions";
import {
  computeShiftHours,
  isBavarianHoliday,
  isSundayOrHoliday,
} from "@/lib/time/shift-hours";

export const Route = createFileRoute("/_authenticated/admin/zeit-uebersicht")({
  head: () => ({ meta: [{ title: "Zeitübersicht" }] }),
  component: ZeitUebersichtPage,
});

type Department = "kitchen" | "service" | "gl";
type Entry = {
  staffId: string;
  displayName: string;
  department: Department;
  businessDate: string;
  hoursWorked: number;
};

const DEPT_LABEL: Record<Department, string> = {
  kitchen: "Küche",
  service: "Service",
  gl: "Geschäftsleitung",
};
const DEPT_BG: Record<Department, string> = {
  kitchen: "bg-orange-50",
  service: "bg-blue-50",
  gl: "bg-gray-50",
};
const DEPT_BAR: Record<Department, string> = {
  kitchen: "bg-orange-400",
  service: "bg-blue-400",
  gl: "bg-gray-400",
};
const DEPT_HEADER_LABEL: Record<Department, string> = {
  kitchen: "KÜCHE",
  service: "SERVICE",
  gl: "GESCHÄFTSLEITUNG",
};
const DEPT_ORDER: Department[] = ["kitchen", "service", "gl"];

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}
function firstOfMonthIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

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
// ISO week (Mon–Sun). Returns {year, week} per ISO 8601.
function isoWeek(d: Date): { year: number; week: number } {
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((t.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return { year: t.getUTCFullYear(), week };
}
function mondayOf(d: Date): Date {
  const day = d.getUTCDay() || 7;
  return addDays(d, 1 - day);
}
function ddmm(d: Date): string {
  return `${String(d.getUTCDate()).padStart(2, "0")}.${String(d.getUTCMonth() + 1).padStart(2, "0")}.`;
}
function fmtHm(hours: number): string {
  if (hours <= 0) return "0:00";
  const total = Math.round(hours * 60);
  const h = Math.floor(total / 60);
  const m = total % 60;
  return `${h}:${String(m).padStart(2, "0")}`;
}

type WeekCol = { key: string; label: string; start: string; end: string };

function buildWeekColumns(fromIso: string, toIso: string): WeekCol[] {
  const cols: WeekCol[] = [];
  const fromD = parseIsoDate(fromIso);
  const toD = parseIsoDate(toIso);
  let cursor = mondayOf(fromD);
  while (cursor.getTime() <= toD.getTime()) {
    const end = addDays(cursor, 6);
    const { year, week } = isoWeek(cursor);
    cols.push({
      key: `${year}-W${String(week).padStart(2, "0")}`,
      label: `KW ${week} ${ddmm(cursor)}–${ddmm(end)}`,
      start: fmtIso(cursor),
      end: fmtIso(end),
    });
    cursor = addDays(cursor, 7);
  }
  return cols;
}

function ZeitUebersichtPage() {
  const qc = useQueryClient();
  const fetchLocations = useServerFn(listLocations);
  const fetchOverview = useServerFn(getTimeOverview);
  const fetchWeekly = useServerFn(getWeeklyTimeEntries);
  const fetchNotes = useServerFn(listPayrollNotes);
  const callUpsert = useServerFn(upsertPayrollNote);

  const locationsQ = useQuery({
    queryKey: ["admin-locations"],
    queryFn: () => fetchLocations(),
  });
  const [locationId, setLocationId] = useState<string>("");
  const effectiveLocationId = locationId || locationsQ.data?.[0]?.id || "";

  const [fromDate, setFromDate] = useState<string>(firstOfMonthIso());
  const [toDate, setToDate] = useState<string>(todayIso());

  // Wochenplan: aktuelle Woche (Montag).
  const [weekStart, setWeekStart] = useState<string>(() =>
    fmtIso(mondayOf(parseIsoDate(todayIso()))),
  );
  const weekStartDate = useMemo(() => parseIsoDate(weekStart), [weekStart]);
  const weekDays = useMemo(
    () => Array.from({ length: 7 }, (_, i) => addDays(weekStartDate, i)),
    [weekStartDate],
  );
  const { week: currentWeekNo } = isoWeek(weekStartDate);

  const weeklyQ = useQuery({
    queryKey: ["weekly-entries", effectiveLocationId, weekStart],
    queryFn: () =>
      fetchWeekly({ data: { locationId: effectiveLocationId, weekStart } }),
    enabled: Boolean(effectiveLocationId),
  });

  const overviewQ = useQuery({
    queryKey: ["time-overview", effectiveLocationId, fromDate, toDate],
    queryFn: () =>
      fetchOverview({ data: { locationId: effectiveLocationId, fromDate, toDate } }),
    enabled: Boolean(effectiveLocationId),
  });

  const notesQ = useQuery({
    queryKey: ["payroll-notes", effectiveLocationId, fromDate, toDate],
    queryFn: () =>
      fetchNotes({
        data: { locationId: effectiveLocationId, periodStart: fromDate, periodEnd: toDate },
      }),
    enabled: Boolean(effectiveLocationId),
  });

  const entries: Entry[] = overviewQ.data?.entries ?? [];
  const weekCols = useMemo(() => buildWeekColumns(fromDate, toDate), [fromDate, toDate]);

  // Aggregations
  type StaffAgg = {
    staffId: string;
    displayName: string;
    department: Department;
    perWeek: Map<string, number>;
    totalHours: number;
    shiftDates: Set<string>;
  };
  const staffAggs = useMemo(() => {
    const map = new Map<string, StaffAgg>();
    for (const e of entries) {
      let agg = map.get(e.staffId);
      if (!agg) {
        agg = {
          staffId: e.staffId,
          displayName: e.displayName,
          department: e.department,
          perWeek: new Map(),
          totalHours: 0,
          shiftDates: new Set(),
        };
        map.set(e.staffId, agg);
      }
      const wk = isoWeek(parseIsoDate(e.businessDate));
      const wkKey = `${wk.year}-W${String(wk.week).padStart(2, "0")}`;
      agg.perWeek.set(wkKey, (agg.perWeek.get(wkKey) ?? 0) + e.hoursWorked);
      agg.totalHours += e.hoursWorked;
      agg.shiftDates.add(e.businessDate);
    }
    return Array.from(map.values()).sort((a, b) =>
      a.displayName.localeCompare(b.displayName, "de"),
    );
  }, [entries]);

  const byDept = useMemo(() => {
    const m = new Map<Department, StaffAgg[]>();
    for (const dept of DEPT_ORDER) m.set(dept, []);
    for (const s of staffAggs) {
      const arr = m.get(s.department) ?? [];
      arr.push(s);
      m.set(s.department, arr);
    }
    return m;
  }, [staffAggs]);

  const notesByStaff = useMemo(() => {
    const m = new Map<string, { vorschuss: number; besonderheiten: string }>();
    for (const n of notesQ.data ?? []) {
      m.set(n.staffId, { vorschuss: n.vorschuss, besonderheiten: n.besonderheiten });
    }
    return m;
  }, [notesQ.data]);

  const upsertMut = useMutation({
    mutationFn: (vars: {
      staffId: string;
      vorschuss: number;
      besonderheiten: string | null;
    }) =>
      callUpsert({
        data: {
          locationId: effectiveLocationId,
          staffId: vars.staffId,
          periodStart: fromDate,
          periodEnd: toDate,
          vorschuss: vars.vorschuss,
          besonderheiten: vars.besonderheiten,
        },
      }),
    onSuccess: () => {
      void qc.invalidateQueries({
        queryKey: ["payroll-notes", effectiveLocationId, fromDate, toDate],
      });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Zeitübersicht</h1>
        <p className="text-sm text-muted-foreground">
          Arbeitszeit nach Kalenderwochen und Lohnbuchhaltungs-Übersicht.
        </p>
      </div>

      <Card className="p-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <Label htmlFor="loc">Standort</Label>
            <select
              id="loc"
              className="h-9 rounded-md border border-input bg-background px-3 text-sm"
              value={effectiveLocationId}
              onChange={(e) => setLocationId(e.target.value)}
            >
              {(locationsQ.data ?? []).map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="from">Von</Label>
            <Input
              id="from"
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="to">Bis</Label>
            <Input
              id="to"
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
            />
          </div>
        </div>
      </Card>

      <Tabs defaultValue="weekly">
        <TabsList>
          <TabsTrigger value="weekly">Wochenplan</TabsTrigger>
          <TabsTrigger value="summary">Zusammenfassung</TabsTrigger>
          <TabsTrigger value="payroll">Buchhaltung</TabsTrigger>
        </TabsList>

        <TabsContent value="weekly">
          <Card className="p-4 mb-3">
            <div className="flex items-center gap-3">
              <button
                type="button"
                className="h-9 rounded-md border border-input bg-background px-3 text-sm hover:bg-muted"
                onClick={() => setWeekStart(fmtIso(addDays(weekStartDate, -7)))}
              >
                ← Woche
              </button>
              <div className="text-sm font-medium tabular-nums">
                KW {currentWeekNo} · {ddmm(weekDays[0])}–{ddmm(weekDays[6])}
                {weekDays[0].getUTCFullYear()}
              </div>
              <button
                type="button"
                className="h-9 rounded-md border border-input bg-background px-3 text-sm hover:bg-muted"
                onClick={() => setWeekStart(fmtIso(addDays(weekStartDate, 7)))}
              >
                Woche →
              </button>
              <button
                type="button"
                className="h-9 rounded-md border border-input bg-background px-3 text-sm hover:bg-muted"
                onClick={() => setWeekStart(fmtIso(mondayOf(parseIsoDate(todayIso()))))}
              >
                Heute
              </button>
            </div>
          </Card>
          <WeeklyPlan
            data={weeklyQ.data}
            isLoading={weeklyQ.isLoading}
            weekDays={weekDays}
          />
        </TabsContent>

        <TabsContent value="summary">
          <Card className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Mitarbeiter</TableHead>
                  {weekCols.map((w) => (
                    <TableHead key={w.key} className="text-right whitespace-nowrap">
                      {w.label}
                    </TableHead>
                  ))}
                  <TableHead className="text-right">Gesamt</TableHead>
                  <TableHead className="text-right">Schichten</TableHead>
                  <TableHead className="text-right">U</TableHead>
                  <TableHead className="text-right">K</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {overviewQ.isLoading && (
                  <TableRow>
                    <TableCell
                      colSpan={5 + weekCols.length}
                      className="text-center text-muted-foreground"
                    >
                      Lade…
                    </TableCell>
                  </TableRow>
                )}
                {!overviewQ.isLoading && staffAggs.length === 0 && (
                  <TableRow>
                    <TableCell
                      colSpan={5 + weekCols.length}
                      className="text-center text-muted-foreground"
                    >
                      Keine Einträge im Zeitraum.
                    </TableCell>
                  </TableRow>
                )}
                {DEPT_ORDER.map((dept) => {
                  const list = byDept.get(dept) ?? [];
                  if (list.length === 0) return null;
                  const deptWeek = new Map<string, number>();
                  let deptTotal = 0;
                  let deptShifts = 0;
                  for (const s of list) {
                    for (const [k, v] of s.perWeek) {
                      deptWeek.set(k, (deptWeek.get(k) ?? 0) + v);
                    }
                    deptTotal += s.totalHours;
                    deptShifts += s.shiftDates.size;
                  }
                  return (
                    <Fragment key={`grp-${dept}`}>
                      <TableRow className={DEPT_BG[dept]}>
                        <TableCell
                          colSpan={5 + weekCols.length}
                          className="font-semibold text-foreground"
                        >
                          {DEPT_LABEL[dept]}
                        </TableCell>
                      </TableRow>
                      {list.map((s) => (
                        <TableRow key={s.staffId}>
                          <TableCell>{s.displayName}</TableCell>
                          {weekCols.map((w) => (
                            <TableCell key={w.key} className="text-right tabular-nums">
                              {fmtHm(s.perWeek.get(w.key) ?? 0)}
                            </TableCell>
                          ))}
                          <TableCell className="text-right tabular-nums font-medium">
                            {fmtHm(s.totalHours)}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {s.shiftDates.size}
                          </TableCell>
                          <TableCell className="text-right text-muted-foreground">–</TableCell>
                          <TableCell className="text-right text-muted-foreground">–</TableCell>
                        </TableRow>
                      ))}
                      <TableRow className={`${DEPT_BG[dept]} font-medium`}>
                        <TableCell>Summe {DEPT_LABEL[dept]}</TableCell>
                        {weekCols.map((w) => (
                          <TableCell key={w.key} className="text-right tabular-nums">
                            {fmtHm(deptWeek.get(w.key) ?? 0)}
                          </TableCell>
                        ))}
                        <TableCell className="text-right tabular-nums">
                          {fmtHm(deptTotal)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{deptShifts}</TableCell>
                        <TableCell className="text-right text-muted-foreground">–</TableCell>
                        <TableCell className="text-right text-muted-foreground">–</TableCell>
                      </TableRow>
                    </Fragment>
                  );
                })}
                {staffAggs.length > 0 &&
                  (() => {
                    const totWeek = new Map<string, number>();
                    let tot = 0;
                    let totShifts = 0;
                    for (const s of staffAggs) {
                      for (const [k, v] of s.perWeek) {
                        totWeek.set(k, (totWeek.get(k) ?? 0) + v);
                      }
                      tot += s.totalHours;
                      totShifts += s.shiftDates.size;
                    }
                    return (
                      <TableRow className="bg-muted font-semibold">
                        <TableCell>Gesamt</TableCell>
                        {weekCols.map((w) => (
                          <TableCell key={w.key} className="text-right tabular-nums">
                            {fmtHm(totWeek.get(w.key) ?? 0)}
                          </TableCell>
                        ))}
                        <TableCell className="text-right tabular-nums">{fmtHm(tot)}</TableCell>
                        <TableCell className="text-right tabular-nums">{totShifts}</TableCell>
                        <TableCell className="text-right text-muted-foreground">–</TableCell>
                        <TableCell className="text-right text-muted-foreground">–</TableCell>
                      </TableRow>
                    );
                  })()}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>

        <TabsContent value="payroll">
          <Card className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Mitarbeiter</TableHead>
                  <TableHead className="text-right">Gesamt</TableHead>
                  <TableHead className="text-right">Schichten</TableHead>
                  <TableHead className="text-right">U</TableHead>
                  <TableHead className="text-right">K</TableHead>
                  <TableHead className="text-right">Vorschuss</TableHead>
                  <TableHead>Besonderheiten</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {staffAggs.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-muted-foreground">
                      Keine Einträge im Zeitraum.
                    </TableCell>
                  </TableRow>
                )}
                {DEPT_ORDER.map((dept) => {
                  const list = byDept.get(dept) ?? [];
                  if (list.length === 0) return null;
                  return (
                    <Fragment key={`p-grp-${dept}`}>
                      <TableRow className={DEPT_BG[dept]}>
                        <TableCell colSpan={7} className="font-semibold">
                          {DEPT_LABEL[dept]}
                        </TableCell>
                      </TableRow>
                      {list.map((s) => (
                        <PayrollRow
                          key={s.staffId}
                          staff={s}
                          initial={notesByStaff.get(s.staffId)}
                          onSave={(vorschuss, besonderheiten) =>
                            upsertMut.mutate({
                              staffId: s.staffId,
                              vorschuss,
                              besonderheiten: besonderheiten.trim() === "" ? null : besonderheiten,
                            })
                          }
                        />
                      ))}
                    </Fragment>
                  );
                })}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function PayrollRow({
  staff,
  initial,
  onSave,
}: {
  staff: {
    staffId: string;
    displayName: string;
    totalHours: number;
    shiftDates: Set<string>;
  };
  initial: { vorschuss: number; besonderheiten: string } | undefined;
  onSave: (vorschuss: number, besonderheiten: string) => void;
}) {
  const [vorschuss, setVorschuss] = useState<string>(
    initial ? initial.vorschuss.toFixed(2) : "0.00",
  );
  const [besonderheiten, setBesonderheiten] = useState<string>(initial?.besonderheiten ?? "");

  return (
    <TableRow>
      <TableCell>{staff.displayName}</TableCell>
      <TableCell className="text-right tabular-nums font-medium">
        {fmtHm(staff.totalHours)}
      </TableCell>
      <TableCell className="text-right tabular-nums">{staff.shiftDates.size}</TableCell>
      <TableCell className="text-right text-muted-foreground">–</TableCell>
      <TableCell className="text-right text-muted-foreground">–</TableCell>
      <TableCell className="text-right">
        <Input
          type="number"
          step="0.01"
          min={0}
          inputMode="decimal"
          className="h-8 w-24 text-right tabular-nums"
          value={vorschuss}
          onChange={(e) => setVorschuss(e.target.value)}
          onBlur={() => {
            const n = Number.parseFloat(vorschuss.replace(",", "."));
            const safe = Number.isFinite(n) && n >= 0 ? n : 0;
            setVorschuss(safe.toFixed(2));
            const prev = initial?.vorschuss ?? 0;
            if (Math.abs(safe - prev) > 0.005 || besonderheiten !== (initial?.besonderheiten ?? "")) {
              onSave(safe, besonderheiten);
            }
          }}
        />
      </TableCell>
      <TableCell>
        <Textarea
          rows={1}
          className="min-h-8 resize-y"
          value={besonderheiten}
          onChange={(e) => setBesonderheiten(e.target.value)}
          onBlur={() => {
            const prev = initial?.besonderheiten ?? "";
            const n = Number.parseFloat(vorschuss.replace(",", "."));
            const safeV = Number.isFinite(n) && n >= 0 ? n : 0;
            if (besonderheiten !== prev) {
              onSave(safeV, besonderheiten);
            }
          }}
        />
      </TableCell>
    </TableRow>
  );
}

type WeeklyEntry = {
  id: string;
  staffId: string;
  displayName: string;
  department: Department;
  businessDate: string;
  startedAt: string;
  endedAt: string;
};

type WeeklyData = {
  weekStart: string;
  weekEnd: string;
  entries: WeeklyEntry[];
  crossLocationDates: Record<string, string[]>;
};

function fmtDec(n: number): string {
  return n.toFixed(2).replace(".", ",");
}

function fmtHHMM(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString("de-DE", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Berlin",
  });
}

function dayHeader(d: Date): string {
  const names = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];
  return `${names[d.getUTCDay()]} ${ddmm(d)}`;
}

function WeeklyPlan({
  data,
  isLoading,
  weekDays,
}: {
  data: WeeklyData | undefined;
  isLoading: boolean;
  weekDays: Date[];
}) {
  const entries = data?.entries ?? [];
  const crossDates = data?.crossLocationDates ?? {};

  // Gruppieren: staffId → { entries-by-date, totals }
  type Row = {
    staffId: string;
    displayName: string;
    department: Department;
    entriesByDate: Map<string, WeeklyEntry[]>;
    totals: {
      total: number;
      evening: number;
      night: number;
      sunHol: number;
    };
  };
  const rows = new Map<string, Row>();
  for (const e of entries) {
    let row = rows.get(e.staffId);
    if (!row) {
      row = {
        staffId: e.staffId,
        displayName: e.displayName,
        department: e.department,
        entriesByDate: new Map(),
        totals: { total: 0, evening: 0, night: 0, sunHol: 0 },
      };
      rows.set(e.staffId, row);
    }
    const arr = row.entriesByDate.get(e.businessDate) ?? [];
    arr.push(e);
    row.entriesByDate.set(e.businessDate, arr);
    const r = computeShiftHours(e.startedAt, e.endedAt, e.businessDate);
    row.totals.total += r.totalHours;
    row.totals.evening += r.eveningHours;
    row.totals.night += r.nightHours;
    row.totals.sunHol += r.sundayHolidayHours;
  }

  const byDept = new Map<Department, Row[]>();
  for (const dept of DEPT_ORDER) byDept.set(dept, []);
  for (const row of rows.values()) {
    const list = byDept.get(row.department) ?? [];
    list.push(row);
    byDept.set(row.department, list);
  }
  for (const dept of DEPT_ORDER) {
    const list = byDept.get(dept) ?? [];
    list.sort((a, b) => a.displayName.localeCompare(b.displayName, "de"));
  }

  const dayMeta = weekDays.map((d) => {
    const iso = fmtIso(d);
    const isSun = d.getUTCDay() === 0;
    const isHol = isBavarianHoliday(d);
    return { date: d, iso, isSun, isHol, isSunOrHol: isSundayOrHoliday(d) };
  });

  const totalCols = 1 + 7 + 6; // Mitarbeiter + 7 Tage + 6 Summen

  return (
    <Card className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[150px] min-w-[150px]">Mitarbeiter</TableHead>
            {dayMeta.map((dm) => (
              <TableHead
                key={dm.iso}
                className={`text-center whitespace-nowrap ${dm.isHol ? "bg-yellow-50" : dm.isSun ? "bg-gray-100" : ""}`}
              >
                {dayHeader(dm.date)}
                {dm.isHol && (
                  <span className="block text-[10px] font-normal text-muted-foreground">
                    (Fei)
                  </span>
                )}
              </TableHead>
            ))}
            <TableHead className="text-right">Ges</TableHead>
            <TableHead className="text-right">20–24</TableHead>
            <TableHead className="text-right">24–x</TableHead>
            <TableHead className="text-right">So/Fei</TableHead>
            <TableHead className="text-right">U</TableHead>
            <TableHead className="text-right">K</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {isLoading && (
            <TableRow>
              <TableCell colSpan={totalCols} className="text-center text-muted-foreground">
                Lade…
              </TableCell>
            </TableRow>
          )}
          {!isLoading && rows.size === 0 && (
            <TableRow>
              <TableCell colSpan={totalCols} className="text-center text-muted-foreground">
                Keine Einträge in dieser Woche.
              </TableCell>
            </TableRow>
          )}
          {DEPT_ORDER.map((dept) => {
            const list = byDept.get(dept) ?? [];
            if (list.length === 0) return null;
            return (
              <Fragment key={`w-${dept}`}>
                <TableRow className={DEPT_BG[dept]}>
                  <TableCell colSpan={totalCols} className="font-semibold text-foreground">
                    {DEPT_HEADER_LABEL[dept]}
                  </TableCell>
                </TableRow>
                {list.map((row) => {
                  const cross = new Set(crossDates[row.staffId] ?? []);
                  return (
                    <TableRow key={row.staffId}>
                      <TableCell className="relative pl-3 font-medium">
                        <span
                          className={`absolute left-0 top-0 bottom-0 w-[2px] ${DEPT_BAR[row.department]}`}
                        />
                        {row.displayName}
                      </TableCell>
                      {dayMeta.map((dm) => {
                        const dayEntries = row.entriesByDate.get(dm.iso) ?? [];
                        const hasCross = cross.has(dm.iso) && dayEntries.length === 0;
                        return (
                          <TableCell
                            key={dm.iso}
                            className={`text-center tabular-nums text-xs ${dm.isHol ? "bg-yellow-50" : dm.isSun ? "bg-gray-50" : ""}`}
                          >
                            {dayEntries.length === 0 ? (
                              hasCross ? (
                                <span className="text-muted-foreground">×</span>
                              ) : (
                                ""
                              )
                            ) : (
                              <div className="flex flex-col gap-0.5">
                                {dayEntries.map((e) => (
                                  <span key={e.id} className="whitespace-nowrap">
                                    {fmtHHMM(e.startedAt)}–{fmtHHMM(e.endedAt)}
                                  </span>
                                ))}
                              </div>
                            )}
                          </TableCell>
                        );
                      })}
                      <TableCell className="text-right tabular-nums font-medium">
                        {fmtDec(row.totals.total)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {fmtDec(row.totals.evening)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {fmtDec(row.totals.night)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {fmtDec(row.totals.sunHol)}
                      </TableCell>
                      <TableCell className="text-right text-muted-foreground">–</TableCell>
                      <TableCell className="text-right text-muted-foreground">–</TableCell>
                    </TableRow>
                  );
                })}
              </Fragment>
            );
          })}
        </TableBody>
      </Table>
    </Card>
  );
}