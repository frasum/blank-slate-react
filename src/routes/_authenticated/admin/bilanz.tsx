// Admin-UI fuer den Jahresabschluss (Welle F4b).
//
// Drei Tabs: Jahres-Ansicht (KPIs + Drill-Down + Wasserfall),
// Mehrjahresvergleich (Top-Level ueber alle Jahre + VJ-Konsistenz),
// Import (PDF → Review → speichern via replaceBilanzYear).
//
// Parser- und KPI-Logik liegt in reinen Modulen (bilanz-pdf-parser,
// bilanz-kpis) und wird hier nur konsumiert. Alle Cent-Betraege bleiben
// als Integer bis zum Render; Euro-Formatierung ueber fmtCents.

import { createFileRoute, redirect } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { Fragment } from "react";
import { toast } from "sonner";
import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ArrowDown, ArrowUp, ChevronRight, ChevronDown, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { fmtCents } from "@/lib/format";
import { extractTokenLines, type TextItem } from "@/lib/bwa/pdf-lines";
import {
  parseBilanzPdf,
  type ParsedBilanzYear,
  type Token,
  type BilanzCheck,
} from "@/lib/bwa/bilanz-pdf-parser";
import {
  deleteBilanzYear,
  getBilanzYear,
  listBilanzYears,
  replaceBilanzYear,
} from "@/lib/bwa/bilanz.functions";
import {
  deriveBilanzKpis,
  findVjConsistencyMismatches,
  type BilanzPositionRow,
} from "@/lib/bwa/bilanz-kpis";

export const Route = createFileRoute("/_authenticated/admin/bilanz")({
  beforeLoad: ({ context }) => {
    const role = (context as { identity?: { role?: string } }).identity?.role;
    if (role !== "admin") throw redirect({ to: "/admin" });
  },
  head: () => ({ meta: [{ title: "Jahresabschluss" }] }),
  component: BilanzPage,
});

// ---------------------------------------------------------------------------
// Format-Helfer
// ---------------------------------------------------------------------------

function fmtEuro(c: number | null | undefined): string {
  if (c === null || c === undefined) return "—";
  return `${fmtCents(c)} €`;
}

function fmtPct(v: number | null, digits = 1): string {
  if (v === null) return "—";
  return (
    (v * 100).toLocaleString("de-DE", {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    }) + " %"
  );
}

function fmtDeltaPct(
  cur: number | null,
  prev: number | null,
): {
  text: string;
  up: boolean;
  neutral: boolean;
} {
  if (cur === null || prev === null || prev === 0) {
    return { text: "—", up: true, neutral: true };
  }
  const pct = (cur - prev) / Math.abs(prev);
  const up = pct >= 0;
  return {
    text:
      (pct >= 0 ? "+" : "") +
      (pct * 100).toLocaleString("de-DE", {
        minimumFractionDigits: 1,
        maximumFractionDigits: 1,
      }) +
      " %",
    up,
    neutral: pct === 0,
  };
}

// ---------------------------------------------------------------------------
// Root
// ---------------------------------------------------------------------------

