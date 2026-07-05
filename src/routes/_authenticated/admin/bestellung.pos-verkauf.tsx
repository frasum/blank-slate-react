// PV1 — POS-Verkauf: Artikel-Verkaufsstatistik je Standort (letzte 365 Tage
// & Gesamt) mit kaskadierendem Gruppen-Filter aus VA2. Kein Upload-UI — der
// Import läuft weiterhin per Frank-SQL (Replace je Standort × Periode).

import { useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  clearSalesStatsGroupOverride,
  listSalesStats,
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

export const Route = createFileRoute("/_authenticated/admin/bestellung/pos-verkauf")({
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

  const [search, setSearch] = useState("");
  const [haupt, setHaupt] = useState<string>(ALL);
  const [unter, setUnter] = useState<string>(ALL);
  const [wg, setWg] = useState<string>(ALL);
  const [sortKey, setSortKey] = useState<SortKey>("umsatz");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

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

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
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
  }, [rows, search, haupt, unter, wg]);

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
                    <TableCell
                      className="text-muted-foreground"
                      title={r.productGroup !== null ? `Nr. ${r.productGroup}` : undefined}
                    >
                      {r.warengruppe ?? (r.productGroup !== null ? `#${r.productGroup}` : "—")}
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
