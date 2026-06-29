// M-Statistik UI — Schritt U1: Gerüst + Umsatz.
// Reines Frontend. Konsumiert `getRevenueStats` (Kalendermonat, S-3).
// Keine neuen Server-Fns, kein Schema, keine Logik in src/lib/statistics/.

import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { AlertTriangle, ArrowDown, ArrowUp } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { LocationPills } from "@/components/shared/LocationPills";
import { listLocations } from "@/lib/admin/locations.functions";
import { getRevenueStats } from "@/lib/statistics/revenue-stats.functions";
import { getTipStats } from "@/lib/statistics/tip-stats.functions";
import { getPersonnelStats } from "@/lib/statistics/personnel-stats.functions";
import { personnelRatioPct } from "@/lib/statistics/personnel-core";
import { fmtCents } from "@/lib/format";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/admin/statistik")({
  head: () => ({ meta: [{ title: "Statistik" }] }),
  component: StatistikPage,
});

type RevenueStats = Awaited<ReturnType<typeof getRevenueStats>>;
type Trend = NonNullable<RevenueStats["trend"]>["total"];
type TipStats = Awaited<ReturnType<typeof getTipStats>>;
type PersonnelStats = Awaited<ReturnType<typeof getPersonnelStats>>;
type TipPerStaff = TipStats["perStaff"][number];
type PersonnelPerStaff = PersonnelStats["perStaff"][number];

function currentMonthString(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function fmtEuro(cents: number): string {
  return `${fmtCents(cents)} €`;
}

function fmtSignedEuro(cents: number): string {
  const sign = cents > 0 ? "+" : cents < 0 ? "−" : "±";
  return `${sign}${fmtCents(Math.abs(cents))} €`;
}

function TrendLine({ trend }: { trend: Trend | null | undefined }) {
  if (!trend || trend.pct === null) {
    return <div className="text-xs text-muted-foreground">— keine Vorperiode</div>;
  }
  const up = trend.deltaCents >= 0;
  const Icon = up ? ArrowUp : ArrowDown;
  const color = up ? "text-emerald-600" : "text-rose-600";
  const pctTxt = `${up ? "+" : "−"}${Math.abs(trend.pct).toFixed(1)} %`;
  return (
    <div className={cn("flex items-center gap-1 text-xs", color)}>
      <Icon className="h-3.5 w-3.5" aria-hidden />
      <span className="font-medium">{pctTxt}</span>
      <span className="text-muted-foreground">({fmtSignedEuro(trend.deltaCents)})</span>
    </div>
  );
}

function TrendLineHours({ trend }: { trend: Trend | null | undefined }) {
  // ACHTUNG: `deltaCents` ist hier in Wahrheit Delta-Minuten (Trend-Typ
  // wird wiederverwendet). NIE als „€" rendern.
  if (!trend || trend.pct === null) {
    return <div className="text-xs text-muted-foreground">— keine Vorperiode</div>;
  }
  const up = trend.deltaCents >= 0;
  const Icon = up ? ArrowUp : ArrowDown;
  const color = up ? "text-emerald-600" : "text-rose-600";
  const pctTxt = `${up ? "+" : "−"}${Math.abs(trend.pct).toFixed(1)} %`;
  const hoursTxt = `${up ? "+" : "−"}${(Math.abs(trend.deltaCents) / 60).toFixed(1)} h`;
  return (
    <div className={cn("flex items-center gap-1 text-xs", color)}>
      <Icon className="h-3.5 w-3.5" aria-hidden />
      <span className="font-medium">{pctTxt}</span>
      <span className="text-muted-foreground">({hoursTxt})</span>
    </div>
  );
}

type KpiCardProps = {
  title: string;
  /** EUR-Cents (Default-Unit "eur"). Rückwärtskompatibel zu U1. */
  cents?: number;
  trend?: Trend | null | undefined;
  unit?: "eur" | "hours" | "pct";
  /** Für unit="hours" (Stunden) oder unit="pct" (Prozent oder null). */
  value?: number | null;
  /** Optionaler Trend-Renderer; überschreibt die Default-`TrendLine`. */
  trendRenderer?: () => React.ReactNode;
  /** Optionale Caption unter dem Wert (kleine, gedämpfte Zeile). */
  caption?: React.ReactNode;
};

function KpiCard({
  title,
  cents,
  trend,
  unit = "eur",
  value,
  trendRenderer,
  caption,
}: KpiCardProps) {
  let display: string;
  if (unit === "eur") {
    display = fmtEuro(cents ?? 0);
  } else if (unit === "hours") {
    display = value === null || value === undefined ? "—" : `${value.toFixed(2)} h`;
  } else {
    display = value === null || value === undefined ? "—" : `${value.toFixed(1)} %`;
  }
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-1">
        <div className="text-2xl font-semibold tabular-nums">{display}</div>
        {trendRenderer ? trendRenderer() : <TrendLine trend={trend} />}
        {caption ? <div className="text-xs text-muted-foreground">{caption}</div> : null}
      </CardContent>
    </Card>
  );
}

