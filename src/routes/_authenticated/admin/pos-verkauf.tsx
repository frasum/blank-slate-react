// PV1/PV2 — POS-Verkauf: Artikel-Verkaufsstatistik je Standort (letzte 365
// Tage & Gesamt) mit kaskadierendem Gruppen-Filter aus VA2, manueller
// WG-Zuordnung (PV1) und XLSX-Upload mit Review-Screen (PV2, admin-only).

import { useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  clearSalesStatsGroupOverride,
  listSalesStats,
  replacePosSalesStats,
  setSalesStatsGroupOverride,
} from "@/lib/bestellung/sales-stats.functions";
import { listLocations } from "@/lib/admin/locations.functions";
import { LocationPills } from "@/components/shared/LocationPills";
import { SalesGroupFilter } from "@/components/bestellung/SalesGroupFilter";
import {
  ALL,
  deriveWgOptions,
  matchesHaupt,
  matchesUnter,
  matchesWg,
  UNMATCHED,
} from "@/lib/bestellung/sales-group-filter";
import { averagePriceCents, type EnrichedStatRow } from "@/lib/bestellung/sales-stats";
import {
  allChecksOk,
  footerForServer,
  parsePosReport,
  type ParsedPosReport,
} from "@/lib/bestellung/pos-report-parser";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "sonner";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PosNav } from "@/components/bestellung/PosNav";

export const Route = createFileRoute("/_authenticated/admin/pos-verkauf")({
  head: () => ({ meta: [{ title: "POS-Verkauf · Bestellung" }] }),
  component: PosVerkaufPage,
});

type Period = "d365" | "alltime";
type SortKey = "nummer" | "name" | "warengruppe" | "count" | "umsatz" | "avg";
type SortDir = "asc" | "desc";

const dateFmt = new Intl.DateTimeFormat("de-DE", { dateStyle: "medium" });
const eurFmt = new Intl.NumberFormat("de-DE", {
  style: "currency",
  currency: "EUR",
});
const intFmt = new Intl.NumberFormat("de-DE");

function formatEurFromCents(cents: number | null): string {
  if (cents === null) return "—";
  return eurFmt.format(cents / 100);
}