function BilanzPage() {
  const listFn = useServerFn(listBilanzYears);
  const listQ = useQuery({
    queryKey: ["bilanz-years"],
    queryFn: () => listFn(),
  });
  const years = listQ.data ?? [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Jahresabschluss</h1>
        <p className="text-sm text-muted-foreground">
          Handelsbilanz, GuV und Kontennachweis je Gesellschaft und Geschäftsjahr.
        </p>
      </div>

      <Tabs defaultValue="jahr" className="space-y-4">
        <TabsList>
          <TabsTrigger value="jahr">Jahres-Ansicht</TabsTrigger>
          <TabsTrigger value="vergleich">Mehrjahresvergleich</TabsTrigger>
          <TabsTrigger value="import">Import</TabsTrigger>
        </TabsList>

        <TabsContent value="jahr" className="space-y-6">
          <YearView years={years} loading={listQ.isLoading} />
        </TabsContent>
        <TabsContent value="vergleich" className="space-y-6">
          <MultiYearView years={years} loading={listQ.isLoading} />
        </TabsContent>
        <TabsContent value="import" className="space-y-6">
          <ImportView years={years} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Jahres-Ansicht
// ---------------------------------------------------------------------------

type YearRef = { entity: string; fiscalYear: number };

function YearView({ years, loading }: { years: YearRef[]; loading: boolean }) {
  const entities = useMemo(() => Array.from(new Set(years.map((y) => y.entity))).sort(), [years]);
  const [entity, setEntity] = useState<string>("");
  const [year, setYear] = useState<number | null>(null);

  const effEntity = entity || entities[0] || "";
  const entYears = years.filter((y) => y.entity === effEntity).map((y) => y.fiscalYear);
  const effYear = year !== null && entYears.includes(year) ? year : (entYears[0] ?? null);

  const getFn = useServerFn(getBilanzYear);
  const dataQ = useQuery({
    queryKey: ["bilanz-year", effEntity, effYear],
    queryFn: () => getFn({ data: { entity: effEntity, fiscalYear: effYear! } }),
    enabled: !!effEntity && effYear !== null,
  });

  const qc = useQueryClient();
  const deleteFn = useServerFn(deleteBilanzYear);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const deleteMut = useMutation({
    mutationFn: (v: YearRef) => deleteFn({ data: v }),
    onSuccess: async () => {
      toast.success("Jahresabschluss gelöscht.");
      await qc.invalidateQueries({ queryKey: ["bilanz-years"] });
      await qc.invalidateQueries({ queryKey: ["bilanz-year"] });
      setConfirmDelete(false);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : String(e)),
  });

  if (loading) return <Skeleton className="h-64 w-full" />;
  if (years.length === 0) {
    return (
      <Card>
        <CardContent className="p-8 text-center text-sm text-muted-foreground">
          Noch kein Jahresabschluss importiert. Wechsle auf „Import".
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <Label className="text-xs">Gesellschaft</Label>
          <Select value={effEntity} onValueChange={setEntity}>
            <SelectTrigger className="w-72">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {entities.map((e) => (
                <SelectItem key={e} value={e}>
                  {e}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs">Geschäftsjahr</Label>
          <Select
            value={effYear !== null ? String(effYear) : ""}
            onValueChange={(v) => setYear(Number.parseInt(v, 10))}
          >
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {entYears.map((y) => (
                <SelectItem key={y} value={String(y)}>
                  {y}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {effYear !== null && (
          <Button
            variant="outline"
            size="sm"
            className="text-destructive"
            onClick={() => setConfirmDelete(true)}
          >
            Jahr löschen
          </Button>
        )}
      </div>

      {dataQ.isLoading && <Skeleton className="h-64 w-full" />}
      {dataQ.data && effYear !== null && (
        <YearDetail
          positions={dataQ.data.positions}
          konten={dataQ.data.konten}
          entity={effEntity}
          fiscalYear={effYear}
        />
      )}

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Jahresabschluss {effEntity} {effYear} löschen?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Positionen und Kontennachweis werden dauerhaft entfernt. Dieser Schritt ist nicht
              umkehrbar.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Abbrechen</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() =>
                effYear !== null && deleteMut.mutate({ entity: effEntity, fiscalYear: effYear })
              }
            >
              Löschen
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

type KontoRow = {
  statement: "aktiva" | "passiva" | "guv";
  position_code: string;
  konto_nr: string;
  label: string;
  betrag_cents: number;
  vorjahr_cents: number | null;
  sort_order: number;
};

function YearDetail({
  positions,
  konten,
  entity,
  fiscalYear,
}: {
  positions: BilanzPositionRow[];
  konten: KontoRow[];
  entity: string;
  fiscalYear: number;
}) {
  const kpisGj = deriveBilanzKpis(positions, "gj");
  const kpisVj = deriveBilanzKpis(positions, "vj");

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          label="Bilanzsumme"
          value={fmtEuro(kpisGj.bilanzsumme.cents)}
          delta={fmtDeltaPct(kpisGj.bilanzsumme.cents, kpisVj.bilanzsumme.cents)}
          missing={kpisGj.bilanzsumme.missing}
          higherIsGood
        />
        <KpiCard
          label="Eigenkapitalquote"
          value={fmtPct(kpisGj.eigenkapitalquote.value)}
          sub={`EK: ${fmtEuro(kpisGj.eigenkapital.cents)}`}
          delta={fmtDeltaPct(kpisGj.eigenkapital.cents, kpisVj.eigenkapital.cents)}
          missing={kpisGj.eigenkapitalquote.missing}
          higherIsGood
        />
        <KpiCard
          label="Liquide Mittel"
          value={fmtEuro(kpisGj.liquideMittel.cents)}
          delta={fmtDeltaPct(kpisGj.liquideMittel.cents, kpisVj.liquideMittel.cents)}
          missing={kpisGj.liquideMittel.missing}
          higherIsGood
        />
        <KpiCard
          label="Jahresüberschuss"
          value={fmtEuro(kpisGj.jahresueberschuss.cents)}
          delta={fmtDeltaPct(kpisGj.jahresueberschuss.cents, kpisVj.jahresueberschuss.cents)}
          missing={kpisGj.jahresueberschuss.missing}
          higherIsGood
          valueClass={
            kpisGj.jahresueberschuss.cents !== null && kpisGj.jahresueberschuss.cents < 0
              ? "text-destructive"
              : "text-emerald-600"
          }
        />
      </div>

      <Tabs defaultValue="bilanz" className="space-y-4">
        <TabsList>
          <TabsTrigger value="bilanz">Bilanz</TabsTrigger>
          <TabsTrigger value="guv">GuV</TabsTrigger>
        </TabsList>
        <TabsContent value="bilanz" className="space-y-6">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">
                Aktiva — {entity} · {fiscalYear}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <PositionTree
                positions={positions.filter((p) => p.statement === "aktiva")}
                konten={konten.filter((k) => k.statement === "aktiva")}
                summaryLabel="Summe Aktiva"
              />
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Passiva</CardTitle>
            </CardHeader>
            <CardContent>
              <PositionTree
                positions={positions.filter((p) => p.statement === "passiva")}
                konten={konten.filter((k) => k.statement === "passiva")}
                summaryLabel="Summe Passiva"
              />
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="guv" className="space-y-6">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Gewinn- und Verlustrechnung</CardTitle>
            </CardHeader>
            <CardContent>
              <PositionTree
                positions={positions.filter((p) => p.statement === "guv")}
                konten={konten.filter((k) => k.statement === "guv")}
                summaryLabel="Jahresüberschuss / Bilanzgewinn"
              />
            </CardContent>
          </Card>
          <GuvWaterfall positions={positions.filter((p) => p.statement === "guv")} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ---------------------------------------------------------------------------
// KPI-Card
// ---------------------------------------------------------------------------

function KpiCard({
  label,
  value,
  sub,
  delta,
  missing,
  higherIsGood,
  valueClass,
}: {
  label: string;
  value: string;
  sub?: string;
  delta?: { text: string; up: boolean; neutral: boolean };
  missing?: boolean;
  higherIsGood?: boolean;
  valueClass?: string;
}) {
  const good = delta && !delta.neutral && (higherIsGood ? delta.up : !delta.up);
  const deltaCls = delta?.neutral
    ? "text-muted-foreground"
    : good
      ? "text-emerald-600"
      : "text-destructive";
  const Arrow = delta?.up ? ArrowUp : ArrowDown;
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle
          className="text-sm font-medium text-muted-foreground"
          title={missing ? "Anker nicht gefunden — kein KPI berechnet." : undefined}
        >
          {label}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-1">
        <div className={`text-2xl font-semibold tabular-nums ${valueClass ?? ""}`}>{value}</div>
        {sub && <div className="text-xs text-muted-foreground">{sub}</div>}
        {delta && (
          <div className={`text-xs flex items-center gap-1 ${deltaCls}`}>
            {!delta.neutral && delta.text !== "—" && <Arrow className="h-3 w-3" />}
            <span>VJ: {delta.text}</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// PositionTree
// ---------------------------------------------------------------------------

function PositionTree({
  positions,
  konten,
  summaryLabel,
}: {
  positions: BilanzPositionRow[];
  konten: KontoRow[];
  summaryLabel: string;
}) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const toggle = (code: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });
  };

  const sorted = [...positions].sort((a, b) => a.sort_order - b.sort_order);
  const codes = new Set(sorted.map((p) => p.code));
  const isLeaf = (code: string): boolean => {
    for (const c of codes) if (c !== code && c.startsWith(code + ".")) return false;
    return true;
  };
  const parentVisible = (code: string): boolean => {
    if (code.indexOf(".") < 0) return true; // top-level
    // Alle Prefixe muessen expanded sein.
    const parts = code.split(".");
    for (let i = 1; i < parts.length; i++) {
      const parent = parts.slice(0, i).join(".");
      if (!expanded.has(parent)) return false;
    }
    return true;
  };

  const kontenByPos = new Map<string, KontoRow[]>();
  for (const k of konten) {
    const arr = kontenByPos.get(k.position_code) ?? [];
    arr.push(k);
    kontenByPos.set(k.position_code, arr);
  }

  const topLevelSum = sorted.filter((p) => p.level === 0).reduce((a, p) => a + p.betrag_cents, 0);
  const topLevelSumVj = sorted
    .filter((p) => p.level === 0)
    .reduce<
      number | null
    >((a, p) => (a === null || p.vorjahr_cents === null ? null : a + p.vorjahr_cents), 0);

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Position</TableHead>
          <TableHead className="text-right">GJ</TableHead>
          <TableHead className="text-right">VJ</TableHead>
          <TableHead className="text-right">Δ %</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {sorted.map((p) => {
          if (!parentVisible(p.code)) return null;
          const isTop = p.level === 0;
          const leaf = isLeaf(p.code);
          const posKonten = kontenByPos.get(p.code) ?? [];
          const canExpand = !leaf || posKonten.length > 0;
          const open = expanded.has(p.code);
          const delta = fmtDeltaPct(p.betrag_cents, p.vorjahr_cents);
          return (
            <Fragment key={p.code}>
              <TableRow className={isTop ? "bg-muted/30" : undefined}>
                <TableCell style={{ paddingLeft: 12 + p.level * 20 }}>
                  <button
                    type="button"
                    className={`inline-flex items-center gap-1 ${isTop ? "font-semibold" : ""}`}
                    onClick={() => canExpand && toggle(p.code)}
                    disabled={!canExpand}
                  >
                    {canExpand ? (
                      open ? (
                        <ChevronDown className="h-3 w-3" />
                      ) : (
                        <ChevronRight className="h-3 w-3" />
                      )
                    ) : (
                      <span className="inline-block h-3 w-3" />
                    )}
                    <span>{p.label}</span>
                    <span className="text-xs text-muted-foreground">{p.code}</span>
                  </button>
                </TableCell>
                <TableCell className={`text-right tabular-nums ${isTop ? "font-semibold" : ""}`}>
                  {fmtEuro(p.betrag_cents)}
                </TableCell>
                <TableCell className="text-right tabular-nums text-muted-foreground">
                  {fmtEuro(p.vorjahr_cents)}
                </TableCell>
                <TableCell
                  className={`text-right text-xs ${delta.neutral ? "text-muted-foreground" : delta.up ? "text-emerald-600" : "text-destructive"}`}
                >
                  {delta.text}
                </TableCell>
              </TableRow>
              {open &&
                leaf &&
                posKonten
                  .sort((a, b) => a.sort_order - b.sort_order)
                  .map((k) => (
                    <TableRow key={`${p.code}::${k.konto_nr}`} className="text-xs">
                      <TableCell style={{ paddingLeft: 12 + (p.level + 1) * 20 }}>
                        <span className="font-mono text-muted-foreground mr-2">{k.konto_nr}</span>
                        {k.label}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {fmtEuro(k.betrag_cents)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-muted-foreground">
                        {fmtEuro(k.vorjahr_cents)}
                      </TableCell>
                      <TableCell />
                    </TableRow>
                  ))}
            </Fragment>
          );
        })}
        <TableRow className="border-t-2 font-semibold bg-muted/40">
          <TableCell>{summaryLabel}</TableCell>
          <TableCell className="text-right tabular-nums">{fmtEuro(topLevelSum)}</TableCell>
          <TableCell className="text-right tabular-nums text-muted-foreground">
            {fmtEuro(topLevelSumVj)}
          </TableCell>
          <TableCell />
        </TableRow>
      </TableBody>
    </Table>
  );
}

// ---------------------------------------------------------------------------
// GuV-Wasserfall
// ---------------------------------------------------------------------------

function GuvWaterfall({ positions }: { positions: BilanzPositionRow[] }) {
  const top = positions.filter((p) => p.level === 0).sort((a, b) => a.sort_order - b.sort_order);
  if (top.length === 0) return null;
  const steps = top.map((p) => ({
    name: p.label.length > 22 ? p.label.slice(0, 22) + "…" : p.label,
    value: p.betrag_cents / 100,
    positive: p.betrag_cents >= 0,
  }));
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">GuV-Wasserfall</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={steps}>
              <XAxis
                dataKey="name"
                tick={{ fontSize: 10 }}
                angle={-15}
                textAnchor="end"
                height={70}
              />
              <YAxis
                tickFormatter={(v: number) => v.toLocaleString("de-DE", { notation: "compact" })}
                tick={{ fontSize: 10 }}
              />
              <Tooltip
                formatter={(v: number) =>
                  `${v.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`
                }
              />
              <Bar dataKey="value">
                {steps.map((s, i) => (
                  <Cell key={i} fill={s.positive ? "hsl(142 71% 45%)" : "hsl(0 84% 60%)"} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Mehrjahresvergleich
// ---------------------------------------------------------------------------

function MultiYearView({ years, loading }: { years: YearRef[]; loading: boolean }) {
  const entities = useMemo(() => Array.from(new Set(years.map((y) => y.entity))).sort(), [years]);
  const [entity, setEntity] = useState<string>("");
  const effEntity = entity || entities[0] || "";
  const entYears = years
    .filter((y) => y.entity === effEntity)
    .map((y) => y.fiscalYear)
    .sort((a, b) => b - a);

  const getFn = useServerFn(getBilanzYear);
  const dataQ = useQuery({
    queryKey: ["bilanz-multi", effEntity, entYears.join(",")],
    queryFn: async () => {
      const results = await Promise.all(
        entYears.map(async (y) => ({
          year: y,
          data: await getFn({ data: { entity: effEntity, fiscalYear: y } }),
        })),
      );
      return results;
    },
    enabled: !!effEntity && entYears.length > 0,
  });

  if (loading) return <Skeleton className="h-64 w-full" />;
  if (years.length === 0) {
    return (
      <Card>
        <CardContent className="p-8 text-center text-sm text-muted-foreground">
          Noch kein Jahresabschluss importiert.
        </CardContent>
      </Card>
    );
  }

  const results = dataQ.data ?? [];
  // Zusammenfuehren: Top-Level-Positionen, Zeilen je (statement, code).
  const rowKey = (p: BilanzPositionRow) => `${p.statement}::${p.code}`;
  const rowLabels = new Map<
    string,
    { statement: string; code: string; label: string; sort: number }
  >();
  for (const r of results) {
    for (const p of r.data.positions) {
      if (p.level !== 0) continue;
      const k = rowKey(p);
      if (!rowLabels.has(k))
        rowLabels.set(k, {
          statement: p.statement,
          code: p.code,
          label: p.label,
          sort: p.sort_order,
        });
    }
  }
  const orderedRows = Array.from(rowLabels.values()).sort(
    (a, b) => a.statement.localeCompare(b.statement) || a.sort - b.sort,
  );

  // VJ-Konsistenz je Jahr-Paar.
  const mismatchesByYear = new Map<number, ReturnType<typeof findVjConsistencyMismatches>>();
  for (let i = 0; i < results.length - 1; i++) {
    const yearN = results[i];
    const yearP = results[i + 1];
    if (yearN.year === yearP.year + 1) {
      mismatchesByYear.set(
        yearN.year,
        findVjConsistencyMismatches(yearN.data.positions, yearP.data.positions),
      );
    }
  }

  function valueFor(year: number, statement: string, code: string): number | null {
    const r = results.find((x) => x.year === year);
    if (!r) return null;
    const p = r.data.positions.find(
      (q) => q.statement === statement && q.code === code && q.level === 0,
    );
    return p ? p.betrag_cents : null;
  }
  function mismatchFor(
    year: number,
    statement: string,
    code: string,
  ): ReturnType<typeof findVjConsistencyMismatches>[number] | undefined {
    return mismatchesByYear.get(year)?.find((m) => m.statement === statement && m.code === code);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <Label className="text-xs">Gesellschaft</Label>
          <Select value={effEntity} onValueChange={setEntity}>
            <SelectTrigger className="w-72">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {entities.map((e) => (
                <SelectItem key={e} value={e}>
                  {e}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      {dataQ.isLoading && <Skeleton className="h-64 w-full" />}
      {dataQ.data && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">
              Top-Level-Positionen über {entYears.length} Jahr(e)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Position</TableHead>
                  {entYears.map((y) => (
                    <TableHead key={y} className="text-right">
                      {y}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {orderedRows.map((r) => (
                  <TableRow key={`${r.statement}::${r.code}`}>
                    <TableCell>
                      <span className="text-xs text-muted-foreground mr-2 uppercase">
                        {r.statement}
                      </span>
                      {r.label}
                    </TableCell>
                    {entYears.map((y) => {
                      const v = valueFor(y, r.statement, r.code);
                      const mm = mismatchFor(y, r.statement, r.code);
                      return (
                        <TableCell key={y} className="text-right tabular-nums">
                          <span className="inline-flex items-center gap-1 justify-end">
                            {mm && (
                              <span
                                title={`VJ-Spalte ${y}-Bericht: ${fmtEuro(mm.reportVjCents)} weicht vom ${y - 1}-Bericht ab: ${fmtEuro(mm.prevGjCents)} — mögliche Umgliederung.`}
                              >
                                <AlertTriangle className="h-3 w-3 text-amber-500" />
                              </span>
                            )}
                            {fmtEuro(v)}
                          </span>
                        </TableCell>
                      );
                    })}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Import
// ---------------------------------------------------------------------------

function installPdfJsBrowserPolyfills(): void {
  type AsyncReadableStreamPrototype = ReadableStream<unknown> & {
    [Symbol.asyncIterator]?: () => AsyncIterator<unknown>;
  };
  const streamPrototype = globalThis.ReadableStream?.prototype as
    | AsyncReadableStreamPrototype
    | undefined;
  if (streamPrototype && typeof streamPrototype[Symbol.asyncIterator] !== "function") {
    Object.defineProperty(streamPrototype, Symbol.asyncIterator, {
      configurable: true,
      value: async function* readableStreamAsyncIterator(
        this: ReadableStream<unknown>,
      ): AsyncGenerator<unknown, void, unknown> {
        const reader = this.getReader();
        try {
          while (true) {
            const chunk = await reader.read();
            if (chunk.done) return;
            yield chunk.value;
          }
        } finally {
          reader.releaseLock();
        }
      },
    });
  }
}

type PdfTextItemLike = { str?: string; transform?: number[] };
type PdfTextChunkLike = { items?: unknown[] };
type PdfPageLike = {
  streamTextContent?: () => ReadableStream<PdfTextChunkLike>;
  getTextContent: () => Promise<{ items: unknown[] }>;
};

async function readPdfTextItems(page: PdfPageLike): Promise<unknown[]> {
  if (typeof page.streamTextContent === "function") {
    const reader = page.streamTextContent().getReader();
    const items: unknown[] = [];
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (Array.isArray(value?.items)) items.push(...value.items);
      }
    } finally {
      reader.releaseLock();
    }
    return items;
  }
  const content = await page.getTextContent();
  return content.items;
}

async function extractBilanzPagesFromPdf(file: File): Promise<Token[][][]> {
  installPdfJsBrowserPolyfills();
  const data = await file.arrayBuffer();
  const pdfjsLib = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const workerMod = await import("pdfjs-dist/legacy/build/pdf.worker.min.mjs?url");
  pdfjsLib.GlobalWorkerOptions.workerSrc = workerMod.default;
  const pdf = await pdfjsLib.getDocument({ data }).promise;
  const pages: Token[][][] = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const items = await readPdfTextItems(page);
    const textItems: TextItem[] = [];
    for (const it of items) {
      if (!it || typeof it !== "object" || !("str" in it)) continue;
      const item = it as PdfTextItemLike;
      if (!item.str || !Array.isArray(item.transform)) continue;
      textItems.push({ x: item.transform[4], y: item.transform[5], s: item.str });
    }
    pages.push(extractTokenLines(textItems));
  }
  return pages;
}

function ImportView({ years }: { years: YearRef[] }) {
  const qc = useQueryClient();
  const replaceFn = useServerFn(replaceBilanzYear);
  const [parsed, setParsed] = useState<ParsedBilanzYear | null>(null);
  const [entity, setEntity] = useState<string>("");
  const [fiscalYear, setFiscalYear] = useState<string>("");
  const [parsing, setParsing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleFile(files: FileList | null) {
    if (!files || files.length === 0) return;
    const file = files[0];
    if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
      toast.error("Keine PDF-Datei.");
      return;
    }
    setParsing(true);
    setError(null);
    try {
      const pages = await extractBilanzPagesFromPdf(file);
      const result = parseBilanzPdf(pages);
      setParsed(result);
      setEntity(result.entity);
      setFiscalYear(String(result.fiscalYear || ""));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setParsing(false);
    }
  }

  async function save() {
    if (!parsed) return;
    const yearNum = Number.parseInt(fiscalYear, 10);
    if (!entity.trim() || !Number.isFinite(yearNum)) {
      setError("Entity und Geschäftsjahr erforderlich.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await replaceFn({
        data: {
          entity: entity.trim(),
          fiscalYear: yearNum,
          positions: parsed.positions.map((p) => ({ ...p, source: "pdf" as const })),
          konten: parsed.konten,
        },
      });
      toast.success(
        parsed.warnings.length > 0
          ? `Gespeichert (mit ${parsed.warnings.length} Hinweis(en)).`
          : "Jahresabschluss gespeichert.",
      );
      await qc.invalidateQueries({ queryKey: ["bilanz-years"] });
      await qc.invalidateQueries({ queryKey: ["bilanz-year"] });
      setParsed(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  const allChecksOk = parsed ? parsed.checks.every((c) => c.ok) : false;
  const yearNum = Number.parseInt(fiscalYear, 10);
  const alreadyExists =
    parsed && Number.isFinite(yearNum)
      ? years.some((y) => y.entity === entity.trim() && y.fiscalYear === yearNum)
      : false;

  const posByStmt = useMemo(() => {
    const m: Record<string, number> = { aktiva: 0, passiva: 0, guv: 0 };
    if (parsed) for (const p of parsed.positions) m[p.statement] = (m[p.statement] ?? 0) + 1;
    return m;
  }, [parsed]);
  const kontenByStmt = useMemo(() => {
    const m: Record<string, number> = { aktiva: 0, passiva: 0, guv: 0 };
    if (parsed) for (const k of parsed.konten) m[k.statement] = (m[k.statement] ?? 0) + 1;
    return m;
  }, [parsed]);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle>PDF-Import</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            ETL-ADHOGA-Jahresabschlussbericht (PDF) auswählen. Extraktion + Parsing laufen
            ausschließlich im Browser — das PDF wird nicht hochgeladen.
          </p>
          <input
            type="file"
            accept="application/pdf"
            disabled={parsing}
            onChange={(e) => {
              void handleFile(e.target.files);
              e.currentTarget.value = "";
            }}
            className="block text-sm"
          />
          {parsing && <p className="text-sm text-muted-foreground">Verarbeite PDF…</p>}
        </CardContent>
      </Card>

      {parsed && (
        <>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Kopfdaten</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label className="text-xs">Gesellschaft</Label>
                <Input value={entity} onChange={(e) => setEntity(e.target.value)} />
              </div>
              <div>
                <Label className="text-xs">Geschäftsjahr</Label>
                <Input
                  value={fiscalYear}
                  onChange={(e) => setFiscalYear(e.target.value)}
                  inputMode="numeric"
                />
              </div>
              {alreadyExists && (
                <div className="sm:col-span-2 text-xs text-amber-600">
                  Für {entity} {yearNum} existiert bereits ein Import — Speichern ersetzt den
                  vorhandenen Stand.
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Zähler</CardTitle>
            </CardHeader>
            <CardContent className="text-sm">
              <div className="grid grid-cols-3 gap-3">
                {(["aktiva", "passiva", "guv"] as const).map((s) => (
                  <div key={s}>
                    <div className="text-xs text-muted-foreground uppercase">{s}</div>
                    <div>
                      {posByStmt[s]} Positionen · {kontenByStmt[s]} Konten
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Konsistenz-Gates</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Check</TableHead>
                    <TableHead className="text-right">Soll</TableHead>
                    <TableHead className="text-right">Ist</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {parsed.checks.map((c: BilanzCheck) => (
                    <TableRow key={c.name}>
                      <TableCell className="font-mono text-xs">{c.name}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {fmtEuro(c.expectedCents)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {fmtEuro(c.actualCents)}
                      </TableCell>
                      <TableCell>
                        {c.ok ? (
                          <Badge variant="secondary">ok</Badge>
                        ) : (
                          <Badge variant="destructive">fail</Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {parsed.warnings.length > 0 && (
                <div className="mt-3 text-xs text-muted-foreground">
                  <div className="font-semibold text-amber-600">Hinweise:</div>
                  <ul className="list-disc pl-4 space-y-1">
                    {parsed.warnings.map((w, i) => (
                      <li key={i}>{w}</li>
                    ))}
                  </ul>
                </div>
              )}
            </CardContent>
          </Card>

          {error && (
            <Card className="border-destructive">
              <CardContent className="p-4 text-sm text-destructive whitespace-pre-wrap">
                {error}
              </CardContent>
            </Card>
          )}

          <div className="flex items-center gap-3">
            <Button onClick={save} disabled={!allChecksOk || saving}>
              {saving ? "Speichere…" : alreadyExists ? "Vorhandenen Stand ersetzen" : "Speichern"}
            </Button>
            <Button variant="outline" onClick={() => setParsed(null)} disabled={saving}>
              Verwerfen
            </Button>
            {!allChecksOk && (
              <span className="text-xs text-destructive">
                Alle Gates müssen ok sein, sonst refused der Server.
              </span>
            )}
          </div>
        </>
      )}
    </div>
  );
}