function StatistikPage() {
  const [month, setMonth] = useState<string>(currentMonthString());
  const [locationFilter, setLocationFilter] = useState<string>("all");

  const locationsQ = useQuery({
    queryKey: ["admin-locations"],
    queryFn: () => listLocations(),
  });
  const locations = useMemo(() => locationsQ.data ?? [], [locationsQ.data]);

  const statsQ = useQuery({
    queryKey: ["stats", "revenue", month, locationFilter],
    queryFn: () =>
      getRevenueStats({
        data: {
          month,
          ...(locationFilter !== "all" ? { locationId: locationFilter } : {}),
        },
      }),
    enabled: month.length === 7,
  });

  const tipArgs = {
    month,
    ...(locationFilter !== "all" ? { locationId: locationFilter } : {}),
  };
  const tipsQ = useQuery({
    queryKey: ["stats", "tips", month, locationFilter],
    queryFn: () => getTipStats({ data: tipArgs }),
    enabled: month.length === 7,
  });
  const personnelQ = useQuery({
    queryKey: ["stats", "personnel", month, locationFilter],
    queryFn: () => getPersonnelStats({ data: tipArgs }),
    enabled: month.length === 7,
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Statistik</h1>
        <p className="text-sm text-muted-foreground">
          Umsatz je Kalendermonat — Haus und Takeaway, mit Trend gegen den Vormonat.
        </p>
      </div>

      <Card className="p-3">
        <div className="flex flex-wrap items-end gap-4">
          <div className="space-y-1">
            <Label htmlFor="stat-month">Monat</Label>
            <input
              id="stat-month"
              type="month"
              value={month}
              onChange={(e) => setMonth(e.target.value)}
              className="h-9 rounded-md border border-input bg-background px-3 text-sm"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="stat-loc">Standort</Label>
            <div id="stat-loc">
              <LocationPills
                locations={locations}
                value={locationFilter}
                onChange={setLocationFilter}
                includeAll
                allValue="all"
              />
            </div>
          </div>
        </div>
      </Card>

      {statsQ.isLoading ? (
        <LoadingState />
      ) : statsQ.isError ? (
        <ErrorState message={(statsQ.error as Error)?.message ?? "Unbekannter Fehler"} />
      ) : statsQ.data ? (
        <StatsView data={statsQ.data} />
      ) : null}

      <TipsSection
        isLoading={tipsQ.isLoading}
        isError={tipsQ.isError}
        error={tipsQ.error}
        data={tipsQ.data}
      />

      <PersonnelSection
        isLoading={personnelQ.isLoading || statsQ.isLoading}
        isError={personnelQ.isError}
        error={personnelQ.error}
        personnel={personnelQ.data}
        revenue={statsQ.data}
      />
    </div>
  );
}

function LoadingState() {
  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-3">
        <Skeleton className="h-28" />
        <Skeleton className="h-28" />
        <Skeleton className="h-28" />
      </div>
      <Skeleton className="h-[320px]" />
    </div>
  );
}

function ErrorState({ message }: { message: string }) {
  return (
    <Card className="border-rose-300/60 bg-rose-50/50 p-4 text-sm text-rose-700 dark:bg-rose-950/30 dark:text-rose-300">
      <div className="font-medium">Statistik konnte nicht geladen werden.</div>
      <div className="mt-1 text-xs opacity-80">{message}</div>
    </Card>
  );
}

