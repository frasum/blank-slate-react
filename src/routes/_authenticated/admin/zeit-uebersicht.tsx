// B6 — Arbeitszeitübersicht (Zusammenfassung + Buchhaltung), 1:1 nach tagesabrechnung.

import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Fragment, useMemo, useState } from "react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
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
  createPeriod,
  createTimeEntryShift,
  deletePeriod,
  getTimeOverview,
  getWeeklyTimeEntries,
  listPeriods,
  listPayrollNotes,
  setTimeEntryShift,
  togglePeriodLock,
  upsertPayrollNote,
} from "@/lib/time/time-admin.functions";
import { computeShiftHours, isBavarianHoliday, isSundayOrHoliday } from "@/lib/time/shift-hours";
import {
  buildFileBaseName,
  buildWeeklyPdf,
  buildWeeklyXlsx,
  downloadBlob,
  type WeeklyExportInput,
  type WeeklyExportRow,
} from "@/lib/time/weekly-export";
import { FileDown, FileSpreadsheet, Search } from "lucide-react";

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

// Periodenrhythmus 26.→25.: Label-Monat = Monat des Enddatums.
const MONTH_DE = [
  "Januar",
  "Februar",
  "März",
  "April",
  "Mai",
  "Juni",
  "Juli",
  "August",
  "September",
  "Oktober",
  "November",
  "Dezember",
];
function periodDefaultStart(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-26`;
}
function periodDefaultEnd(): string {
  const d = new Date();
  const y = d.getMonth() === 11 ? d.getFullYear() + 1 : d.getFullYear();
  const m = d.getMonth() === 11 ? 1 : d.getMonth() + 2;
  return `${y}-${String(m).padStart(2, "0")}-25`;
}
function periodLabelForEnd(endIso: string): string {
  const d = parseIsoDate(endIso);
  return `${MONTH_DE[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}
function nextPeriodFromLast(lastEndIso: string): {
  startDate: string;
  endDate: string;
  label: string;
} {
  // Start = letzter Tag + 1 (immer der 26.); End = Folgemonat-25.
  const start = addDays(parseIsoDate(lastEndIso), 1);
  const endMonth = start.getUTCMonth() === 11 ? 0 : start.getUTCMonth() + 1;
  const endYear = start.getUTCMonth() === 11 ? start.getUTCFullYear() + 1 : start.getUTCFullYear();
  const endIso = `${endYear}-${String(endMonth + 1).padStart(2, "0")}-25`;
  return { startDate: fmtIso(start), endDate: endIso, label: periodLabelForEnd(endIso) };
}
function fmtDDMM(iso: string): string {
  const d = parseIsoDate(iso);
  return `${String(d.getUTCDate()).padStart(2, "0")}.${String(d.getUTCMonth() + 1).padStart(2, "0")}.${d.getUTCFullYear()}`;
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
  const { identity } = useAuth();
  const isAdmin = identity?.role === "admin";
  const isPayroll = identity?.role === "payroll";
  const fetchLocations = useServerFn(listLocations);
  const fetchOverview = useServerFn(getTimeOverview);
  const fetchWeekly = useServerFn(getWeeklyTimeEntries);
  const fetchNotes = useServerFn(listPayrollNotes);
  const callUpsert = useServerFn(upsertPayrollNote);
  const callSetShift = useServerFn(setTimeEntryShift);
  const callCreateShift = useServerFn(createTimeEntryShift);
  const fetchPeriods = useServerFn(listPeriods);
  const callCreatePeriod = useServerFn(createPeriod);
  const callToggleLock = useServerFn(togglePeriodLock);
  const callDeletePeriod = useServerFn(deletePeriod);

  const locationsQ = useQuery({
    queryKey: ["admin-locations"],
    queryFn: () => fetchLocations(),
  });
  const locations = locationsQ.data ?? [];
  // Wochenplan-Location-Filter: konkrete Location-ID oder "all".
  const [locationFilter, setLocationFilter] = useState<string>("");
  const effectiveLocationId =
    locationFilter && locationFilter !== "all"
      ? locationFilter
      : (locations[0]?.id ?? "");
  const isAllLocations = locationFilter === "all";

  // Periodenwahl
  const periodsQ = useQuery({
    queryKey: ["periods"],
    queryFn: () => fetchPeriods(),
  });
  const periods = periodsQ.data ?? [];
  const [selectedPeriodId, setSelectedPeriodId] = useState<string>("");
  const effectivePeriodId = selectedPeriodId || periods[0]?.id || "";
  const selectedPeriod = periods.find((p) => p.id === effectivePeriodId);

  // Fallback: freie Daten, wenn keine Periode existiert.
  const [manualFrom, setManualFrom] = useState<string>(firstOfMonthIso());
  const [manualTo, setManualTo] = useState<string>(todayIso());
  const fromDate = selectedPeriod ? selectedPeriod.startDate : manualFrom;
  const toDate = selectedPeriod ? selectedPeriod.endDate : manualTo;

  // Wochenplan: aktueller Monat + Woche.
  const [selectedMonth, setSelectedMonth] = useState<string>(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  });
  const [weekStart, setWeekStart] = useState<string>(() =>
    fmtIso(mondayOf(parseIsoDate(todayIso()))),
  );
  const weekStartDate = useMemo(() => parseIsoDate(weekStart), [weekStart]);
  const weekDays = useMemo(
    () => Array.from({ length: 7 }, (_, i) => addDays(weekStartDate, i)),
    [weekStartDate],
  );
  const { week: currentWeekNo } = isoWeek(weekStartDate);
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [activeTab, setActiveTab] = useState<string>("weekly");

  // Wochen-Chips für den gewählten Monat (alle KW, die mind. einen Tag des Monats enthalten).
  const monthWeeks = useMemo(() => {
    const [y, m] = selectedMonth.split("-").map((s) => Number.parseInt(s, 10));
    const firstDay = new Date(Date.UTC(y, m - 1, 1));
    const lastDay = new Date(Date.UTC(y, m, 0));
    const chips: { idx: number; start: string; end: string; label: string; weekNo: number }[] = [];
    let cursor = mondayOf(firstDay);
    let i = 1;
    while (cursor.getTime() <= lastDay.getTime()) {
      const end = addDays(cursor, 6);
      const wk = isoWeek(cursor);
      chips.push({
        idx: i,
        start: fmtIso(cursor),
        end: fmtIso(end),
        label: `W${i} (${ddmm(cursor)}–${ddmm(end)})`,
        weekNo: wk.week,
      });
      cursor = addDays(cursor, 7);
      i++;
    }
    return chips;
  }, [selectedMonth]);

  // Monats-Optionen: 6 Monate zurück bis 6 Monate vor.
  const monthOptions = useMemo(() => {
    const opts: { value: string; label: string }[] = [];
    const now = new Date();
    for (let off = -6; off <= 6; off++) {
      const d = new Date(now.getFullYear(), now.getMonth() + off, 1);
      const value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const label = `${MONTH_DE[d.getMonth()]} ${d.getFullYear()}`;
      opts.push({ value, label });
    }
    return opts;
  }, []);

  // Wenn "Alle Standorte" gewählt: pro Location parallel laden + clientseitig mergen.
  const allLocationQueries = useQueries({
    queries: isAllLocations
      ? locations.map((l) => ({
          queryKey: ["weekly-entries", l.id, weekStart],
          queryFn: () => fetchWeekly({ data: { locationId: l.id, weekStart } }),
          enabled: Boolean(weekStart),
        }))
      : [],
  });

  const weeklyQSingle = useQuery({
    queryKey: ["weekly-entries", effectiveLocationId, weekStart],
    queryFn: () => fetchWeekly({ data: { locationId: effectiveLocationId, weekStart } }),
    enabled: Boolean(effectiveLocationId) && !isAllLocations,
  });

  // Zusammengeführte Wochen-Daten.
  const weeklyData = useMemo<WeeklyData | undefined>(() => {
    if (isAllLocations) {
      const merged: WeeklyData = {
        weekStart,
        weekEnd: fmtIso(addDays(weekStartDate, 6)),
        entries: [],
        crossLocationDates: {},
      };
      for (const q of allLocationQueries) {
        const d = q.data as WeeklyData | undefined;
        if (!d) continue;
        merged.entries.push(...d.entries);
      }
      return merged;
    }
    return weeklyQSingle.data;
  }, [isAllLocations, allLocationQueries, weeklyQSingle.data, weekStart, weekStartDate]);
  const weeklyLoading = isAllLocations
    ? allLocationQueries.some((q) => q.isLoading)
    : weeklyQSingle.isLoading;

  const overviewQ = useQuery({
    queryKey: ["time-overview", effectiveLocationId, fromDate, toDate],
    queryFn: () => fetchOverview({ data: { locationId: effectiveLocationId, fromDate, toDate } }),
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
    const entries: Entry[] = overviewQ.data?.entries ?? [];
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
  }, [overviewQ.data]);

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
    mutationFn: (vars: { staffId: string; vorschuss: number; besonderheiten: string | null }) =>
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

  // Inline-Edit-Dialog State
  const [editor, setEditor] = useState<
    | null
    | {
        mode: "edit";
        id: string;
        staffName: string;
        dateIso: string;
        from: string;
        to: string;
      }
    | {
        mode: "create";
        staffId: string;
        staffName: string;
        dateIso: string;
        from: string;
        to: string;
      }
  >(null);

  function invalidateWeekly() {
    void qc.invalidateQueries({
      queryKey: ["weekly-entries", effectiveLocationId, weekStart],
    });
  }

  const setShiftMut = useMutation({
    mutationFn: (vars: { id: string; startedAt: string; endedAt: string }) =>
      callSetShift({ data: vars }),
    onSuccess: () => {
      invalidateWeekly();
      setEditor(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const createShiftMut = useMutation({
    mutationFn: (vars: {
      staffId: string;
      locationId: string;
      startedAt: string;
      endedAt: string;
    }) => callCreateShift({ data: vars }),
    onSuccess: () => {
      invalidateWeekly();
      setEditor(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const invalidatePeriods = () => {
    void qc.invalidateQueries({ queryKey: ["periods"] });
  };
  const createPeriodMut = useMutation({
    mutationFn: (vars: { label: string; startDate: string; endDate: string }) =>
      callCreatePeriod({ data: vars }),
    onSuccess: () => {
      invalidatePeriods();
      toast.success("Periode angelegt.");
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const toggleLockMut = useMutation({
    mutationFn: (id: string) => callToggleLock({ data: { id } }),
    onSuccess: () => invalidatePeriods(),
    onError: (e: Error) => toast.error(e.message),
  });
  const deletePeriodMut = useMutation({
    mutationFn: (id: string) => callDeletePeriod({ data: { id } }),
    onSuccess: () => {
      invalidatePeriods();
      toast.success("Periode gelöscht.");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // ============ Wochenplan-Aggregation (für Render + Export) ============
  const weeklyExportInput = useMemo<WeeklyExportInput | null>(() => {
    const data = weeklyData;
    if (!data) return null;
    const days = weekDays.map((d) => ({
      iso: fmtIso(d),
      label: dayHeader(d),
      isSunOrHol: isSundayOrHoliday(d),
    }));

    type AccRow = {
      staffId: string;
      displayName: string;
      department: Department;
      byDate: Map<string, WeeklyEntry[]>;
      totals: { total: number; evening: number; night: number; sunHol: number };
    };
    const rowMap = new Map<string, AccRow>();
    for (const e of data.entries) {
      let r = rowMap.get(e.staffId);
      if (!r) {
        r = {
          staffId: e.staffId,
          displayName: e.displayName,
          department: e.department,
          byDate: new Map(),
          totals: { total: 0, evening: 0, night: 0, sunHol: 0 },
        };
        rowMap.set(e.staffId, r);
      }
      const arr = r.byDate.get(e.businessDate) ?? [];
      arr.push(e);
      r.byDate.set(e.businessDate, arr);
      const s = computeShiftHours(e.startedAt, e.endedAt, e.businessDate);
      r.totals.total += s.totalHours;
      r.totals.evening += s.eveningHours;
      r.totals.night += s.nightHours;
      r.totals.sunHol += s.sundayHolidayHours;
    }
    const cross = data.crossLocationDates ?? {};
    const q = searchQuery.trim().toLowerCase();

    const buildExportRow = (r: AccRow): WeeklyExportRow => ({
      staffId: r.staffId,
      displayName: r.displayName,
      department: r.department,
      days: days.map((d) => {
        const dayEntries = r.byDate.get(d.iso) ?? [];
        return {
          iso: d.iso,
          label: d.label,
          isSunOrHol: d.isSunOrHol,
          shifts: dayEntries.map((e) => ({
            from: fmtHHMM(e.startedAt),
            to: fmtHHMM(e.endedAt),
          })),
          crossLocation:
            dayEntries.length === 0 && (cross[r.staffId] ?? []).includes(d.iso),
        };
      }),
      totals: r.totals,
    });

    const rowsByDept: WeeklyExportInput["rowsByDept"] = DEPT_ORDER.map((dept) => ({
      dept,
      deptLabel: DEPT_HEADER_LABEL[dept],
      rows: Array.from(rowMap.values())
        .filter((r) => r.department === dept)
        .filter((r) => q === "" || r.displayName.toLowerCase().includes(q))
        .sort((a, b) => a.displayName.localeCompare(b.displayName, "de"))
        .map(buildExportRow),
    }));

    const locLabel = isAllLocations
      ? "Alle"
      : (locations.find((l) => l.id === effectiveLocationId)?.name ?? "");
    const wk = isoWeek(weekStartDate);
    return {
      locationLabel: locLabel,
      weekNo: wk.week,
      weekYear: wk.year,
      rangeLabel: `${ddmm(weekDays[0])}–${ddmm(weekDays[6])}${weekDays[6].getUTCFullYear()}`,
      days,
      rowsByDept,
    };
  }, [
    weeklyData,
    weekDays,
    weekStartDate,
    searchQuery,
    isAllLocations,
    locations,
    effectiveLocationId,
  ]);

  const handleExportXlsx = async () => {
    if (!weeklyExportInput) return;
    try {
      const blob = await buildWeeklyXlsx(weeklyExportInput);
      downloadBlob(blob, `${buildFileBaseName(weeklyExportInput)}.xlsx`);
    } catch (e) {
      toast.error((e as Error).message || "Excel-Export fehlgeschlagen");
    }
  };
  const handleExportPdf = () => {
    if (!weeklyExportInput) return;
    try {
      const blob = buildWeeklyPdf(weeklyExportInput);
      downloadBlob(blob, `${buildFileBaseName(weeklyExportInput)}.pdf`);
    } catch (e) {
      toast.error((e as Error).message || "PDF-Export fehlgeschlagen");
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Zeitübersicht</h1>
        <p className="text-sm text-muted-foreground">
          Arbeitszeit nach Kalenderwochen und Lohnbuchhaltungs-Übersicht.
        </p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="flex-wrap">
          <TabsTrigger value="weekly">Wochenplan</TabsTrigger>
          <TabsTrigger value="summary">Zusammenfassung</TabsTrigger>
          <TabsTrigger value="payroll">Buchhaltung</TabsTrigger>
          <TabsTrigger value="periods">Perioden</TabsTrigger>
          <TabsTrigger value="brutto-netto">Brutto/Netto</TabsTrigger>
          <TabsTrigger value="provision">Provision</TabsTrigger>
        </TabsList>

        {(activeTab === "summary" || activeTab === "payroll") && (
          <Card className="my-3 p-3">
            <div className="flex flex-wrap items-end gap-3">
              <div className="space-y-1">
                <Label htmlFor="loc-zr">Standort</Label>
                <select
                  id="loc-zr"
                  className="h-9 rounded-md border border-input bg-background px-3 text-sm"
                  value={effectiveLocationId}
                  onChange={(e) => setLocationFilter(e.target.value)}
                >
                  {locations.map((l) => (
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
                  onChange={(e) => setManualFrom(e.target.value)}
                  disabled={Boolean(selectedPeriod)}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="to">Bis</Label>
                <Input
                  id="to"
                  type="date"
                  value={toDate}
                  onChange={(e) => setManualTo(e.target.value)}
                  disabled={Boolean(selectedPeriod)}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="period">Periode</Label>
                <select
                  id="period"
                  className="h-9 rounded-md border border-input bg-background px-3 text-sm"
                  value={effectivePeriodId}
                  onChange={(e) => setSelectedPeriodId(e.target.value)}
                >
                  <option value="">— freie Auswahl —</option>
                  {periods.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.label} {p.status === "locked" ? "🔒" : ""}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </Card>
        )}

        <TabsContent value="weekly">
          <Card className="p-4 mb-3 space-y-3">
            {/* Zeile 1: Monat + Location-Pills + Exporte */}
            <div className="flex flex-wrap items-center gap-3">
              <select
                className="h-9 rounded-md border border-input bg-background px-3 text-sm"
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(e.target.value)}
              >
                {monthOptions.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
              <div className="inline-flex rounded-md border border-input bg-background p-1">
                {locations.map((l) => {
                  const active =
                    (locationFilter || locations[0]?.id) === l.id && !isAllLocations;
                  return (
                    <button
                      key={l.id}
                      type="button"
                      onClick={() => setLocationFilter(l.id)}
                      className={`h-7 rounded px-3 text-sm transition ${
                        active
                          ? "bg-primary text-primary-foreground"
                          : "text-foreground hover:bg-muted"
                      }`}
                    >
                      {l.name}
                    </button>
                  );
                })}
                <button
                  type="button"
                  onClick={() => setLocationFilter("all")}
                  className={`h-7 rounded px-3 text-sm transition ${
                    isAllLocations
                      ? "bg-primary text-primary-foreground"
                      : "text-foreground hover:bg-muted"
                  }`}
                >
                  Alle
                </button>
              </div>
              <div className="ml-auto flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={handleExportPdf}>
                  <FileDown className="mr-1 h-4 w-4" /> PDF
                </Button>
                <Button variant="outline" size="sm" onClick={handleExportXlsx}>
                  <FileSpreadsheet className="mr-1 h-4 w-4" /> Excel
                </Button>
              </div>
            </div>
            {/* Zeile 2: Wochen-Chips */}
            <div className="flex flex-wrap items-center gap-2">
              {monthWeeks.map((c) => {
                const active = c.start === weekStart;
                return (
                  <button
                    key={c.start}
                    type="button"
                    onClick={() => setWeekStart(c.start)}
                    className={`h-8 rounded-md px-3 text-sm transition ${
                      active
                        ? "bg-foreground text-background"
                        : "bg-muted text-muted-foreground hover:bg-muted/80"
                    }`}
                  >
                    <span className="font-semibold">W{c.idx}</span>{" "}
                    <span className="opacity-80">
                      ({ddmm(parseIsoDate(c.start))}–{ddmm(parseIsoDate(c.end))})
                    </span>
                  </button>
                );
              })}
              <button
                type="button"
                onClick={() => setWeekStart(fmtIso(mondayOf(parseIsoDate(todayIso()))))}
                className="ml-auto h-8 rounded-md border border-input bg-background px-3 text-xs hover:bg-muted"
              >
                Heute
              </button>
            </div>
            {/* Zeile 3: Suche */}
            <div className="relative max-w-xs">
              <Search className="pointer-events-none absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Mitarbeiter suchen…"
                className="h-9 pl-8"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            <div className="text-xs text-muted-foreground tabular-nums">
              KW {currentWeekNo} · {ddmm(weekDays[0])}–{ddmm(weekDays[6])}
              {weekDays[6].getUTCFullYear()}
            </div>
          </Card>
          <WeeklyPlan
            input={weeklyExportInput}
            isLoading={weeklyLoading}
            weekDays={weekDays}
            isAdmin={isAdmin}
            onEdit={(e) =>
              setEditor({
                mode: "edit",
                id: e.id,
                staffName: e.displayName,
                dateIso: e.businessDate,
                from: fmtHHMM(e.startedAt),
                to: fmtHHMM(e.endedAt),
              })
            }
            onCreate={(staffId, staffName, dateIso) =>
              setEditor({
                mode: "create",
                staffId,
                staffName,
                dateIso,
                from: "",
                to: "",
              })
            }
            entriesById={useMemo(() => {
              const m = new Map<string, WeeklyEntry>();
              for (const e of weeklyData?.entries ?? []) m.set(e.id, e);
              return m;
            }, [weeklyData])}
          />
        </TabsContent>

        <TabsContent value="brutto-netto">
          <Card className="p-6 text-sm text-muted-foreground">
            Brutto/Netto-Auswertung wird im nächsten Schritt umgesetzt.
          </Card>
        </TabsContent>

        <TabsContent value="provision">
          <Card className="p-6 text-sm text-muted-foreground">
            Provisions-Auswertung wird im nächsten Schritt umgesetzt.
          </Card>
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
                          readOnly={isPayroll}
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

        <TabsContent value="periods">
          <PeriodsPanel
            periods={periods}
            isAdmin={isAdmin}
            isLoading={periodsQ.isLoading}
            onCreate={(vars) => createPeriodMut.mutate(vars)}
            onToggleLock={(id) => toggleLockMut.mutate(id)}
            onDelete={(id) => deletePeriodMut.mutate(id)}
            pending={
              createPeriodMut.isPending || toggleLockMut.isPending || deletePeriodMut.isPending
            }
          />
        </TabsContent>
      </Tabs>

      <ShiftEditorDialog
        state={editor}
        onClose={() => setEditor(null)}
        onSubmit={(from, to) => {
          if (!editor) return;
          const startedAt = buildIsoFromLocal(editor.dateIso, from);
          const endedAt = buildIsoFromLocal(editor.dateIso, to, from);
          if (editor.mode === "edit") {
            setShiftMut.mutate({ id: editor.id, startedAt, endedAt });
          } else {
            createShiftMut.mutate({
              staffId: editor.staffId,
              locationId: effectiveLocationId,
              startedAt,
              endedAt,
            });
          }
        }}
        pending={setShiftMut.isPending || createShiftMut.isPending}
      />
    </div>
  );
}

function PayrollRow({
  staff,
  initial,
  readOnly = false,
  onSave,
}: {
  staff: {
    staffId: string;
    displayName: string;
    totalHours: number;
    shiftDates: Set<string>;
  };
  initial: { vorschuss: number; besonderheiten: string } | undefined;
  readOnly?: boolean;
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
          readOnly={readOnly}
          disabled={readOnly}
          value={vorschuss}
          onChange={(e) => setVorschuss(e.target.value)}
          onBlur={() => {
            if (readOnly) return;
            const n = Number.parseFloat(vorschuss.replace(",", "."));
            const safe = Number.isFinite(n) && n >= 0 ? n : 0;
            setVorschuss(safe.toFixed(2));
            const prev = initial?.vorschuss ?? 0;
            if (
              Math.abs(safe - prev) > 0.005 ||
              besonderheiten !== (initial?.besonderheiten ?? "")
            ) {
              onSave(safe, besonderheiten);
            }
          }}
        />
      </TableCell>
      <TableCell>
        <Textarea
          rows={1}
          className="min-h-8 resize-y"
          readOnly={readOnly}
          disabled={readOnly}
          value={besonderheiten}
          onChange={(e) => setBesonderheiten(e.target.value)}
          onBlur={() => {
            if (readOnly) return;
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

// Baut einen ISO-Timestamp aus Geschäftsdatum + HH:MM (Browser-/Lokalzeit).
// `fromHHMM` wird mitgegeben, damit ein Mitternachts-Überlauf erkannt wird:
// wenn die End-Uhrzeit kleiner als die Start-Uhrzeit ist, rollt der Tag um 1.
function buildIsoFromLocal(dateIso: string, hhmm: string, fromHHMM?: string): string {
  const [h, m] = hhmm.split(":").map((v) => Number.parseInt(v, 10));
  const local = new Date(`${dateIso}T00:00:00`);
  local.setHours(h, m, 0, 0);
  if (fromHHMM) {
    const [fh, fm] = fromHHMM.split(":").map((v) => Number.parseInt(v, 10));
    if (h * 60 + m <= fh * 60 + fm) {
      local.setDate(local.getDate() + 1);
    }
  }
  return local.toISOString();
}

function dayHeader(d: Date): string {
  const names = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];
  return `${names[d.getUTCDay()]} ${ddmm(d)}`;
}

function WeeklyPlan({
  input,
  isLoading,
  weekDays,
  isAdmin,
  onEdit,
  onCreate,
  entriesById,
}: {
  input: WeeklyExportInput | null;
  isLoading: boolean;
  weekDays: Date[];
  isAdmin: boolean;
  onEdit: (entry: WeeklyEntry) => void;
  onCreate: (staffId: string, staffName: string, dateIso: string) => void;
  entriesById: Map<string, WeeklyEntry>;
}) {
  // Header-Tagesmeta (Wochentag-Label + Feiertags-Hint)
  const dayMeta = weekDays.map((d) => ({
    date: d,
    iso: fmtIso(d),
    isSun: d.getUTCDay() === 0,
    isHol: isBavarianHoliday(d),
    isSunOrHol: isSundayOrHoliday(d),
  }));

  // Spalten: Mitarbeiter + 7×2 (Anfang/Ende) + 6 Summen
  const totalCols = 1 + 14 + 6;

  const groups = input?.rowsByDept ?? [];
  const anyRows = groups.some((g) => g.rows.length > 0);

  // Hilfsfunktion: aus staffId + ISO → die echten WeeklyEntry-Objekte
  // (für onEdit/onCreate, da WeeklyExportRow nur Strings hält).
  const findEntries = (staffId: string, iso: string): WeeklyEntry[] => {
    const out: WeeklyEntry[] = [];
    for (const e of entriesById.values()) {
      if (e.staffId === staffId && e.businessDate === iso) out.push(e);
    }
    return out;
  };

  return (
    <Card className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead rowSpan={2} className="w-[140px] min-w-[140px] align-bottom">
              Mitarbeiter
            </TableHead>
            {dayMeta.map((dm) => (
              <TableHead
                key={dm.iso}
                colSpan={2}
                className={`text-center whitespace-nowrap border-l ${
                  dm.isHol ? "bg-yellow-50" : dm.isSun ? "bg-gray-100" : ""
                }`}
              >
                {dayHeader(dm.date)}
                {dm.isHol && (
                  <span className="block text-[10px] font-normal text-muted-foreground">
                    (Fei)
                  </span>
                )}
              </TableHead>
            ))}
            <TableHead rowSpan={2} className="text-right align-bottom border-l">
              Ges
            </TableHead>
            <TableHead rowSpan={2} className="text-right align-bottom">
              20–24
            </TableHead>
            <TableHead rowSpan={2} className="text-right align-bottom">
              24–x
            </TableHead>
            <TableHead rowSpan={2} className="text-right align-bottom">
              So/Fei
            </TableHead>
            <TableHead rowSpan={2} className="text-right align-bottom">
              U
            </TableHead>
            <TableHead rowSpan={2} className="text-right align-bottom">
              K
            </TableHead>
          </TableRow>
          <TableRow>
            {dayMeta.map((dm) => (
              <Fragment key={`sub-${dm.iso}`}>
                <TableHead
                  className={`text-center text-[10px] font-normal text-muted-foreground border-l ${
                    dm.isHol ? "bg-yellow-50" : dm.isSun ? "bg-gray-100" : ""
                  }`}
                >
                  Anf.
                </TableHead>
                <TableHead
                  className={`text-center text-[10px] font-normal text-muted-foreground ${
                    dm.isHol ? "bg-yellow-50" : dm.isSun ? "bg-gray-100" : ""
                  }`}
                >
                  Ende
                </TableHead>
              </Fragment>
            ))}
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
          {!isLoading && !anyRows && (
            <TableRow>
              <TableCell colSpan={totalCols} className="text-center text-muted-foreground">
                Keine Einträge in dieser Woche.
              </TableCell>
            </TableRow>
          )}
          {groups.map((grp) => {
            if (grp.rows.length === 0) return null;
            return (
              <Fragment key={`w-${grp.dept}`}>
                <TableRow className={DEPT_BG[grp.dept]}>
                  <TableCell colSpan={totalCols} className="font-semibold text-foreground">
                    {grp.deptLabel}
                  </TableCell>
                </TableRow>
                {grp.rows.map((row) => (
                  <TableRow key={row.staffId}>
                    <TableCell className="relative pl-3 font-medium">
                      <span
                        className={`absolute left-0 top-0 bottom-0 w-[2px] ${DEPT_BAR[row.department]}`}
                      />
                      {row.displayName}
                    </TableCell>
                    {row.days.map((day, idx) => {
                      const dm = dayMeta[idx];
                      const cellBg = dm.isHol ? "bg-yellow-50" : dm.isSun ? "bg-gray-50" : "";
                      const empty = day.shifts.length === 0;
                      const clickable = isAdmin;
                      const handleClick = () => {
                        if (!clickable) return;
                        if (empty) {
                          onCreate(row.staffId, row.displayName, day.iso);
                          return;
                        }
                        const found = findEntries(row.staffId, day.iso);
                        if (found.length === 1) onEdit(found[0]);
                      };
                      const renderShift = (which: "from" | "to") => {
                        if (empty) {
                          if (day.crossLocation && which === "from")
                            return <span className="text-muted-foreground">×</span>;
                          if (clickable && which === "from")
                            return <span className="text-muted-foreground/40">+</span>;
                          return "";
                        }
                        return (
                          <div className="flex flex-col divide-y divide-border/60">
                            {day.shifts.map((s, i) => (
                              <span key={i} className="py-0.5 tabular-nums">
                                {s[which]}
                              </span>
                            ))}
                          </div>
                        );
                      };
                      return (
                        <Fragment key={day.iso}>
                          <TableCell
                            onClick={handleClick}
                            className={`border-l p-1 text-center align-middle font-mono text-sm ${cellBg} ${clickable ? "cursor-pointer hover:bg-muted/60" : ""}`}
                          >
                            {renderShift("from")}
                          </TableCell>
                          <TableCell
                            onClick={handleClick}
                            className={`p-1 text-center align-middle font-mono text-sm ${cellBg} ${clickable ? "cursor-pointer hover:bg-muted/60" : ""}`}
                          >
                            {renderShift("to")}
                          </TableCell>
                        </Fragment>
                      );
                    })}
                    <TableCell className="text-right tabular-nums font-medium border-l">
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
                ))}
              </Fragment>
            );
          })}
        </TableBody>
      </Table>
    </Card>
  );
}
type EditorState =
  | { mode: "edit"; id: string; staffName: string; dateIso: string; from: string; to: string }
  | {
      mode: "create";
      staffId: string;
      staffName: string;
      dateIso: string;
      from: string;
      to: string;
    };

function ShiftEditorDialog({
  state,
  onClose,
  onSubmit,
  pending,
}: {
  state: EditorState | null;
  onClose: () => void;
  onSubmit: (from: string, to: string) => void;
  pending: boolean;
}) {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const open = state !== null;
  // Reset Felder bei jedem Öffnen
  useMemo(() => {
    if (state) {
      setFrom(state.from);
      setTo(state.to);
    }
  }, [state]);

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
    >
      <DialogContent className="sm:max-w-[360px]">
        <DialogHeader>
          <DialogTitle>
            {state?.mode === "create" ? "Neue Schicht" : "Schicht bearbeiten"}
          </DialogTitle>
        </DialogHeader>
        {state && (
          <div className="space-y-3">
            <div className="text-sm text-muted-foreground">
              {state.staffName} · {state.dateIso}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="shift-from">Von</Label>
                <Input
                  id="shift-from"
                  type="time"
                  value={from}
                  onChange={(e) => setFrom(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="shift-to">Bis</Label>
                <Input
                  id="shift-to"
                  type="time"
                  value={to}
                  onChange={(e) => setTo(e.target.value)}
                />
              </div>
            </div>
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={pending}>
            Abbrechen
          </Button>
          <Button
            onClick={() => {
              if (!/^\d{2}:\d{2}$/.test(from) || !/^\d{2}:\d{2}$/.test(to)) {
                toast.error("Bitte gültige Zeiten eingeben.");
                return;
              }
              onSubmit(from, to);
            }}
            disabled={pending}
          >
            Speichern
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

type Period = {
  id: string;
  label: string;
  startDate: string;
  endDate: string;
  status: "open" | "locked";
};

function PeriodsPanel({
  periods,
  isAdmin,
  isLoading,
  onCreate,
  onToggleLock,
  onDelete,
  pending,
}: {
  periods: Period[];
  isAdmin: boolean;
  isLoading: boolean;
  onCreate: (vars: { label: string; startDate: string; endDate: string }) => void;
  onToggleLock: (id: string) => void;
  onDelete: (id: string) => void;
  pending: boolean;
}) {
  const [label, setLabel] = useState<string>(periodLabelForEnd(periodDefaultEnd()));
  const [startDate, setStartDate] = useState<string>(periodDefaultStart());
  const [endDate, setEndDate] = useState<string>(periodDefaultEnd());

  const hasAny = periods.length > 0;
  const latestEnd = hasAny ? periods[0].endDate : null;

  return (
    <div className="space-y-4">
      {isAdmin && (
        <Card className="p-4 space-y-3">
          <div className="text-sm font-medium">Neue Periode anlegen</div>
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1">
              <Label htmlFor="p-label">Label</Label>
              <Input
                id="p-label"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                className="w-40"
                placeholder="z. B. Juli 2026"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="p-from">Von</Label>
              <Input
                id="p-from"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="p-to">Bis</Label>
              <Input
                id="p-to"
                type="date"
                value={endDate}
                onChange={(e) => {
                  setEndDate(e.target.value);
                  setLabel(periodLabelForEnd(e.target.value));
                }}
              />
            </div>
            <Button
              disabled={pending || !label.trim()}
              onClick={() => onCreate({ label: label.trim(), startDate, endDate })}
            >
              Anlegen
            </Button>
            {hasAny && latestEnd && (
              <Button
                variant="outline"
                disabled={pending}
                onClick={() => {
                  const np = nextPeriodFromLast(latestEnd);
                  onCreate(np);
                }}
              >
                Nächste Periode
              </Button>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            Perioden laufen vom 26. bis zum 25. des Folgemonats. Das Label bezieht sich auf den
            Monat des Enddatums.
          </p>
        </Card>
      )}

      {isLoading ? (
        <Card className="p-4 text-sm text-muted-foreground">Lade…</Card>
      ) : periods.length === 0 ? (
        <Card className="p-6 text-center text-sm text-muted-foreground">
          Noch keine Perioden. Legen Sie die erste Periode an.
        </Card>
      ) : (
        <div className="space-y-2">
          {periods.map((p) => (
            <Card key={p.id} className="p-3 flex items-center gap-3">
              <div className="flex-1">
                <div className="font-medium">{p.label}</div>
                <div className="text-xs text-muted-foreground tabular-nums">
                  {fmtDDMM(p.startDate)} – {fmtDDMM(p.endDate)}
                </div>
              </div>
              <span
                className={
                  p.status === "open"
                    ? "rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800"
                    : "rounded-full bg-gray-200 px-2 py-0.5 text-xs font-medium text-gray-700"
                }
              >
                {p.status === "open" ? "Offen" : "Gesperrt"}
              </span>
              {isAdmin && (
                <>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={pending}
                    onClick={() => onToggleLock(p.id)}
                  >
                    {p.status === "open" ? "Sperren" : "Entsperren"}
                  </Button>
                  {p.status === "open" && (
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={pending}
                      onClick={() => {
                        if (confirm(`Periode „${p.label}" wirklich löschen?`)) {
                          onDelete(p.id);
                        }
                      }}
                    >
                      Löschen
                    </Button>
                  )}
                </>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