function PosVerkaufPage() {
  const callList = useServerFn(listSalesStats);
  const callSet = useServerFn(setSalesStatsGroupOverride);
  const callClear = useServerFn(clearSalesStatsGroupOverride);
  const callReplace = useServerFn(replacePosSalesStats);
  const queryClient = useQueryClient();
  const auth = useAuth();
  const isAdmin = auth.identity?.role === "admin";

  const locationsQ = useQuery({
    queryKey: ["locations"],
    queryFn: () => listLocations(),
  });
  const locations = useMemo(() => locationsQ.data ?? [], [locationsQ.data]);

  const [locationId, setLocationId] = useState<string>("");
  useEffect(() => {
    if (!locationId && locations.length > 0) setLocationId(locations[0].id);
  }, [locations, locationId]);

  const [period, setPeriod] = useState<Period>("d365");

  const statsQ = useQuery({
    queryKey: ["sales-stats", locationId, period],
    queryFn: () => callList({ data: { locationId, period } }),
    enabled: !!locationId,
  });

  const setOverrideMut = useMutation({
    mutationFn: (input: { nummer: number; warengruppeKey: string }) =>
      callSet({ data: { locationId, nummer: input.nummer, warengruppeKey: input.warengruppeKey } }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sales-stats", locationId] });
    },
  });
  const clearOverrideMut = useMutation({
    mutationFn: (input: { nummer: number }) =>
      callClear({ data: { locationId, nummer: input.nummer } }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sales-stats", locationId] });
    },
  });

  const [search, setSearch] = useState("");
  const [haupt, setHaupt] = useState<string>(ALL);
  const [unter, setUnter] = useState<string>(ALL);
  const [wg, setWg] = useState<string>(ALL);
  const [sortKey, setSortKey] = useState<SortKey>("umsatz");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [onlyNeedsAssignment, setOnlyNeedsAssignment] = useState(false);

  // Wenn Filter „Ohne Zuordnung" aktiv ist, sind Unter/WG sinnlos → auf ALL.
  useEffect(() => {
    if (haupt === UNMATCHED) {
      if (unter !== ALL) setUnter(ALL);
      if (wg !== ALL) setWg(ALL);
    }
  }, [haupt, unter, wg]);

  const rows = useMemo<EnrichedStatRow[]>(() => statsQ.data?.rows ?? [], [statsQ.data]);
  const reportDate = statsQ.data?.reportDate ?? null;
  const unmatchedCount = statsQ.data?.unmatchedCount ?? 0;

  // „Handlungsbedarf" = keine echte Vectron-Warengruppe (nur #Nummer oder gar nichts).
  // Overrides zählen als zugeordnet, weil sie eine warengruppe setzen.
  const needsAssignmentCount = useMemo(() => rows.filter((r) => !r.warengruppe).length, [rows]);

  // Zuordnungs-Optionen: alle WG-Werte, die aus Namens-Matches oder Overrides
  // bereits an POS-Zeilen hängen. Bewusst aus den enriched rows, damit die
  // Liste zum Standort passt (statt separatem sales_articles-Fetch).
  const assignableWgOptions = useMemo(
    () => deriveWgOptions(rows.filter((r) => r.warengruppe !== null || r.productGroup !== null)),
    [rows],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (onlyNeedsAssignment && r.warengruppe) return false;
      if (haupt === UNMATCHED) {
        if (!r.unmatched) return false;
      } else if (haupt !== ALL) {
        if (!matchesHaupt(r, haupt)) return false;
      }
      if (unter !== ALL && !matchesUnter(r, unter)) return false;
      if (wg !== ALL && !matchesWg(r, wg)) return false;
      if (q) {
        const inName = r.name.toLowerCase().includes(q);
        const inNummer = String(r.nummer).includes(q);
        if (!inName && !inNummer) return false;
      }
      return true;
    });
  }, [rows, search, haupt, unter, wg, onlyNeedsAssignment]);

  const sorted = useMemo(() => {
    const arr = [...filtered];
    const dir = sortDir === "asc" ? 1 : -1;
    arr.sort((a, b) => {
      const cmp = (() => {
        switch (sortKey) {
          case "nummer":
            return a.nummer - b.nummer;
          case "name":
            return a.name.localeCompare(b.name, "de");
          case "warengruppe": {
            const ax = a.warengruppe ?? "\uFFFF";
            const bx = b.warengruppe ?? "\uFFFF";
            return ax.localeCompare(bx, "de");
          }
          case "count":
            return a.verkaufCount - b.verkaufCount;
          case "umsatz":
            return a.umsatzCents - b.umsatzCents;
          case "avg": {
            const av = averagePriceCents(a.umsatzCents, a.verkaufCount);
            const bv = averagePriceCents(b.umsatzCents, b.verkaufCount);
            if (av === null && bv === null) return 0;
            if (av === null) return 1;
            if (bv === null) return -1;
            return av - bv;
          }
        }
      })();
      return cmp * dir;
    });
    return arr;
  }, [filtered, sortKey, sortDir]);

  const totalCount = useMemo(() => filtered.reduce((s, r) => s + r.verkaufCount, 0), [filtered]);
  const totalUmsatz = useMemo(() => filtered.reduce((s, r) => s + r.umsatzCents, 0), [filtered]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setSortDir(key === "name" || key === "warengruppe" ? "asc" : "desc");
    }
  }

  const hasData = rows.length > 0;

  return (
    <div className="space-y-4">
      <PosNav />
      <div>
        <h2 className="text-lg font-semibold text-foreground">POS-Verkauf</h2>
        <p className="text-sm text-muted-foreground">
          Vectron-Artikelberichte je Standort mit den Gruppenebenen aus den Verkaufsartikeln.
        </p>
      </div>

      <LocationPills locations={locations} value={locationId} onChange={setLocationId} />

      <div className="flex flex-wrap items-center gap-3">
        <Tabs value={period} onValueChange={(v) => setPeriod(v as Period)}>
          <TabsList>
            <TabsTrigger value="d365">Letzte 365 Tage</TabsTrigger>
            <TabsTrigger value="alltime">Gesamt (seit Aufzeichnung)</TabsTrigger>
          </TabsList>
        </Tabs>
        {reportDate && (
          <span className="rounded-md border border-border bg-muted/40 px-2 py-1 text-xs text-muted-foreground">
            Stand: {dateFmt.format(new Date(reportDate))}
          </span>
        )}
        {unmatchedCount > 0 && (
          <button
            type="button"
            onClick={() => setHaupt(UNMATCHED)}
            className="rounded-md border border-amber-300 bg-amber-50 px-2 py-1 text-xs font-medium text-amber-900 hover:bg-amber-100 focus:outline-none focus:ring-1 focus:ring-ring dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-200"
            title="Filter auf Artikel ohne Gruppenzuordnung setzen"
          >
            {intFmt.format(unmatchedCount)} Artikel ohne Gruppenzuordnung
          </button>
        )}
        {isAdmin && (
          <div className="ml-auto">
            <PosImportDialog
              locationId={locationId}
              period={period}
              onReplace={(input) => callReplace({ data: input })}
              onDone={() => {
                queryClient.invalidateQueries({ queryKey: ["sales-stats", locationId] });
              }}
            />
          </div>
        )}
      </div>

      {statsQ.isError && (
        <Alert variant="destructive">
          <AlertTitle>Fehler</AlertTitle>
          <AlertDescription>
            {statsQ.error instanceof Error ? statsQ.error.message : "Fehler beim Laden."}
          </AlertDescription>
        </Alert>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Suche nach Nummer oder Name…"
          className="w-64 rounded-md border border-input bg-background px-3 py-2 text-sm"
        />
        <SalesGroupFilter
          rows={rows}
          haupt={haupt}
          setHaupt={setHaupt}
          unter={unter}
          setUnter={setUnter}
          wg={wg}
          setWg={setWg}
          extraHauptOption={{ value: UNMATCHED, label: "Ohne Zuordnung" }}
        />
        <button
          type="button"
          onClick={() => setOnlyNeedsAssignment((v) => !v)}
          aria-pressed={onlyNeedsAssignment}
          disabled={needsAssignmentCount === 0}
          className={
            onlyNeedsAssignment
              ? "rounded-md border border-amber-400 bg-amber-100 px-2 py-1 text-xs font-medium text-amber-900 hover:bg-amber-200 focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-50 dark:border-amber-500/60 dark:bg-amber-900/40 dark:text-amber-100"
              : "rounded-md border border-border bg-background px-2 py-1 text-xs text-muted-foreground hover:text-foreground focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-50"
          }
          title="Zeigt nur Artikel ohne echte Vectron-Warengruppe — das sind die tatsächlichen To-dos."
        >
          Nur ohne Warengruppe ({intFmt.format(needsAssignmentCount)})
        </button>
      </div>

      {statsQ.isLoading ? (
        <p className="text-sm text-muted-foreground">Lädt …</p>
      ) : !hasData ? (
        <div className="rounded-md border border-dashed border-border bg-muted/20 p-6 text-sm text-muted-foreground">
          Noch keine POS-Verkaufsdaten importiert.
        </div>
      ) : sorted.length === 0 ? (
        <p className="text-sm text-muted-foreground">Keine Artikel für den Filter.</p>
      ) : (
        <div className="rounded-md border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <SortableHead
                  label="Nr."
                  colKey="nummer"
                  sortKey={sortKey}
                  sortDir={sortDir}
                  onClick={toggleSort}
                  className="w-20"
                />
                <SortableHead
                  label="Artikel"
                  colKey="name"
                  sortKey={sortKey}
                  sortDir={sortDir}
                  onClick={toggleSort}
                />
                <SortableHead
                  label="Warengruppe"
                  colKey="warengruppe"
                  sortKey={sortKey}
                  sortDir={sortDir}
                  onClick={toggleSort}
                  className="w-40"
                />
                <SortableHead
                  label="Verkauft"
                  colKey="count"
                  sortKey={sortKey}
                  sortDir={sortDir}
                  onClick={toggleSort}
                  className="w-28 text-right"
                />
                <SortableHead
                  label="Umsatz"
                  colKey="umsatz"
                  sortKey={sortKey}
                  sortDir={sortDir}
                  onClick={toggleSort}
                  className="w-36 text-right"
                />
                <SortableHead
                  label="Ø-Preis"
                  colKey="avg"
                  sortKey={sortKey}
                  sortDir={sortDir}
                  onClick={toggleSort}
                  className="w-28 text-right"
                />
              </TableRow>
            </TableHeader>
            <TableBody>
              {sorted.map((r) => {
                const avg = averagePriceCents(r.umsatzCents, r.verkaufCount);
                return (
                  <TableRow key={r.id}>
                    <TableCell className="tabular-nums text-muted-foreground">
                      {intFmt.format(r.nummer)}
                    </TableCell>
                    <TableCell className="font-medium">{r.name}</TableCell>
                    <TableCell className="text-muted-foreground">
                      <AssignCell
                        row={r}
                        options={assignableWgOptions}
                        onAssign={(warengruppeKey) =>
                          setOverrideMut.mutate({ nummer: r.nummer, warengruppeKey })
                        }
                        onClear={() => clearOverrideMut.mutate({ nummer: r.nummer })}
                        busy={setOverrideMut.isPending || clearOverrideMut.isPending}
                      />
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {intFmt.format(r.verkaufCount)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatEurFromCents(r.umsatzCents)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">
                      {formatEurFromCents(avg)}
                    </TableCell>
                  </TableRow>
                );
              })}
              <TableRow className="border-t-2 border-border bg-muted/30 font-semibold">
                <TableCell />
                <TableCell>Summe (Filter)</TableCell>
                <TableCell />
                <TableCell className="text-right tabular-nums">
                  {intFmt.format(totalCount)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatEurFromCents(totalUmsatz)}
                </TableCell>
                <TableCell />
              </TableRow>
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

// ============================ PV2: Import-Dialog ============================

type ReplaceInput = {
  locationId: string;
  period: Period;
  reportDate: string;
  rows: { nummer: number; name: string; verkaufCount: number; umsatzCents: number }[];
  footer: { verkaufCount: number; umsatzCents: number };
};

function todayIso(): string {
  const fmt = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Berlin" });
  return fmt.format(new Date());
}

async function extractSheetRows(file: File): Promise<(string | number | null)[][]> {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(await file.arrayBuffer());
  const ws = wb.worksheets[0];
  if (!ws) throw new Error("Datei enthält kein Arbeitsblatt.");
  const rows: (string | number | null)[][] = [];
  ws.eachRow({ includeEmpty: true }, (row) => {
    const cells: (string | number | null)[] = [];
    // ExcelJS liefert 1-basierten Index; wir iterieren nach cellCount, um die
    // Ausrichtung der Kopfzeile zu erhalten (findHeader arbeitet mit Positionen).
    const max = row.cellCount;
    for (let c = 1; c <= max; c++) {
      const cell = row.getCell(c);
      const v = cell.value as unknown;
      if (v === null || v === undefined) cells.push(null);
      else if (typeof v === "number" || typeof v === "string") cells.push(v);
      else if (typeof v === "object") {
        const o = v as { text?: string; result?: number | string };
        if (typeof o.text === "string") cells.push(o.text);
        else if (typeof o.result === "number" || typeof o.result === "string") cells.push(o.result);
        else cells.push(String(v));
      } else cells.push(String(v));
    }
    rows.push(cells);
  });
  return rows;
}

function checkLabel(name: string): string {
  switch (name) {
    case "footer_stueck":
      return "Kontrollsumme Stück (Fußzeile)";
    case "footer_umsatz":
      return "Kontrollsumme Umsatz (Fußzeile)";
    case "nummer_unique":
      return "Artikelnummern eindeutig";
    default:
      return name;
  }
}

function formatCheckValue(name: string, value: number): string {
  if (name === "footer_umsatz") return eurFmt.format(value / 100);
  return intFmt.format(value);
}

function PosImportDialog({
  locationId,
  period,
  onReplace,
  onDone,
}: {
  locationId: string;
  period: Period;
  onReplace: (input: ReplaceInput) => Promise<unknown>;
  onDone: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [pickedPeriod, setPickedPeriod] = useState<Period>(period);
  const [reportDate, setReportDate] = useState<string>(todayIso());
  const [file, setFile] = useState<File | null>(null);
  const [parsed, setParsed] = useState<ParsedPosReport | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  function reset() {
    setFile(null);
    setParsed(null);
    setParseError(null);
    setServerError(null);
  }

  // Beim Öffnen aktuelle Werte aus dem Elternzustand übernehmen.
  useEffect(() => {
    if (open) {
      setPickedPeriod(period);
      setReportDate(todayIso());
      reset();
    }
  }, [open, period]);

  async function handleFile(f: File) {
    setFile(f);
    setParsed(null);
    setParseError(null);
    setServerError(null);
    try {
      const raw = await extractSheetRows(f);
      setParsed(parsePosReport(raw));
    } catch (e) {
      setParseError(e instanceof Error ? e.message : "Datei konnte nicht gelesen werden.");
    }
  }

  const canSubmit = !!parsed && allChecksOk(parsed) && !!locationId && !busy;

  async function handleSubmit() {
    if (!parsed || !locationId) return;
    const footer = footerForServer(parsed);
    if (!footer) return;
    setBusy(true);
    setServerError(null);
    try {
      await onReplace({
        locationId,
        period: pickedPeriod,
        reportDate,
        rows: parsed.rows,
        footer,
      });
      toast.success(
        `Import gespeichert: ${intFmt.format(parsed.rows.length)} Artikel, ${intFmt.format(
          footer.verkaufCount,
        )} Stk / ${eurFmt.format(footer.umsatzCents / 100)}.`,
      );
      onDone();
      setOpen(false);
    } catch (e) {
      setServerError(e instanceof Error ? e.message : "Import fehlgeschlagen.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" disabled={!locationId}>
          XLSX importieren…
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>POS-Verkauf importieren</DialogTitle>
          <DialogDescription>
            Vectron-Artikelbericht (XLSX) einlesen, Kontrollsummen prüfen und Standort × Periode
            ersetzen. Die Datei bleibt im Browser — nur die geprüften Zeilen gehen an den Server.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label>Periode</Label>
            <Select value={pickedPeriod} onValueChange={(v) => setPickedPeriod(v as Period)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="d365">Letzte 365 Tage</SelectItem>
                <SelectItem value="alltime">Gesamt (seit Aufzeichnung)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Stichtag</Label>
            <Input
              type="date"
              value={reportDate}
              max={todayIso()}
              onChange={(e) => setReportDate(e.target.value)}
            />
          </div>
        </div>

        <div className="space-y-1">
          <Label>Datei</Label>
          <Input
            type="file"
            accept=".xlsx"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void handleFile(f);
            }}
          />
          {file && (
            <p className="text-xs text-muted-foreground">
              {file.name} ({Math.round(file.size / 1024)} kB)
            </p>
          )}
        </div>

        {parseError && (
          <Alert variant="destructive">
            <AlertTitle>Datei nicht lesbar</AlertTitle>
            <AlertDescription>{parseError}</AlertDescription>
          </Alert>
        )}

        {parsed && (
          <div className="space-y-3">
            <div className="grid grid-cols-3 gap-3 text-sm">
              <SummaryCard label="Artikel" value={intFmt.format(parsed.rows.length)} />
              <SummaryCard
                label="Σ Stück"
                value={intFmt.format(parsed.rows.reduce((s, r) => s + r.verkaufCount, 0))}
              />
              <SummaryCard
                label="Σ Umsatz"
                value={eurFmt.format(parsed.rows.reduce((s, r) => s + r.umsatzCents, 0) / 100)}
              />
            </div>

            <div className="rounded-md border border-border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Prüfung</TableHead>
                    <TableHead className="text-right">Soll (Fußzeile)</TableHead>
                    <TableHead className="text-right">Ist</TableHead>
                    <TableHead className="w-16 text-right">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {parsed.checks.map((c) => (
                    <TableRow key={c.name}>
                      <TableCell>{checkLabel(c.name)}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatCheckValue(c.name, c.expected)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatCheckValue(c.name, c.actual)}
                      </TableCell>
                      <TableCell className="text-right">
                        {c.ok ? (
                          <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-xs font-medium text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200">
                            OK
                          </span>
                        ) : (
                          <span className="rounded bg-destructive/10 px-1.5 py-0.5 text-xs font-medium text-destructive">
                            Fehler
                          </span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            {parsed.skipped.length > 0 && (
              <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm dark:border-amber-900/50 dark:bg-amber-950/40">
                <p className="font-medium text-amber-900 dark:text-amber-200">
                  {parsed.skipped.length} Zeile(n) übersprungen (namenlose PLU)
                </p>
                <ul className="mt-1 list-disc pl-5 text-xs text-amber-900/80 dark:text-amber-200/80">
                  {parsed.skipped.slice(0, 8).map((s, i) => (
                    <li key={i}>
                      Nr. {s.nummer ?? "?"} · {intFmt.format(s.verkaufCount)} Stk ·{" "}
                      {eurFmt.format(s.umsatzCents / 100)}
                    </li>
                  ))}
                  {parsed.skipped.length > 8 && <li>… und weitere</li>}
                </ul>
              </div>
            )}

            {parsed.warnings.length > 0 && (
              <details className="rounded-md border border-border bg-muted/30 p-3 text-xs text-muted-foreground">
                <summary className="cursor-pointer font-medium text-foreground">
                  {parsed.warnings.length} Warnung(en)
                </summary>
                <ul className="mt-2 list-disc pl-5">
                  {parsed.warnings.map((w, i) => (
                    <li key={i}>{w}</li>
                  ))}
                </ul>
              </details>
            )}
          </div>
        )}

        {serverError && (
          <Alert variant="destructive">
            <AlertTitle>Import abgelehnt</AlertTitle>
            <AlertDescription>{serverError}</AlertDescription>
          </Alert>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)} disabled={busy}>
            Abbrechen
          </Button>
          <Button onClick={handleSubmit} disabled={!canSubmit}>
            {busy ? "Speichere…" : "Speichern & ersetzen"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border bg-muted/30 p-2">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-base font-semibold tabular-nums">{value}</div>
    </div>
  );
}

function SortableHead({
  label,
  colKey,
  sortKey,
  sortDir,
  onClick,
  className,
}: {
  label: string;
  colKey: SortKey;
  sortKey: SortKey;
  sortDir: SortDir;
  onClick: (k: SortKey) => void;
  className?: string;
}) {
  const active = sortKey === colKey;
  const arrow = active ? (sortDir === "asc" ? " ↑" : " ↓") : "";
  return (
    <TableHead className={className}>
      <button
        type="button"
        onClick={() => onClick(colKey)}
        className="font-inherit inline-flex items-center gap-1 hover:text-foreground"
      >
        {label}
        <span className="text-xs text-muted-foreground">{arrow}</span>
      </button>
    </TableHead>
  );
}

function AssignCell({
  row,
  options,
  onAssign,
  onClear,
  busy,
}: {
  row: EnrichedStatRow;
  options: { value: string; label: string }[];
  onAssign: (warengruppeKey: string) => void;
  onClear: () => void;
  busy: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [pick, setPick] = useState<string>("");

  const currentLabel =
    row.warengruppe ?? (row.productGroup !== null ? `#${row.productGroup}` : null);

  // Drei UI-Zustände:
  //  - overridden       → „Ändern" (dezent, blau markiert am Label)
  //  - warengruppe da   → „Korrigieren" (dezent; kommt aus Vectron, optionaler Override)
  //  - sonst            → „Zuordnen" (auffällig amber; echtes To-do)
  const hasVectronGroup = row.warengruppe !== null && !row.overridden;
  const buttonLabel = row.overridden ? "Ändern" : hasVectronGroup ? "Korrigieren" : "Zuordnen";
  const buttonNeedsAttention = !row.overridden && !hasVectronGroup;
  const buttonTitle = row.overridden
    ? "Aktuelle Zuordnung ist ein manueller Override — Ändern öffnet die Auswahl."
    : hasVectronGroup
      ? "Warengruppe kommt aus Vectron und ist aktiv — nur überschreiben, wenn sie falsch ist."
      : "Diesem Artikel ist keine Warengruppe zugeordnet — bitte Warengruppe wählen.";
  const buttonClass = buttonNeedsAttention
    ? "rounded-md border border-amber-400 bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-900 hover:bg-amber-100 focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-50 dark:border-amber-500/60 dark:bg-amber-950/40 dark:text-amber-100"
    : "rounded-md border border-input bg-background px-2 py-0.5 text-xs text-muted-foreground hover:text-foreground focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-50";

  return (
    <div className="flex items-center gap-2">
      {currentLabel ? (
        <span
          className={
            row.overridden
              ? "rounded-md border border-primary/40 bg-primary/10 px-1.5 py-0.5 text-xs font-medium text-primary"
              : ""
          }
          title={row.productGroup !== null ? `Nr. ${row.productGroup}` : undefined}
        >
          {currentLabel}
        </span>
      ) : (
        <span className="text-muted-foreground">—</span>
      )}

      <Popover
        open={open}
        onOpenChange={(v) => {
          setOpen(v);
          if (v) setPick("");
        }}
      >
        <PopoverTrigger asChild>
          <button type="button" className={buttonClass} disabled={busy} title={buttonTitle}>
            {buttonLabel}
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-64 space-y-2">
          <div className="text-xs text-muted-foreground">
            Nr. {row.nummer} · {row.name}
          </div>
          <Select value={pick} onValueChange={setPick}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Warengruppe wählen…" />
            </SelectTrigger>
            <SelectContent>
              {options.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="flex items-center justify-between gap-2 pt-1">
            {row.overridden ? (
              <button
                type="button"
                onClick={() => {
                  onClear();
                  setOpen(false);
                }}
                disabled={busy}
                className="text-xs text-destructive hover:underline disabled:opacity-50"
              >
                Zuordnung aufheben
              </button>
            ) : (
              <span />
            )}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-md border border-input bg-background px-2 py-1 text-xs"
              >
                Abbrechen
              </button>
              <button
                type="button"
                onClick={() => {
                  if (pick) {
                    onAssign(pick);
                    setOpen(false);
                  }
                }}
                disabled={!pick || busy}
                className="rounded-md bg-primary px-2 py-1 text-xs font-medium text-primary-foreground disabled:opacity-50"
              >
                Speichern
              </button>
            </div>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