function StatsView({ data }: { data: RevenueStats }) {
  const trend = data.trend;
  const hasDaily = data.daily.length > 0;
  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-3">
        <KpiCard
          title="Gesamtumsatz"
          cents={data.summary.totalCents}
          trend={trend?.total ?? null}
        />
        <KpiCard title="Haus" cents={data.summary.houseCents} trend={trend?.house ?? null} />
        <KpiCard
          title="Takeaway"
          cents={data.summary.takeawayCents}
          trend={trend?.takeaway ?? null}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Umsatzverlauf</CardTitle>
        </CardHeader>
        <CardContent>{hasDaily ? <RevenueChart daily={data.daily} /> : <EmptyChart />}</CardContent>
      </Card>
    </div>
  );
}

function EmptyChart() {
  return (
    <div className="flex h-[280px] flex-col items-center justify-center rounded-md border border-dashed border-border text-sm text-muted-foreground">
      <div>Keine Umsätze in diesem Monat.</div>
      <div className="mt-1 text-xs">Sobald Tagesabschlüsse erfasst sind, erscheinen sie hier.</div>
    </div>
  );
}

type DailyRow = RevenueStats["daily"][number];

function RevenueChart({ daily }: { daily: DailyRow[] }) {
  const rows = daily.map((d) => ({
    day: d.businessDate.slice(8, 10),
    fullDate: d.businessDate,
    haus: d.houseCents / 100,
    takeaway: d.takeawayCents / 100,
    total: d.totalCents,
  }));

  return (
    <div className="h-[320px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" className="stroke-border/50" />
          <XAxis dataKey="day" tickLine={false} axisLine={false} fontSize={11} />
          <YAxis
            tickFormatter={(v: number) => `${Math.round(v).toLocaleString("de-DE")} €`}
            tickLine={false}
            axisLine={false}
            fontSize={11}
            width={70}
          />
          <Tooltip content={<ChartTip />} cursor={{ fill: "rgba(0,0,0,0.04)" }} />
          <Bar dataKey="haus" stackId="rev" fill="#2563eb" name="Haus" radius={[0, 0, 0, 0]} />
          <Bar
            dataKey="takeaway"
            stackId="rev"
            fill="#f59e0b"
            name="Takeaway"
            radius={[4, 4, 0, 0]}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

type TipPayload = {
  active?: boolean;
  payload?: Array<{ payload: { fullDate: string; haus: number; takeaway: number; total: number } }>;
};

function ChartTip({ active, payload }: TipPayload) {
  if (!active || !payload || payload.length === 0) return null;
  const row = payload[0].payload;
  return (
    <div className="rounded-md border border-border bg-popover px-3 py-2 text-xs shadow-md">
      <div className="font-medium">{row.fullDate}</div>
      <div className="mt-1 grid grid-cols-2 gap-x-3 gap-y-0.5 tabular-nums">
        <span className="text-muted-foreground">Haus</span>
        <span className="text-right">{fmtEuro(Math.round(row.haus * 100))}</span>
        <span className="text-muted-foreground">Takeaway</span>
        <span className="text-right">{fmtEuro(Math.round(row.takeaway * 100))}</span>
        <span className="font-medium">Gesamt</span>
        <span className="text-right font-medium">{fmtEuro(row.total)}</span>
      </div>
    </div>
  );
}

// ---------- Trinkgeld-Section ----------

function TipsSection({
  isLoading,
  isError,
  error,
  data,
}: {
  isLoading: boolean;
  isError: boolean;
  error: unknown;
  data: TipStats | undefined;
}) {
  return (
    <section className="space-y-3">
      <h2 className="text-lg font-semibold tracking-tight text-foreground">Trinkgeld</h2>
      {isLoading ? (
        <TipsLoading />
      ) : isError ? (
        <ErrorState message={(error as Error)?.message ?? "Unbekannter Fehler"} />
      ) : data ? (
        <TipsView data={data} />
      ) : null}
    </section>
  );
}

function TipsLoading() {
  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-3">
        <Skeleton className="h-28" />
        <Skeleton className="h-28" />
        <Skeleton className="h-28" />
      </div>
      <Skeleton className="h-40" />
    </div>
  );
}

function TipsView({ data }: { data: TipStats }) {
  const t = data.trend;
  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-3">
        <KpiCard title="Trinkgeld gesamt" cents={data.totals.totalCents} trend={t?.total ?? null} />
        <KpiCard title="Service" cents={data.totals.serviceCents} trend={t?.service ?? null} />
        <KpiCard title="Küche" cents={data.totals.kitchenCents} trend={t?.kitchen ?? null} />
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Trinkgeld pro Mitarbeiter</CardTitle>
        </CardHeader>
        <CardContent>
          {data.perStaff.length === 0 ? (
            <div className="rounded-md border border-dashed border-border p-4 text-sm text-muted-foreground">
              Keine Trinkgeld-Auszahlungen in diesem Monat.
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {data.perStaff.map((p) => (
                <TipStaffRow key={p.staffId} row={p} />
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function TipStaffRow({ row }: { row: TipPerStaff }) {
  const isService = row.department === "service";
  return (
    <li className="flex items-center justify-between gap-3 py-2">
      <div className="flex items-center gap-2">
        <Badge
          variant="outline"
          className={cn(
            "border-transparent",
            isService
              ? "bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300"
              : "bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300",
          )}
        >
          {isService ? "Service" : "Küche"}
        </Badge>
        <span className="text-sm text-foreground">{row.name}</span>
      </div>
      <span className="text-sm font-medium tabular-nums">{fmtEuro(row.tipCents)}</span>
    </li>
  );
}

// ---------- Personalquote-Section ----------

function PersonnelSection({
  isLoading,
  isError,
  error,
  personnel,
  revenue,
}: {
  isLoading: boolean;
  isError: boolean;
  error: unknown;
  personnel: PersonnelStats | undefined;
  revenue: RevenueStats | undefined;
}) {
  return (
    <section className="space-y-3">
      <h2 className="text-lg font-semibold tracking-tight text-foreground">Personalquote</h2>
      {isError ? (
        <ErrorState message={(error as Error)?.message ?? "Unbekannter Fehler"} />
      ) : isLoading || !personnel || !revenue ? (
        <PersonnelLoading />
      ) : (
        <PersonnelView personnel={personnel} revenue={revenue} />
      )}
    </section>
  );
}

function PersonnelLoading() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-32" />
      <div className="grid gap-4 md:grid-cols-3">
        <Skeleton className="h-28" />
        <Skeleton className="h-28" />
        <Skeleton className="h-28" />
      </div>
    </div>
  );
}

function PersonnelView({
  personnel,
  revenue,
}: {
  personnel: PersonnelStats;
  revenue: RevenueStats;
}) {
  const ratio = personnelRatioPct(personnel.totals.laborCostCents, revenue.summary.totalCents);
  const netHours = personnel.totals.netHours;
  const revPerHourCents = netHours > 0 ? Math.round(revenue.summary.totalCents / netHours) : null;
  const trend = personnel.trend;

  if (netHours === 0) {
    return (
      <div className="rounded-md border border-dashed border-border p-4 text-sm text-muted-foreground">
        Keine Stunden in diesem Monat.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <KpiCard
        title="Personalquote"
        unit="pct"
        value={ratio}
        caption="Basis-Brutto (Netto-Stunden × Stundenlohn) — ohne AG-SV, SFN, Zweitsatz."
      />
      <div className="grid gap-4 md:grid-cols-3">
        <KpiCard
          title="Netto-Stunden"
          unit="hours"
          value={netHours}
          trendRenderer={() => <TrendLineHours trend={trend?.hours ?? null} />}
        />
        <KpiCard
          title="Basis-Lohnkosten"
          cents={personnel.totals.laborCostCents}
          trend={trend?.cost ?? null}
        />
        <KpiCard
          title="Umsatz / Stunde"
          unit={revPerHourCents === null ? "pct" : "eur"}
          cents={revPerHourCents ?? 0}
          value={revPerHourCents === null ? null : undefined}
        />
      </div>
      {personnel.staffWithoutRate.length > 0 ? (
        <StaffWithoutRateBanner ids={personnel.staffWithoutRate} perStaff={personnel.perStaff} />
      ) : null}
    </div>
  );
}

function StaffWithoutRateBanner({
  ids,
  perStaff,
}: {
  ids: string[];
  perStaff: PersonnelPerStaff[];
}) {
  const names = ids.map((id) => perStaff.find((p) => p.staffId === id)?.name ?? id).join(", ");
  return (
    <Card className="border-amber-300/60 bg-amber-50/60 p-4 text-sm text-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
      <div className="flex items-start gap-2">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
        <div className="space-y-1">
          <div className="font-medium">
            {ids.length} {ids.length === 1 ? "Mitarbeiter" : "Mitarbeiter"} ohne hinterlegten
            Stundenlohn — Lohnkosten und Quote untertreiben.
          </div>
          <div className="text-xs opacity-90">{names}</div>
        </div>
      </div>
    </Card>
  );
}
