// B6 — Arbeitszeitübersicht (Zusammenfassung + Buchhaltung), 1:1 nach tagesabrechnung.

import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { todayIso } from "@/lib/format";
import { ZeitSkeleton } from "@/components/ui/page-skeletons";
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
import { LocationPills } from "@/components/shared/LocationPills";
import {
  createPeriod,
  createTimeEntryShift,
  deletePeriod,
  getTimeOverview,
  getWeeklyTimeEntries,
  getSfnOverview,
  listPeriods,
  listPayrollNotes,
  listAdvancesByStaff,
  listAbsencesByStaff,
  setTimeEntryShift,
  togglePeriodLock,
  upsertPayrollNote,
} from "@/lib/time/time-admin.functions";
import {
  bavarianHolidayName,
  computeShiftHours,
  isBavarianHoliday,
  isSundayOrHoliday,
} from "@/lib/time/shift-hours";
import {
  buildFileBaseName,
  buildWeeklyPdf,
  buildWeeklyXlsx,
  downloadBlob,
  type WeeklyExportInput,
  type WeeklyExportRow,
} from "@/lib/time/weekly-export";
import {
  buildBuchhaltungPdf,
  buildBuchhaltungXlsx,
  buildBuchhaltungFileBase,
  type BuchhaltungExportInput,
  type BuchhaltungExportRow,
  type BuchhaltungMode,
} from "@/lib/time/buchhaltung-export";
import { CalendarDays, FileDown, FileSpreadsheet, Search } from "lucide-react";
import { ProvisionTab } from "@/components/lohn/ProvisionTab";
import { LohnrechnerPanel } from "@/components/lohn/LohnrechnerPanel";
import { BatchTimesCard } from "@/components/zeit/BatchTimesCard";
import { entryRowDepartment } from "@/lib/time/primary-department";
import { filterWeeklyRows } from "@/lib/time/weekly-filter";
import { listSkills, type SkillCategory } from "@/lib/admin/skills.functions";
import { PillSelect } from "@/components/ui/pill-select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const Route = createFileRoute("/_authenticated/admin/zeit-uebersicht")({
  head: () => ({ meta: [{ title: "Arbeitszeiten" }] }),
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
  const fetchSkills = useServerFn(listSkills);
  const fetchNotes = useServerFn(listPayrollNotes);
  const fetchAdvances = useServerFn(listAdvancesByStaff);
  const fetchAbsences = useServerFn(listAbsencesByStaff);
  const fetchSfn = useServerFn(getSfnOverview);
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
  const locations = useMemo(() => locationsQ.data ?? [], [locationsQ.data]);
  // Wochenplan-Location-Filter: konkrete Location-ID oder "all".
  const [locationFilter, setLocationFilter] = useState<string>("");
  const effectiveLocationId =
    locationFilter && locationFilter !== "all" ? locationFilter : (locations[0]?.id ?? "");
  const isAllLocations = locationFilter === "all";

  // Periodenwahl
  const periodsQ = useQuery({
    queryKey: ["periods"],
    queryFn: () => fetchPeriods(),
  });
  const periods = periodsQ.data ?? [];
  const [selectedPeriodId, setSelectedPeriodId] = useState<string>("");
  const today = todayIso();
  const periodContainingToday = periods.find((p) => p.startDate <= today && p.endDate >= today);
  const effectivePeriodId = selectedPeriodId || periodContainingToday?.id || periods[0]?.id || "";
  const selectedPeriod = periods.find((p) => p.id === effectivePeriodId);

  // Fallback: freie Daten, wenn keine Periode existiert.
  const [manualFrom] = useState<string>(firstOfMonthIso());
  const [manualTo] = useState<string>(todayIso());
  const fromDate = selectedPeriod ? selectedPeriod.startDate : manualFrom;
  const toDate = selectedPeriod ? selectedPeriod.endDate : manualTo;

  // Wochenplan: aktuelle Woche (Periode kommt aus selectedPeriodId).
  const [weekStart, setWeekStart] = useState<string>(() =>
    fmtIso(mondayOf(parseIsoDate(todayIso()))),
  );
  const weekStartDate = useMemo(() => parseIsoDate(weekStart), [weekStart]);
  const weekDays = useMemo(
    () => Array.from({ length: 7 }, (_, i) => addDays(weekStartDate, i)),
    [weekStartDate],
  );
  const [searchQuery, setSearchQuery] = useState<string>("");
  // Z4 — Wochenplan-Filter (nur Anzeige, nicht Export/Buchhaltung).
  const [deptFilter, setDeptFilter] = useState<Department | "all">("all");
  const [skillFilter, setSkillFilter] = useState<string>("all");
  const [activeTab, setActiveTab] = useState<string>("weekly");
  // Buchhaltung-Tab: §3b-Toggle + eigene Suche.
  const [payrollMode, setPayrollMode] = useState<BuchhaltungMode>("simple");
  const [payrollSearch, setPayrollSearch] = useState<string>("");

  // Wochen-Chips für die gewählte Abrechnungsperiode (Montage vom Periodenstart bis ≤ Periodenende).
  const periodWeeks = useMemo(() => {
    if (!selectedPeriod) return [] as { idx: number; start: string; end: string }[];
    const start = parseIsoDate(selectedPeriod.startDate);
    const end = parseIsoDate(selectedPeriod.endDate);
    const chips: { idx: number; start: string; end: string }[] = [];
    let cursor = mondayOf(start);
    let i = 1;
    while (cursor.getTime() <= end.getTime()) {
      chips.push({ idx: i, start: fmtIso(cursor), end: fmtIso(addDays(cursor, 6)) });
      cursor = addDays(cursor, 7);
      i++;
    }
    return chips;
  }, [selectedPeriod]);

  // Beim Periodenwechsel: weekStart in die Periode snappen (bevorzugt Woche mit "heute").
  useEffect(() => {
    if (!selectedPeriod) return;
    const firstMonday = fmtIso(mondayOf(parseIsoDate(selectedPeriod.startDate)));
    const todayMon = fmtIso(mondayOf(parseIsoDate(todayIso())));
    const todayInPeriod = todayMon >= firstMonday && todayMon <= selectedPeriod.endDate;
    if (weekStart < firstMonday || weekStart > selectedPeriod.endDate) {
      setWeekStart(todayInPeriod ? todayMon : firstMonday);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectivePeriodId]);

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
        assignedStaff: [],
      };
      for (const q of allLocationQueries) {
        const d = q.data as WeeklyData | undefined;
        if (!d) continue;
        merged.entries.push(...d.entries);
        for (const s of d.assignedStaff ?? []) {
          // Z2: Dedupe pro (Mitarbeiter, Abteilung) — sonst verschwindet die
          // GL-Zeile eines Küchen-Primärmitarbeiters bei "Alle Standorte".
          if (
            !merged.assignedStaff!.some(
              (x) => x.staffId === s.staffId && x.department === s.department,
            )
          ) {
            merged.assignedStaff!.push(s);
          }
        }
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
    enabled: Boolean(effectiveLocationId) && !isAllLocations,
  });

  // Schichten (Periode) — standortübergreifend zählen: pro Standort Overview laden
  // und Kalender-Tage pro Mitarbeiter zu einem Set mergen (mehrere Einsätze am
  // selben Tag = 1 Schicht).
  const shiftCountQueries = useQueries({
    queries: locations.map((l) => ({
      queryKey: ["time-overview", l.id, fromDate, toDate],
      queryFn: () => fetchOverview({ data: { locationId: l.id, fromDate, toDate } }),
      enabled: Boolean(l.id) && Boolean(fromDate) && Boolean(toDate),
    })),
  });
  const shiftsByStaff = useMemo(() => {
    const days = new Map<string, Set<string>>();
    for (const q of shiftCountQueries) {
      const entries = (q.data as { entries?: Entry[] } | undefined)?.entries ?? [];
      for (const e of entries) {
        let set = days.get(e.staffId);
        if (!set) {
          set = new Set<string>();
          days.set(e.staffId, set);
        }
        set.add(e.businessDate);
      }
    }
    const counts = new Map<string, number>();
    for (const [staffId, set] of days) counts.set(staffId, set.size);
    return counts;
  }, [shiftCountQueries]);

  // Bei "Alle Standorte": Overview aus den bereits pro Standort geladenen
  // shiftCountQueries mergen (jeder time_entry hat genau einen Standort → keine
  // Duplikate). Bei Bereichs-Konflikt eines Mitarbeiters (z. B. an Standort A
  // Küche, an B Service) gewinnt in staffAggs unten das ERSTE Vorkommen in der
  // festen `locations`-Reihenfolge — die Person erscheint einmal mit der Summe.
  const overviewEntries = useMemo<Entry[]>(() => {
    if (isAllLocations) {
      const out: Entry[] = [];
      for (const q of shiftCountQueries) {
        const entries = (q.data as { entries?: Entry[] } | undefined)?.entries ?? [];
        out.push(...entries);
      }
      return out;
    }
    return overviewQ.data?.entries ?? [];
  }, [isAllLocations, shiftCountQueries, overviewQ.data]);
  const overviewLoading = isAllLocations
    ? shiftCountQueries.some((q) => q.isLoading)
    : overviewQ.isLoading;

  const notesQ = useQuery({
    queryKey: ["payroll-notes", effectiveLocationId, fromDate, toDate],
    queryFn: () =>
      fetchNotes({
        data: { locationId: effectiveLocationId, periodStart: fromDate, periodEnd: toDate },
      }),
    enabled: Boolean(effectiveLocationId) && !isAllLocations,
  });
  // Bei "Alle Standorte": Notes je Standort parallel laden.
  const notesAllQueries = useQueries({
    queries: isAllLocations
      ? locations.map((l) => ({
          queryKey: ["payroll-notes", l.id, fromDate, toDate],
          queryFn: () =>
            fetchNotes({ data: { locationId: l.id, periodStart: fromDate, periodEnd: toDate } }),
          enabled: Boolean(l.id) && Boolean(fromDate) && Boolean(toDate),
        }))
      : [],
  });

  const advancesQ = useQuery({
    queryKey: ["payroll-advances", fromDate, toDate],
    queryFn: () => fetchAdvances({ data: { periodStart: fromDate, periodEnd: toDate } }),
  });

  const absencesQ = useQuery({
    queryKey: ["payroll-absences", fromDate, toDate],
    queryFn: () => fetchAbsences({ data: { periodStart: fromDate, periodEnd: toDate } }),
  });

  const sfnQ = useQuery({
    queryKey: ["payroll-sfn", effectiveLocationId, fromDate, toDate],
    queryFn: () => fetchSfn({ data: { locationId: effectiveLocationId, fromDate, toDate } }),
    enabled: Boolean(effectiveLocationId) && !isAllLocations,
  });
  // Bei "Alle Standorte": SFN je Standort parallel laden.
  const sfnAllQueries = useQueries({
    queries: isAllLocations
      ? locations.map((l) => ({
          queryKey: ["payroll-sfn", l.id, fromDate, toDate],
          queryFn: () => fetchSfn({ data: { locationId: l.id, fromDate, toDate } }),
          enabled: Boolean(l.id) && Boolean(fromDate) && Boolean(toDate),
        }))
      : [],
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
    const entries: Entry[] = overviewEntries;
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
  }, [overviewEntries]);

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
    if (isAllLocations) {
      // Pro Standort mergen: Vorschüsse summieren, Besonderheiten mit Standort-
      // Präfix konkatenieren (z. B. "spicery: … · YUM: …").
      for (let i = 0; i < notesAllQueries.length; i++) {
        const loc = locations[i];
        const data = notesAllQueries[i]?.data as
          | Array<{ staffId: string; vorschuss: number; besonderheiten: string }>
          | undefined;
        if (!loc || !data) continue;
        for (const n of data) {
          const prev = m.get(n.staffId);
          const noteText = n.besonderheiten?.trim() ? `${loc.name}: ${n.besonderheiten}` : "";
          const merged = prev
            ? {
                vorschuss: prev.vorschuss + n.vorschuss,
                besonderheiten:
                  prev.besonderheiten && noteText
                    ? `${prev.besonderheiten} · ${noteText}`
                    : prev.besonderheiten || noteText,
              }
            : { vorschuss: n.vorschuss, besonderheiten: noteText };
          m.set(n.staffId, merged);
        }
      }
    } else {
      for (const n of notesQ.data ?? []) {
        m.set(n.staffId, { vorschuss: n.vorschuss, besonderheiten: n.besonderheiten });
      }
    }
    return m;
  }, [isAllLocations, notesQ.data, notesAllQueries, locations]);

  const advanceCentsByStaff = useMemo(() => {
    const m = new Map<string, number>();
    for (const a of advancesQ.data ?? []) m.set(a.staffId, a.totalCents);
    return m;
  }, [advancesQ.data]);

  const absencesByStaff = useMemo(() => {
    const m = new Map<string, { krankDays: number; urlaubDays: number; absenceNote: string }>();
    for (const a of absencesQ.data ?? []) {
      m.set(a.staffId, {
        krankDays: a.krankDays,
        urlaubDays: a.urlaubDays,
        absenceNote: a.absenceNote ?? "",
      });
    }
    return m;
  }, [absencesQ.data]);

  type SfnAgg = {
    simple: { night25Hours: number; night40Hours: number; sundayHours: number };
    extended: {
      night25Hours: number;
      night40Hours: number;
      sundayHours: number;
      holidayHours: number;
      holiday150Hours: number;
    };
    zuschlagCents: number;
  };
  const sfnByStaff = useMemo(() => {
    const m = new Map<string, SfnAgg>();
    const addOne = (s: {
      staffId: string;
      simple: SfnAgg["simple"];
      extended: SfnAgg["extended"];
      zuschlagCents: number;
    }) => {
      const prev = m.get(s.staffId);
      if (!prev) {
        m.set(s.staffId, {
          simple: { ...s.simple },
          extended: { ...s.extended },
          zuschlagCents: s.zuschlagCents,
        });
        return;
      }
      prev.simple.night25Hours += s.simple.night25Hours;
      prev.simple.night40Hours += s.simple.night40Hours;
      prev.simple.sundayHours += s.simple.sundayHours;
      prev.extended.night25Hours += s.extended.night25Hours;
      prev.extended.night40Hours += s.extended.night40Hours;
      prev.extended.sundayHours += s.extended.sundayHours;
      prev.extended.holidayHours += s.extended.holidayHours;
      prev.extended.holiday150Hours += s.extended.holiday150Hours;
      prev.zuschlagCents += s.zuschlagCents;
    };
    if (isAllLocations) {
      for (const q of sfnAllQueries) {
        const data = q.data as { sfn?: Array<Parameters<typeof addOne>[0]> } | undefined;
        for (const s of data?.sfn ?? []) addOne(s);
      }
    } else {
      for (const s of sfnQ.data?.sfn ?? []) addOne(s);
    }
    return m;
  }, [isAllLocations, sfnQ.data, sfnAllQueries]);

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

  function invalidateWeekly() {
    void qc.invalidateQueries({
      queryKey: ["weekly-entries", effectiveLocationId, weekStart],
    });
  }

  const setShiftMut = useMutation({
    mutationFn: (vars: {
      id: string;
      startedAt: string;
      endedAt: string;
      department?: Department | null;
    }) => callSetShift({ data: vars }),
    onSuccess: () => {
      invalidateWeekly();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // Z3 — alle Abteilungen der Person am Standort, gebündelt für Grid + Popover.
  const staffDeptsByStaff = useMemo(() => {
    const m = new Map<string, Department[]>();
    for (const s of weeklyData?.assignedStaff ?? []) {
      const arr = m.get(s.staffId) ?? [];
      const from = s.staffDepts ?? [s.department];
      for (const d of from) if (!arr.includes(d)) arr.push(d);
      m.set(s.staffId, arr);
    }
    return m;
  }, [weeklyData]);

  // Z4 — Skills-Stammdaten für den Filter.
  const skillsQ = useQuery({
    queryKey: ["skills-list"],
    queryFn: () => fetchSkills(),
  });
  const skills = useMemo(() => skillsQ.data ?? [], [skillsQ.data]);
  const skillsByStaffFilter = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const s of weeklyData?.assignedStaff ?? []) {
      if (m.has(s.staffId)) continue;
      m.set(s.staffId, s.skillIds ?? []);
    }
    return m;
  }, [weeklyData]);

  const createShiftMut = useMutation({
    mutationFn: (vars: {
      staffId: string;
      locationId: string;
      startedAt: string;
      endedAt: string;
      department?: Department | null;
    }) => callCreateShift({ data: vars }),
    onSuccess: () => {
      invalidateWeekly();
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
      isPrimary: boolean;
      byDate: Map<string, WeeklyEntry[]>;
      totals: { total: number; evening: number; night: number; sunHol: number };
      mismatched: boolean;
    };
    const rowKey = (staffId: string, dept: Department) => `${staffId}:${dept}`;
    const rowMap = new Map<string, AccRow>();
    // Z2/Z3 — Grundmenge: EINE Zeile pro (Mitarbeiter, Zuordnung). Alle
    // Zeilen sind ab Z3 voll editierbar; isPrimary bleibt nur für die
    // NULL-Attribution (Fallback auf Primär-Zeile) relevant.
    const staffDeptsByStaff = new Map<string, Department[]>();
    for (const s of data.assignedStaff ?? []) {
      const arr = staffDeptsByStaff.get(s.staffId) ?? s.staffDepts ?? [];
      staffDeptsByStaff.set(s.staffId, arr);
      const key = rowKey(s.staffId, s.department);
      if (rowMap.has(key)) continue;
      rowMap.set(key, {
        staffId: s.staffId,
        displayName: s.displayName,
        department: s.department,
        isPrimary: s.isPrimary ?? true,
        byDate: new Map(),
        totals: { total: 0, evening: 0, night: 0, sunHol: 0 },
        mismatched: false,
      });
    }
    for (const e of data.entries) {
      // Out-of-Period-Skip: Einträge außerhalb der gewählten Abrechnungs-
      // periode (Mo–So-Woche kann an Periodengrenzen überlappen) werden
      // weder in byDate noch in die Wochensummen aufgenommen.
      if (e.businessDate < fromDate || e.businessDate > toDate) continue;
      // Z3 — Attribution zentral über entryRowDepartment:
      //   - department != null & ∈ staffDepts → eigene Zeile
      //   - NULL → Primär-Zeile
      //   - department gesetzt, aber nicht mehr zugeordnet → Primär-Zeile
      //     + `mismatched` (Tooltip-Warnung)
      const staffDepts = staffDeptsByStaff.get(e.staffId) ?? [e.department];
      const attr = entryRowDepartment(e.rawDepartment ?? null, staffDepts);
      const key = rowKey(e.staffId, attr.department);
      let r = rowMap.get(key);
      if (!r) {
        r = {
          staffId: e.staffId,
          displayName: e.displayName,
          department: attr.department,
          isPrimary: true,
          byDate: new Map(),
          totals: { total: 0, evening: 0, night: 0, sunHol: 0 },
          mismatched: false,
        };
        rowMap.set(key, r);
      }
      if (attr.mismatched) r.mismatched = true;
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
      isPrimary: r.isPrimary,
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
          crossLocation: dayEntries.length === 0 && (cross[r.staffId] ?? []).includes(d.iso),
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
    fromDate,
    toDate,
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
  const handleExportPdf = async () => {
    if (!weeklyExportInput) return;
    try {
      const blob = await buildWeeklyPdf(weeklyExportInput);
      downloadBlob(blob, `${buildFileBaseName(weeklyExportInput)}.pdf`);
    } catch (e) {
      toast.error((e as Error).message || "PDF-Export fehlgeschlagen");
    }
  };

  // ============ Buchhaltung-Aggregation (Render + Export) ============
  const payrollRowsByStaff = useMemo(() => {
    const is3b = payrollMode === "section3b";
    const m = new Map<string, BuchhaltungExportRow & { staffId: string; department: Department }>();
    for (const s of staffAggs) {
      const sfn = sfnByStaff.get(s.staffId);
      const b = is3b ? sfn?.extended : sfn?.simple;
      const note = notesByStaff.get(s.staffId);
      const advCents = advanceCentsByStaff.get(s.staffId) ?? 0;
      const abs = absencesByStaff.get(s.staffId);
      m.set(s.staffId, {
        staffId: s.staffId,
        department: s.department,
        displayName: s.displayName,
        totalHours: s.totalHours,
        shifts: s.shiftDates.size,
        evening: b?.night25Hours ?? 0,
        night: b?.night40Hours ?? 0,
        sunHol: sfn?.simple.sundayHours ?? 0,
        sonntag: sfn?.extended.sundayHours ?? 0,
        feiertag: sfn?.extended.holidayHours ?? 0,
        feiertag150: sfn?.extended.holiday150Hours ?? 0,
        urlaubDays: abs?.urlaubDays ?? 0,
        krankDays: abs?.krankDays ?? 0,
        vorschussEUR: advCents / 100,
        besonderheiten: note?.besonderheiten ?? "",
        absenceNote: abs?.absenceNote ?? "",
      });
    }
    return m;
  }, [staffAggs, sfnByStaff, notesByStaff, advanceCentsByStaff, absencesByStaff, payrollMode]);

  const payrollSearchActive = payrollSearch.trim().length > 0;
  const payrollFilteredByDept = useMemo(() => {
    const q = payrollSearch.trim().toLowerCase();
    const m = new Map<Department, BuchhaltungExportRow[]>();
    for (const dept of DEPT_ORDER) m.set(dept, []);
    for (const row of payrollRowsByStaff.values()) {
      if (q !== "" && !row.displayName.toLowerCase().includes(q)) continue;
      const arr = m.get(row.department) ?? [];
      arr.push(row);
      m.set(row.department, arr);
    }
    return m;
  }, [payrollRowsByStaff, payrollSearch]);

  const payrollAllVisible = useMemo(() => {
    const out: BuchhaltungExportRow[] = [];
    for (const dept of DEPT_ORDER) {
      for (const r of payrollFilteredByDept.get(dept) ?? []) out.push(r);
    }
    return out;
  }, [payrollFilteredByDept]);

  const payrollTotals = useMemo(() => {
    const sum = (sel: (r: BuchhaltungExportRow) => number) =>
      payrollAllVisible.reduce((a, r) => a + sel(r), 0);
    return {
      totalHours: sum((r) => r.totalHours),
      shifts: sum((r) => r.shifts),
      evening: sum((r) => r.evening),
      night: sum((r) => r.night),
      sunHol: sum((r) => r.sunHol),
      sonntag: sum((r) => r.sonntag),
      feiertag: sum((r) => r.feiertag),
      feiertag150: sum((r) => r.feiertag150),
      urlaubDays: sum((r) => r.urlaubDays),
      krankDays: sum((r) => r.krankDays),
      vorschussEUR: sum((r) => r.vorschussEUR),
    };
  }, [payrollAllVisible]);

  const buchhaltungExportInput = useMemo<BuchhaltungExportInput>(() => {
    const locLabel = locations.find((l) => l.id === effectiveLocationId)?.name ?? "";
    const perLabel = selectedPeriod?.label ?? `${fromDate}_${toDate}`;
    return {
      locationLabel: locLabel,
      periodLabel: perLabel,
      rangeLabel: `${fmtDDMM(fromDate)}–${fmtDDMM(toDate)}`,
      mode: payrollMode,
      rowsByDept: DEPT_ORDER.map((dept) => ({
        dept,
        deptLabel: DEPT_HEADER_LABEL[dept],
        rows: payrollFilteredByDept.get(dept) ?? [],
      })),
    };
  }, [
    locations,
    effectiveLocationId,
    selectedPeriod,
    fromDate,
    toDate,
    payrollMode,
    payrollFilteredByDept,
  ]);

  const handlePayrollExportPdf = async () => {
    try {
      const blob = await buildBuchhaltungPdf(buchhaltungExportInput);
      downloadBlob(blob, `${buildBuchhaltungFileBase(buchhaltungExportInput)}.pdf`);
    } catch (e) {
      toast.error((e as Error).message || "PDF-Export fehlgeschlagen");
    }
  };
  const handlePayrollExportXlsx = async () => {
    try {
      const blob = await buildBuchhaltungXlsx(buchhaltungExportInput);
      downloadBlob(blob, `${buildBuchhaltungFileBase(buchhaltungExportInput)}.xlsx`);
    } catch (e) {
      toast.error((e as Error).message || "Excel-Export fehlgeschlagen");
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Arbeitszeiten</h1>
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
          <TabsTrigger value="lohnrechner">Brutto/Netto</TabsTrigger>
          <TabsTrigger value="provision">Provision</TabsTrigger>
        </TabsList>

        {(activeTab === "summary" || activeTab === "payroll" || activeTab === "provision") && (
          <Card className="my-3 p-3">
            <div className="flex flex-wrap items-end gap-3">
              <div className="space-y-1">
                <Label htmlFor="loc-zr">Standort</Label>
                <div id="loc-zr">
                  <LocationPills
                    locations={locations}
                    value={isAllLocations ? "all" : locationFilter || locations[0]?.id || ""}
                    onChange={setLocationFilter}
                    includeAll
                    allValue="all"
                  />
                </div>
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
                value={effectivePeriodId}
                onChange={(e) => {
                  const id = e.target.value;
                  setSelectedPeriodId(id);
                  const p = periods.find((x) => x.id === id);
                  if (p) setWeekStart(fmtIso(mondayOf(parseIsoDate(p.startDate))));
                }}
              >
                {periods.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label} ({ddmm(parseIsoDate(p.startDate))}–{ddmm(parseIsoDate(p.endDate))})
                    {p.status === "locked" ? " 🔒" : ""}
                  </option>
                ))}
              </select>
              <LocationPills
                locations={locations}
                value={isAllLocations ? "all" : locationFilter || locations[0]?.id || ""}
                onChange={setLocationFilter}
                includeAll
                allValue="all"
              />
              <div className="ml-auto flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={handleExportPdf}>
                  <FileDown className="mr-1 h-4 w-4" /> PDF
                </Button>
                <Button variant="outline" size="sm" onClick={handleExportXlsx}>
                  <FileSpreadsheet className="mr-1 h-4 w-4" /> Excel
                </Button>
              </div>
            </div>
            {/* Zeile 2: Suche */}
            <div className="relative max-w-xs">
              <Search className="pointer-events-none absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Mitarbeiter suchen…"
                className="h-9 pl-8"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            {/* Zeile 3: Wochen-Chips */}
            <div className="flex flex-wrap items-center gap-2">
              {periodWeeks.map((c) => {
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
                onClick={() => {
                  const today = todayIso();
                  const containing = periods.find(
                    (p) => p.startDate <= today && today <= p.endDate,
                  );
                  if (containing) setSelectedPeriodId(containing.id);
                  setWeekStart(fmtIso(mondayOf(parseIsoDate(today))));
                }}
                className="ml-auto h-8 rounded-md border border-input bg-background px-3 text-xs hover:bg-muted"
              >
                Heute
              </button>
            </div>
          </Card>
          <WeeklyPlan
            input={weeklyExportInput}
            isLoading={weeklyLoading}
            weekDays={weekDays}
            periodStart={fromDate}
            periodEnd={toDate}
            isAdmin={isAdmin}
            pending={setShiftMut.isPending || createShiftMut.isPending}
            onUpdateInline={(id, iso, from, to) => {
              const startedAt = buildIsoFromLocal(iso, from);
              const endedAt = buildIsoFromLocal(iso, to, from);
              setShiftMut.mutate({ id, startedAt, endedAt });
            }}
            onCreateInline={(staffId, iso, from, to, department) => {
              if (!effectiveLocationId) {
                toast.error("Bitte erst einen Standort wählen.");
                return;
              }
              const startedAt = buildIsoFromLocal(iso, from);
              const endedAt = buildIsoFromLocal(iso, to, from);
              createShiftMut.mutate({
                staffId,
                locationId: effectiveLocationId,
                startedAt,
                endedAt,
                department,
              });
            }}
            onReassign={(id, department) => {
              const entry = weeklyData?.entries.find((e) => e.id === id);
              if (!entry) return;
              setShiftMut.mutate({
                id,
                startedAt: entry.startedAt,
                endedAt: entry.endedAt,
                department,
              });
            }}
            staffDeptsByStaff={staffDeptsByStaff}
            entriesById={useMemo(() => {
              const m = new Map<string, WeeklyEntry>();
              for (const e of weeklyData?.entries ?? []) m.set(e.id, e);
              return m;
            }, [weeklyData])}
            shiftsByStaff={shiftsByStaff}
            absencesByStaff={absencesByStaff}
          />
        </TabsContent>

        <TabsContent value="lohnrechner">
          <LohnrechnerPanel />
        </TabsContent>

        <TabsContent value="provision">
          <ProvisionTab
            locationId={effectiveLocationId}
            locationLabel={locations.find((l) => l.id === effectiveLocationId)?.name ?? ""}
            isAllLocations={isAllLocations}
            periodStart={fromDate}
            periodEnd={toDate}
            isAdmin={isAdmin}
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
                  <TableHead className="text-right" title="Schichten in der Abrechnungsperiode">
                    S
                  </TableHead>
                  <TableHead className="text-right">U</TableHead>
                  <TableHead className="text-right">K</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {overviewLoading && (
                  <TableRow>
                    <TableCell
                      colSpan={5 + weekCols.length}
                      className="text-center text-muted-foreground"
                    >
                      <ZeitSkeleton />
                    </TableCell>
                  </TableRow>
                )}
                {!overviewLoading && staffAggs.length === 0 && (
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
                  let deptUrlaub = 0;
                  let deptKrank = 0;
                  for (const s of list) {
                    for (const [k, v] of s.perWeek) {
                      deptWeek.set(k, (deptWeek.get(k) ?? 0) + v);
                    }
                    deptTotal += s.totalHours;
                    deptShifts += s.shiftDates.size;
                    const abs = absencesByStaff.get(s.staffId);
                    deptUrlaub += abs?.urlaubDays ?? 0;
                    deptKrank += abs?.krankDays ?? 0;
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
                      {list.map((s) => {
                        const abs = absencesByStaff.get(s.staffId);
                        const u = abs?.urlaubDays ?? 0;
                        const k = abs?.krankDays ?? 0;
                        return (
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
                            <TableCell
                              className={`text-right tabular-nums ${u > 0 ? "" : "text-muted-foreground/50"}`}
                            >
                              {u > 0 ? u : "–"}
                            </TableCell>
                            <TableCell
                              className={`text-right tabular-nums ${k > 0 ? "" : "text-muted-foreground/50"}`}
                            >
                              {k > 0 ? k : "–"}
                            </TableCell>
                          </TableRow>
                        );
                      })}
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
                        <TableCell
                          className={`text-right tabular-nums ${deptUrlaub > 0 ? "" : "text-muted-foreground/50"}`}
                        >
                          {deptUrlaub > 0 ? deptUrlaub : "–"}
                        </TableCell>
                        <TableCell
                          className={`text-right tabular-nums ${deptKrank > 0 ? "" : "text-muted-foreground/50"}`}
                        >
                          {deptKrank > 0 ? deptKrank : "–"}
                        </TableCell>
                      </TableRow>
                    </Fragment>
                  );
                })}
                {staffAggs.length > 0 &&
                  (() => {
                    const totWeek = new Map<string, number>();
                    let tot = 0;
                    let totShifts = 0;
                    let totUrlaub = 0;
                    let totKrank = 0;
                    for (const s of staffAggs) {
                      for (const [k, v] of s.perWeek) {
                        totWeek.set(k, (totWeek.get(k) ?? 0) + v);
                      }
                      tot += s.totalHours;
                      totShifts += s.shiftDates.size;
                      const abs = absencesByStaff.get(s.staffId);
                      totUrlaub += abs?.urlaubDays ?? 0;
                      totKrank += abs?.krankDays ?? 0;
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
                        <TableCell
                          className={`text-right tabular-nums ${totUrlaub > 0 ? "" : "text-muted-foreground/50"}`}
                        >
                          {totUrlaub > 0 ? totUrlaub : "–"}
                        </TableCell>
                        <TableCell
                          className={`text-right tabular-nums ${totKrank > 0 ? "" : "text-muted-foreground/50"}`}
                        >
                          {totKrank > 0 ? totKrank : "–"}
                        </TableCell>
                      </TableRow>
                    );
                  })()}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>

        <TabsContent value="payroll">
          <PayrollTab
            mode={payrollMode}
            onModeChange={setPayrollMode}
            search={payrollSearch}
            onSearchChange={setPayrollSearch}
            searchActive={payrollSearchActive}
            rowsByDept={payrollFilteredByDept}
            staffRows={payrollRowsByStaff}
            totals={payrollTotals}
            readOnly={isPayroll}
            onSaveNote={(staffId, besonderheiten) =>
              upsertMut.mutate({
                staffId,
                vorschuss: 0,
                besonderheiten: besonderheiten.trim() === "" ? null : besonderheiten,
              })
            }
            onExportPdf={handlePayrollExportPdf}
            onExportXlsx={handlePayrollExportXlsx}
          />
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

      {isAdmin && !isAllLocations && effectiveLocationId && fromDate && toDate && (
        <BatchTimesCard
          locationId={effectiveLocationId}
          periodStart={fromDate}
          periodEnd={toDate}
          periodLabel={selectedPeriod?.label ?? `${fromDate} – ${toDate}`}
        />
      )}
    </div>
  );
}

function PayrollTab({
  mode,
  onModeChange,
  search,
  onSearchChange,
  searchActive,
  rowsByDept,
  staffRows,
  totals,
  readOnly,
  onSaveNote,
  onExportPdf,
  onExportXlsx,
}: {
  mode: BuchhaltungMode;
  onModeChange: (m: BuchhaltungMode) => void;
  search: string;
  onSearchChange: (s: string) => void;
  searchActive: boolean;
  rowsByDept: Map<Department, BuchhaltungExportRow[]>;
  staffRows: Map<string, BuchhaltungExportRow & { staffId: string; department: Department }>;
  totals: {
    totalHours: number;
    shifts: number;
    evening: number;
    night: number;
    sunHol: number;
    sonntag: number;
    feiertag: number;
    feiertag150: number;
    urlaubDays: number;
    krankDays: number;
    vorschussEUR: number;
  };
  readOnly: boolean;
  onSaveNote: (staffId: string, besonderheiten: string) => void;
  onExportPdf: () => void;
  onExportXlsx: () => void;
}) {
  const is3b = mode === "section3b";
  // Spaltenanzahl für colSpan: Name + Gesamt + Schichten + (3 SFN | 5 §3b) + U + K + Vorschuss + Besonderheiten
  const sfnCols = is3b ? 5 : 3;
  const colSpan = 3 + sfnCols + 4;
  const anyRows = Array.from(rowsByDept.values()).some((arr) => arr.length > 0);

  return (
    <div className="space-y-3">
      <Card className="p-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="inline-flex rounded-md border border-input bg-background p-1">
            <button
              type="button"
              onClick={() => onModeChange("simple")}
              className={`h-7 rounded px-3 text-sm transition ${
                !is3b ? "bg-primary text-primary-foreground" : "text-foreground hover:bg-muted"
              }`}
            >
              Einfach
            </button>
            <button
              type="button"
              onClick={() => onModeChange("section3b")}
              className={`h-7 rounded px-3 text-sm transition ${
                is3b ? "bg-primary text-primary-foreground" : "text-foreground hover:bg-muted"
              }`}
            >
              §3b
            </button>
          </div>
          <span className="text-xs text-muted-foreground">
            {is3b
              ? "§3b: Sonntag, Feiertag (125 %) und Feiertag 150 % (1. Mai, 25./26. 12.) getrennt ausgewiesen."
              : "Einfach: 20–24 (Abend), 24–X (Nacht) und SO/FEI als Summe."}
          </span>
          <div className="ml-auto flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={onExportPdf}>
              <FileDown className="mr-1 h-4 w-4" /> PDF
            </Button>
            <Button variant="outline" size="sm" onClick={onExportXlsx}>
              <FileSpreadsheet className="mr-1 h-4 w-4" /> Excel
            </Button>
          </div>
        </div>
        <div className="relative mt-3 max-w-xs">
          <Search className="pointer-events-none absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Mitarbeiter suchen…"
            className="h-9 pl-8"
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
          />
        </div>
      </Card>

      <Card className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="h-9 text-xs uppercase tracking-wider text-muted-foreground">
                Mitarbeiter
              </TableHead>
              <TableHead className="h-9 text-xs uppercase tracking-wider text-muted-foreground text-right w-24">
                Gesamt
              </TableHead>
              <TableHead
                className="h-9 text-xs uppercase tracking-wider text-muted-foreground text-right w-20"
                title="Abendstunden 20–24 Uhr"
              >
                20–24
              </TableHead>
              <TableHead
                className="h-9 text-xs uppercase tracking-wider text-muted-foreground text-right w-20"
                title="Nachtstunden ab 24 Uhr"
              >
                24–X
              </TableHead>
              {!is3b && (
                <TableHead
                  className="h-9 text-xs uppercase tracking-wider text-muted-foreground text-right w-20"
                  title="Sonntag + Feiertag zusammen"
                >
                  SO/FEI
                </TableHead>
              )}
              {is3b && (
                <>
                  <TableHead
                    className="h-9 text-xs uppercase tracking-wider text-muted-foreground text-right w-20"
                    title="Stunden an Sonntagen"
                  >
                    Sonntag
                  </TableHead>
                  <TableHead
                    className="h-9 text-xs uppercase tracking-wider text-muted-foreground text-right w-20"
                    title="Feiertag 125 %"
                  >
                    Feiertag
                  </TableHead>
                  <TableHead
                    className="h-9 text-xs uppercase tracking-wider text-muted-foreground text-right w-24"
                    title="Feiertag 150 % (1. Mai, 25./26. 12.)"
                  >
                    Feiertag 150 %
                  </TableHead>
                </>
              )}
              <TableHead
                className="h-9 text-xs uppercase tracking-wider text-muted-foreground text-right w-16"
                title="Schichten in der Abrechnungsperiode"
              >
                S
              </TableHead>
              <TableHead className="h-9 text-xs uppercase tracking-wider text-muted-foreground text-right w-12">
                U
              </TableHead>
              <TableHead className="h-9 text-xs uppercase tracking-wider text-muted-foreground text-right w-12">
                K
              </TableHead>
              <TableHead className="h-9 text-xs uppercase tracking-wider text-muted-foreground text-right w-28">
                Vorschuss
              </TableHead>
              <TableHead className="h-9 text-xs uppercase tracking-wider text-muted-foreground">
                Besonderheiten
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {!anyRows && (
              <TableRow>
                <TableCell colSpan={colSpan} className="text-center text-muted-foreground">
                  Keine Einträge im Zeitraum.
                </TableCell>
              </TableRow>
            )}
            {DEPT_ORDER.map((dept) => {
              const list = rowsByDept.get(dept) ?? [];
              if (list.length === 0) return null;
              return (
                <Fragment key={`p-grp-${dept}`}>
                  {!searchActive && (
                    <TableRow className={`${DEPT_BG[dept]} hover:${DEPT_BG[dept]}`}>
                      <TableCell
                        colSpan={colSpan}
                        className="py-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground"
                      >
                        {DEPT_LABEL[dept]}
                      </TableCell>
                    </TableRow>
                  )}
                  {list.map((r) => {
                    const full = staffRows.get(
                      (r as BuchhaltungExportRow & { staffId: string }).staffId,
                    );
                    const staffId = full?.staffId ?? "";
                    return (
                      <PayrollRow
                        key={staffId}
                        row={r}
                        is3b={is3b}
                        readOnly={readOnly}
                        onSave={(b) => onSaveNote(staffId, b)}
                      />
                    );
                  })}
                </Fragment>
              );
            })}
            {anyRows && (
              <TableRow className="bg-muted/50 font-medium">
                <TableCell className="py-1.5">Summe</TableCell>
                <TableCell className="py-1.5 text-right tabular-nums">
                  {fmtHm(totals.totalHours)}
                </TableCell>
                <TableCell className="py-1.5 text-right tabular-nums">
                  {fmtDec(totals.evening)}
                </TableCell>
                <TableCell className="py-1.5 text-right tabular-nums">
                  {fmtDec(totals.night)}
                </TableCell>
                {!is3b && (
                  <TableCell className="py-1.5 text-right tabular-nums">
                    {fmtDec(totals.sunHol)}
                  </TableCell>
                )}
                {is3b && (
                  <>
                    <TableCell className="py-1.5 text-right tabular-nums">
                      {fmtDec(totals.sonntag)}
                    </TableCell>
                    <TableCell className="py-1.5 text-right tabular-nums">
                      {fmtDec(totals.feiertag)}
                    </TableCell>
                    <TableCell className="py-1.5 text-right tabular-nums">
                      {fmtDec(totals.feiertag150)}
                    </TableCell>
                  </>
                )}
                <TableCell className="py-1.5 text-right tabular-nums">{totals.shifts}</TableCell>
                <TableCell className="py-1.5 text-right tabular-nums">
                  {totals.urlaubDays > 0 ? totals.urlaubDays : "–"}
                </TableCell>
                <TableCell className="py-1.5 text-right tabular-nums">
                  {totals.krankDays > 0 ? totals.krankDays : "–"}
                </TableCell>
                <TableCell className="py-1.5 text-right tabular-nums">
                  {totals.vorschussEUR > 0
                    ? totals.vorschussEUR.toLocaleString("de-DE", {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })
                    : "–"}
                </TableCell>
                <TableCell className="py-1.5" />
              </TableRow>
            )}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}

function PayrollRow({
  row,
  is3b,
  readOnly,
  onSave,
}: {
  row: BuchhaltungExportRow;
  is3b: boolean;
  readOnly: boolean;
  onSave: (besonderheiten: string) => void;
}) {
  const [besonderheiten, setBesonderheiten] = useState<string>(row.besonderheiten ?? "");
  const vorschussLabel =
    row.vorschussEUR > 0
      ? row.vorschussEUR.toLocaleString("de-DE", {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        })
      : null;
  const numCell = (v: number) =>
    v > 0 ? (
      <span className="tabular-nums">{fmtDec(v)}</span>
    ) : (
      <span className="tabular-nums text-muted-foreground/50">–</span>
    );
  return (
    <TableRow className="group">
      <TableCell className="py-1.5 font-medium">{row.displayName}</TableCell>
      <TableCell className="py-1.5 text-right tabular-nums font-medium">
        {fmtHm(row.totalHours)}
      </TableCell>
      <TableCell className="py-1.5 text-right">{numCell(row.evening)}</TableCell>
      <TableCell className="py-1.5 text-right">{numCell(row.night)}</TableCell>
      {!is3b && <TableCell className="py-1.5 text-right">{numCell(row.sunHol)}</TableCell>}
      {is3b && (
        <>
          <TableCell className="py-1.5 text-right">{numCell(row.sonntag)}</TableCell>
          <TableCell className="py-1.5 text-right">{numCell(row.feiertag)}</TableCell>
          <TableCell className="py-1.5 text-right">{numCell(row.feiertag150)}</TableCell>
        </>
      )}
      <TableCell className="py-1.5 text-right tabular-nums text-muted-foreground">
        {row.shifts}
      </TableCell>
      <TableCell
        className={`py-1.5 text-right tabular-nums ${
          row.urlaubDays > 0 ? "font-medium" : "text-muted-foreground/50"
        }`}
      >
        {row.urlaubDays > 0 ? row.urlaubDays : "–"}
      </TableCell>
      <TableCell
        className={`py-1.5 text-right tabular-nums ${
          row.krankDays > 0 ? "font-medium" : "text-muted-foreground/50"
        }`}
      >
        {row.krankDays > 0 ? row.krankDays : "–"}
      </TableCell>
      <TableCell
        className={`py-1.5 text-right tabular-nums text-sm ${
          vorschussLabel ? "font-medium" : "text-muted-foreground/50"
        }`}
      >
        {vorschussLabel ?? "–"}
      </TableCell>
      <TableCell className="py-1.5">
        {row.absenceNote ? (
          <div
            className="mb-1 flex items-start gap-1 text-xs text-muted-foreground"
            title="Automatisch aus Urlaub/Krank — Korrekturen dort vornehmen."
          >
            <CalendarDays className="mt-0.5 h-3 w-3 shrink-0" aria-hidden />
            <span className="leading-tight">{row.absenceNote}</span>
          </div>
        ) : null}
        <Textarea
          rows={1}
          placeholder="–"
          className="min-h-7 h-7 py-1 resize-none text-sm border-transparent bg-transparent hover:border-input focus:border-input focus:bg-background focus:min-h-16 transition-all placeholder:text-muted-foreground/40"
          readOnly={readOnly}
          disabled={readOnly}
          value={besonderheiten}
          onChange={(e) => setBesonderheiten(e.target.value)}
          onBlur={() => {
            if (readOnly) return;
            const prev = row.besonderheiten ?? "";
            if (besonderheiten !== prev) onSave(besonderheiten);
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
  // Z3 — Roh-Abteilung des Eintrags (NULL = unbestimmt/Bestandsdaten).
  rawDepartment?: Department | null;
  businessDate: string;
  startedAt: string;
  endedAt: string;
};

type WeeklyData = {
  weekStart: string;
  weekEnd: string;
  entries: WeeklyEntry[];
  crossLocationDates: Record<string, string[]>;
  assignedStaff?: {
    staffId: string;
    displayName: string;
    department: Department;
    isActive: boolean;
    isPrimary?: boolean;
    // Z3 — alle Abteilungen der Person am Standort (Attribution im Grid).
    staffDepts?: Department[];
  }[];
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
  entriesById,
  pending,
  onUpdateInline,
  onCreateInline,
  onReassign,
  staffDeptsByStaff,
  periodStart,
  periodEnd,
  shiftsByStaff,
  absencesByStaff,
}: {
  input: WeeklyExportInput | null;
  isLoading: boolean;
  weekDays: Date[];
  isAdmin: boolean;
  entriesById: Map<string, WeeklyEntry>;
  pending: boolean;
  onUpdateInline: (id: string, iso: string, from: string, to: string) => void;
  onCreateInline: (
    staffId: string,
    iso: string,
    from: string,
    to: string,
    department: Department,
  ) => void;
  // Z3 — Abteilung eines bestehenden Eintrags umhängen.
  onReassign: (id: string, department: Department | null) => void;
  staffDeptsByStaff: Map<string, Department[]>;
  periodStart?: string;
  periodEnd?: string;
  shiftsByStaff: Map<string, number>;
  absencesByStaff: Map<string, { krankDays: number; urlaubDays: number; absenceNote?: string }>;
}) {
  // Header-Tagesmeta (Wochentag-Label + Feiertags-Hint)
  const dayMeta = weekDays.map((d) => {
    const iso = fmtIso(d);
    return {
      date: d,
      iso,
      isSun: d.getUTCDay() === 0,
      isHol: isBavarianHoliday(d),
      isSunOrHol: isSundayOrHoliday(d),
      holidayName: bavarianHolidayName(d),
      outOfPeriod: periodStart && periodEnd ? iso < periodStart || iso > periodEnd : false,
    };
  });

  // Spalten: Mitarbeiter (links) + 7 Tage × (Anf. | Ende)
  // + Mitarbeiter (rechts) + 4 Zeit-Summen + S + U + K
  const totalCols = 1 + 7 * 2 + 1 + 4 + 3;

  const groups = useMemo(() => input?.rowsByDept ?? [], [input?.rowsByDept]);
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

  type EditState = {
    staffId: string;
    iso: string;
    field: "from" | "to";
    from: string;
    to: string;
    existingId: string | null;
    origFrom: string;
    origTo: string;
    // Z3 — Abteilung der Zeile (für Create-Pfad; Updates lassen die Spalte
    // unverändert, damit ein Time-Edit keinen Umhänge-Effekt hat).
    department: Department;
  };
  const [edit, setEdit] = useState<EditState | null>(null);
  const editStaffId = edit?.staffId;
  const editIso = edit?.iso;
  const editField = edit?.field;
  const inputRef = useRef<HTMLInputElement | null>(null);
  const navigatingRef = useRef(false);
  const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

  // Fokus + Selektion nur, wenn eine NEUE Zielzelle aktiv wird
  // (nicht bei jedem Tastenanschlag → kein Cursor-Flackern).
  useEffect(() => {
    if (!editStaffId) return;
    const el = inputRef.current;
    if (!el) return;
    el.focus();
    el.select();
  }, [editStaffId, editIso, editField]);

  // Akzeptiert freie Ziffern-Eingaben und normalisiert zu HH:MM.
  // Beispiele: "1530" → "15:30", "930" → "09:30", "9" → "09:00",
  // "15:3" → "15:03", "15.30" → "15:30". Ungültig → null.
  const parseHHMM = (raw: string): string | null => {
    const s = raw.trim().replace(/[.\-\s]/g, ":");
    let h: string;
    let m: string;
    if (s.includes(":")) {
      const [hp, mp = ""] = s.split(":");
      if (!/^\d{1,2}$/.test(hp) || !/^\d{1,2}$/.test(mp)) return null;
      h = hp.padStart(2, "0");
      m = mp.padStart(2, "0");
    } else {
      if (!/^\d+$/.test(s)) return null;
      if (s.length <= 2) {
        h = s.padStart(2, "0");
        m = "00";
      } else if (s.length === 3) {
        h = s.slice(0, 1).padStart(2, "0");
        m = s.slice(1);
      } else if (s.length === 4) {
        h = s.slice(0, 2);
        m = s.slice(2);
      } else {
        return null;
      }
    }
    const out = `${h}:${m}`;
    return HHMM.test(out) ? out : null;
  };

  const startEdit = (
    staffId: string,
    iso: string,
    field: "from" | "to",
    department: Department,
  ) => {
    if (!isAdmin) return;
    const found = findEntries(staffId, iso);
    if (found.length > 1) return;
    if (found.length === 1) {
      const f = fmtHHMM(found[0].startedAt);
      const t = fmtHHMM(found[0].endedAt);
      setEdit({
        staffId,
        iso,
        field,
        from: f,
        to: t,
        existingId: found[0].id,
        origFrom: f,
        origTo: t,
        department,
      });
    } else {
      setEdit({
        staffId,
        iso,
        field,
        from: "15:00",
        to: "23:00",
        existingId: null,
        origFrom: "",
        origTo: "",
        department,
      });
    }
  };

  const cellKey = (staffId: string, iso: string) => `${staffId}|${iso}`;

  const commit = (e: EditState) => {
    const from = parseHHMM(e.from);
    const to = parseHHMM(e.to);
    if (!from || !to) {
      toast.error("Ungültige Uhrzeit.");
      return false;
    }
    if (e.existingId) {
      if (from === e.origFrom && to === e.origTo) return true;
      onUpdateInline(e.existingId, e.iso, from, to);
    } else {
      onCreateInline(e.staffId, e.iso, from, to, e.department);
    }
    return true;
  };

  const handleBlur = (ev: React.FocusEvent<HTMLInputElement>, current: EditState) => {
    if (navigatingRef.current) {
      navigatingRef.current = false;
      return;
    }
    const next = ev.relatedTarget as HTMLElement | null;
    const nextKey = next?.getAttribute?.("data-edit-key");
    if (nextKey === cellKey(current.staffId, current.iso)) return;
    commit(current);
    setEdit((cur) =>
      cur &&
      cur.staffId === current.staffId &&
      cur.iso === current.iso &&
      cur.field === current.field
        ? null
        : cur,
    );
  };

  // Flache Liste aller sichtbaren Mitarbeiter-Zeilen (für Tab/Pfeil-Navigation).
  const flatRows = useMemo(() => groups.flatMap((g) => g.rows), [groups]);
  const isCellEditable = (row: (typeof flatRows)[number] | undefined, dayIdx: number): boolean => {
    if (!row || !isAdmin) return false;
    // Z3 — alle Zeilen editierbar. Neu erstellte Einträge tragen die
    // Abteilung ihrer Zeile und bleiben nach dem Refetch dort.
    const dm = dayMeta[dayIdx];
    if (!dm || dm.outOfPeriod) return false;
    const day = row.days[dayIdx];
    if (!day || day.shifts.length > 1) return false;
    return true;
  };

  // Nächste editierbare Zelle in einer der beiden Richtungen.
  const findNextRow = (
    rowIdx: number,
    dayIdx: number,
    dir: 1 | -1,
  ): { rowIdx: number; dayIdx: number } | null => {
    let r = rowIdx + dir;
    while (r >= 0 && r < flatRows.length) {
      if (isCellEditable(flatRows[r], dayIdx)) return { rowIdx: r, dayIdx };
      r += dir;
    }
    return null;
  };

  // Nächste editierbare Zelle in Leserichtung über Tag/Feld-Grenzen hinweg.
  const findNextField = (
    rowIdx: number,
    dayIdx: number,
    field: "from" | "to",
    dir: 1 | -1,
  ): { rowIdx: number; dayIdx: number; field: "from" | "to" } | null => {
    let d = dayIdx;
    let f: "from" | "to" = field;
    for (let guard = 0; guard < 20; guard++) {
      if (dir === 1) {
        if (f === "from") f = "to";
        else {
          f = "from";
          d += 1;
        }
      } else {
        if (f === "to") f = "from";
        else {
          f = "to";
          d -= 1;
        }
      }
      if (d < 0 || d >= dayMeta.length) return null;
      if (isCellEditable(flatRows[rowIdx], d)) return { rowIdx, dayIdx: d, field: f };
    }
    return null;
  };

  // Wechselt die aktive Edit-Zelle. Committed die aktuelle, wenn wir das Feld/die Zelle verlassen.
  const navigateTo = (
    current: EditState,
    nextStaffId: string,
    nextIso: string,
    nextField: "from" | "to",
    nextDepartment: Department = current.department,
  ) => {
    const sameCell = nextStaffId === current.staffId && nextIso === current.iso;
    if (!sameCell) {
      if (!commit(current)) return; // ungültig → abbrechen, Zelle bleibt offen
    }
    navigatingRef.current = true;
    if (sameCell) {
      setEdit({ ...current, field: nextField });
    } else {
      startEdit(nextStaffId, nextIso, nextField, nextDepartment);
    }
  };

  return (
    <Card className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead
              rowSpan={2}
              className="w-[68px] min-w-[68px] px-1 align-middle text-center text-xs"
            />
            {dayMeta.map((dm) => (
              <TableHead
                key={dm.iso}
                colSpan={2}
                className={`text-center whitespace-nowrap border-l ${
                  dm.outOfPeriod
                    ? "bg-muted/40 text-muted-foreground/60"
                    : dm.isHol
                      ? "bg-yellow-50"
                      : dm.isSun
                        ? "bg-gray-100"
                        : ""
                }`}
              >
                {dayHeader(dm.date)}
                {dm.holidayName && (
                  <span className="block text-[10px] font-normal text-muted-foreground">
                    {dm.holidayName}
                  </span>
                )}
              </TableHead>
            ))}
            <TableHead
              rowSpan={2}
              className="w-[68px] min-w-[68px] px-1 align-middle border-l text-center text-xs"
            />
            <TableHead
              rowSpan={2}
              className="px-1 text-right text-xs align-middle whitespace-nowrap"
            >
              Ges
            </TableHead>
            <TableHead
              rowSpan={2}
              className="px-1 text-right text-xs align-middle whitespace-nowrap"
            >
              20–24
            </TableHead>
            <TableHead
              rowSpan={2}
              className="px-1 text-right text-xs align-middle whitespace-nowrap"
            >
              24–x
            </TableHead>
            <TableHead
              rowSpan={2}
              className="px-1 text-right text-xs align-middle whitespace-nowrap"
            >
              <span title="Sonntag/Feiertag">SF</span>
            </TableHead>
            <TableHead
              rowSpan={2}
              className="px-1 text-right text-xs align-middle whitespace-nowrap"
              title="Schichten in der Abrechnungsperiode"
            >
              S
            </TableHead>
            <TableHead
              rowSpan={2}
              className="px-1 text-right text-xs align-middle whitespace-nowrap"
              title="Urlaubstage in der Abrechnungsperiode"
            >
              U
            </TableHead>
            <TableHead
              rowSpan={2}
              className="px-1 text-right text-xs align-middle whitespace-nowrap"
              title="Kranktage in der Abrechnungsperiode"
            >
              K
            </TableHead>
          </TableRow>
          <TableRow>
            {dayMeta.map((dm) => {
              const bg = dm.outOfPeriod
                ? "bg-muted/40 text-muted-foreground/60"
                : dm.isHol
                  ? "bg-yellow-50"
                  : dm.isSun
                    ? "bg-gray-100"
                    : "";
              return (
                <Fragment key={`sub-${dm.iso}`}>
                  <TableHead
                    className={`w-[62px] min-w-[62px] border-l text-center text-[11px] font-normal ${bg}`}
                  >
                    Anf.
                  </TableHead>
                  <TableHead
                    className={`w-[62px] min-w-[62px] text-center text-[11px] font-normal ${bg}`}
                  >
                    Ende
                  </TableHead>
                </Fragment>
              );
            })}
          </TableRow>
        </TableHeader>
        <TableBody>
          {isLoading && (
            <TableRow>
              <TableCell colSpan={totalCols} className="text-center text-muted-foreground">
                <ZeitSkeleton />
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
                {grp.rows.map((row) => {
                  // Z3 — Warnung, wenn ein Eintrag eine Abteilung trägt, die
                  // der Person am Standort nicht (mehr) zugeordnet ist. Er
                  // erscheint dann auf der Primär-Zeile.
                  const mismatchedTitle = (row as { mismatched?: boolean }).mismatched
                    ? "Achtung: mindestens ein Eintrag trägt eine Abteilung, die der Person am Standort nicht zugeordnet ist — er wird hier auf der Primär-Zeile angezeigt."
                    : undefined;
                  return (
                    <TableRow key={`${row.staffId}:${row.department}`}>
                      <TableCell className="group relative px-1 font-medium align-middle text-center text-xs w-[68px] min-w-[68px] max-w-[68px]">
                        <span
                          className={`absolute left-0 top-0 bottom-0 w-[2px] ${DEPT_BAR[row.department]}`}
                        />
                        <span
                          className="block truncate"
                          title={mismatchedTitle ?? row.displayName}
                        >
                          {row.displayName}
                          {mismatchedTitle ? (
                            <span className="ml-0.5 text-amber-600">⚠</span>
                          ) : null}
                        </span>
                        {isAdmin && (staffDeptsByStaff.get(row.staffId)?.length ?? 0) > 1 ? (
                          <ReassignPopover
                            row={row}
                            entriesById={entriesById}
                            onReassign={onReassign}
                            pending={pending}
                            staffDeptsByStaff={staffDeptsByStaff}
                          />
                        ) : null}
                      </TableCell>
                      {row.days.map((day, idx) => {
                        const dm = dayMeta[idx];
                        const cellBg = dm.outOfPeriod
                          ? "bg-muted/40"
                          : dm.isHol
                            ? "bg-yellow-50"
                            : dm.isSun
                              ? "bg-gray-50"
                              : "";
                        const empty = day.shifts.length === 0;
                        // Z3 — alle Zeilen sind editierbar; das Grid attribuiert
                        // Einträge über entryRowDepartment.
                        const clickable = isAdmin && !dm.outOfPeriod;
                        const multi = day.shifts.length > 1;
                        const isEditingCell =
                          edit !== null && edit.staffId === row.staffId && edit.iso === day.iso;
                        const editable = clickable && !multi;
                        const handleCellClick = (which: "from" | "to") => {
                          if (!editable) return;
                          if (isEditingCell) return;
                          startEdit(row.staffId, day.iso, which, row.department);
                        };
                        const renderShift = (which: "from" | "to") => {
                          if (isEditingCell && edit.field === which) {
                            const val = which === "from" ? edit.from : edit.to;
                            return (
                              <input
                                type="text"
                                inputMode="numeric"
                                maxLength={5}
                                value={val}
                                disabled={pending}
                                data-edit-key={cellKey(row.staffId, day.iso)}
                                ref={inputRef}
                                onChange={(ev) =>
                                  setEdit({
                                    ...edit,
                                    [which]: ev.target.value,
                                  } as EditState)
                                }
                                onKeyDown={(ev) => {
                                  if (ev.key === "Enter") {
                                    ev.preventDefault();
                                    if (commit(edit)) setEdit(null);
                                    return;
                                  }
                                  if (ev.key === "Escape") {
                                    ev.preventDefault();
                                    navigatingRef.current = true;
                                    setEdit(null);
                                    return;
                                  }
                                  const rIdx = flatRows.findIndex(
                                    (r) => r.staffId === edit.staffId,
                                  );
                                  const dIdx = dayMeta.findIndex((d) => d.iso === edit.iso);
                                  if (rIdx < 0 || dIdx < 0) return;
                                  if (ev.key === "Tab") {
                                    ev.preventDefault();
                                    const t = findNextRow(rIdx, dIdx, ev.shiftKey ? -1 : 1);
                                    if (t)
                                      navigateTo(
                                        edit,
                                        flatRows[t.rowIdx].staffId,
                                        dayMeta[t.dayIdx].iso,
                                        edit.field,
                                        flatRows[t.rowIdx].department,
                                      );
                                    return;
                                  }
                                  if (ev.key === "ArrowDown" || ev.key === "ArrowUp") {
                                    ev.preventDefault();
                                    const t = findNextRow(
                                      rIdx,
                                      dIdx,
                                      ev.key === "ArrowDown" ? 1 : -1,
                                    );
                                    if (t)
                                      navigateTo(
                                        edit,
                                        flatRows[t.rowIdx].staffId,
                                        dayMeta[t.dayIdx].iso,
                                        edit.field,
                                        flatRows[t.rowIdx].department,
                                      );
                                    return;
                                  }
                                  if (ev.key === "ArrowRight" || ev.key === "ArrowLeft") {
                                    ev.preventDefault();
                                    const t = findNextField(
                                      rIdx,
                                      dIdx,
                                      edit.field,
                                      ev.key === "ArrowRight" ? 1 : -1,
                                    );
                                    if (t)
                                      navigateTo(
                                        edit,
                                        flatRows[t.rowIdx].staffId,
                                        dayMeta[t.dayIdx].iso,
                                        t.field,
                                      );
                                    return;
                                  }
                                }}
                                onBlur={(ev) => handleBlur(ev, edit)}
                                className={`block w-full h-6 min-w-0 px-0 text-center tabular-nums text-sm rounded border border-primary/50 bg-background box-border ${pending ? "opacity-60" : ""}`}
                              />
                            );
                          }
                          if (isEditingCell) {
                            const val = which === "from" ? edit.from : edit.to;
                            return <span className="tabular-nums">{val}</span>;
                          }
                          if (empty) {
                            if (day.crossLocation && which === "from" && !dm.outOfPeriod)
                              return <span className="text-muted-foreground">×</span>;
                            if (editable && which === "from")
                              return <span className="text-muted-foreground/40">+</span>;
                            return "";
                          }
                          return (
                            <div className="flex flex-col divide-y divide-border/60">
                              {day.shifts.map((s, i) => (
                                <span key={i} className="tabular-nums">
                                  {s[which]}
                                </span>
                              ))}
                            </div>
                          );
                        };
                        return (
                          <Fragment key={day.iso}>
                            <TableCell
                              onClick={() => handleCellClick("from")}
                              title={mismatchedTitle}
                              className={`w-[62px] min-w-[62px] border-l px-1 py-1 text-center align-middle tabular-nums text-sm ${cellBg} ${editable ? "cursor-pointer hover:bg-muted/60" : ""}`}
                            >
                              {renderShift("from")}
                            </TableCell>
                            <TableCell
                              onClick={() => handleCellClick("to")}
                              title={mismatchedTitle}
                              className={`w-[62px] min-w-[62px] px-1 py-1 text-center align-middle tabular-nums text-sm ${cellBg} ${editable ? "cursor-pointer hover:bg-muted/60" : ""}`}
                            >
                              {renderShift("to")}
                            </TableCell>
                          </Fragment>
                        );
                      })}
                      <TableCell className="font-medium align-middle border-l text-center text-xs px-1 w-[68px] min-w-[68px] max-w-[68px]">
                        <span className="block truncate" title={row.displayName}>
                          {row.displayName}
                        </span>
                      </TableCell>
                      <TableCell className="px-1 text-xs text-right tabular-nums font-medium">
                        {fmtDec(row.totals.total)}
                      </TableCell>
                      <TableCell className="px-1 text-xs text-right tabular-nums">
                        {fmtDec(row.totals.evening)}
                      </TableCell>
                      <TableCell className="px-1 text-xs text-right tabular-nums">
                        {fmtDec(row.totals.night)}
                      </TableCell>
                      <TableCell className="px-1 text-xs text-right tabular-nums">
                        {fmtDec(row.totals.sunHol)}
                      </TableCell>
                      <TableCell className="px-1 text-xs text-right tabular-nums">
                        {shiftsByStaff.get(row.staffId) ?? 0}
                      </TableCell>
                      {(() => {
                        const abs = absencesByStaff.get(row.staffId);
                        const u = abs?.urlaubDays ?? 0;
                        const k = abs?.krankDays ?? 0;
                        return (
                          <>
                            <TableCell
                              className={`px-1 text-xs text-right tabular-nums ${u > 0 ? "" : "text-muted-foreground/50"}`}
                            >
                              {u > 0 ? u : "–"}
                            </TableCell>
                            <TableCell
                              className={`px-1 text-xs text-right tabular-nums ${k > 0 ? "" : "text-muted-foreground/50"}`}
                            >
                              {k > 0 ? k : "–"}
                            </TableCell>
                          </>
                        );
                      })()}
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
        <ZeitSkeleton />
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

// Z3 — Umhängen-Popover je Zeile: listet alle Einträge der Person in dieser
// Woche mit einem Abteilungs-Select (begrenzt auf ihre Zuordnungen am
// Standort). NULL („—") ist erlaubt und stellt den Ur-Zustand
// (Bestandsdaten/Stempel) wieder her.
function ReassignPopover({
  row,
  entriesById,
  onReassign,
  pending,
  staffDeptsByStaff,
}: {
  row: WeeklyExportRow;
  entriesById: Map<string, WeeklyEntry>;
  onReassign: (id: string, department: Department | null) => void;
  pending: boolean;
  staffDeptsByStaff: Map<string, Department[]>;
}) {
  const staffDepts = staffDeptsByStaff.get(row.staffId) ?? [row.department];
  const entries = [...entriesById.values()]
    .filter((e) => e.staffId === row.staffId)
    .sort((a, b) => a.businessDate.localeCompare(b.businessDate));
  if (entries.length === 0) return null;
  const NULL_TOKEN = "__null__";
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="absolute bottom-0 right-0.5 text-[10px] leading-none text-muted-foreground hover:text-foreground underline decoration-dotted opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity"
          title="Einträge einer Abteilung zuordnen"
          disabled={pending}
        >
          umhängen
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 p-3 space-y-2">
        <div className="text-xs font-medium">{row.displayName} — Einträge dieser Woche</div>
        {entries.map((e) => {
          const current = e.rawDepartment ?? null;
          return (
            <div key={e.id} className="flex items-center gap-2 text-xs">
              <span className="tabular-nums w-24 truncate">
                {e.businessDate.slice(8, 10)}.{e.businessDate.slice(5, 7)}.{" "}
                {new Date(e.startedAt).toLocaleTimeString("de-DE", {
                  hour: "2-digit",
                  minute: "2-digit",
                  timeZone: "Europe/Berlin",
                })}
              </span>
              <Select
                value={current ?? NULL_TOKEN}
                disabled={pending}
                onValueChange={(v) => {
                  const next = v === NULL_TOKEN ? null : (v as Department);
                  if (next === current) return;
                  onReassign(e.id, next);
                }}
              >
                <SelectTrigger className="h-7 flex-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NULL_TOKEN}>— (Primär)</SelectItem>
                  {staffDepts.map((d) => (
                    <SelectItem key={d} value={d}>
                      {DEPT_LABEL[d]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          );
        })}
      </PopoverContent>
    </Popover>
  );
}
