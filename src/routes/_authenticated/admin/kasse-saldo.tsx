// Tägliche Bargeldübersicht — pro Tag eigenständig (kein Carry-over),
// Bargeld serverseitig via computeDailyCash (cash-ledger.ts).

import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
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
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getCashDailyBreakdown, type CashDailyRow } from "@/lib/cash/cash.functions";
import { buildBargeldXlsx } from "@/lib/cash/bargeld-export";
import { downloadBlob } from "@/lib/time/weekly-export";
import { formatShortDate } from "@/lib/format-date";
import { listLocations } from "@/lib/admin/locations.functions";

export const Route = createFileRoute("/_authenticated/admin/kasse-saldo")({
  head: () => ({ meta: [{ title: "Tägliche Bargeldübersicht" }] }),
  component: KasseSaldoPage,
});

function fmtEuro(cents: number): string {
  return (
    (cents / 100).toLocaleString("de-DE", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }) + " €"
  );
}

const MONTH_NAMES = [
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

type MonthOption = { key: string; label: string; year: number; month: number };

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

function buildMonthOptions(now: Date): MonthOption[] {
  const out: MonthOption[] = [];
  for (let i = 0; i < 13; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const y = d.getFullYear();
    const m = d.getMonth();
    out.push({
      key: `${y}-${pad2(m + 1)}`,
      label: `${MONTH_NAMES[m]} ${y}`,
      year: y,
      month: m,
    });
  }
  return out;
}

function monthRange(year: number, month: number): { fromDate: string; toDate: string } {
  const last = new Date(year, month + 1, 0).getDate();
  return {
    fromDate: `${year}-${pad2(month + 1)}-01`,
    toDate: `${year}-${pad2(month + 1)}-${pad2(last)}`,
  };
}

function KasseSaldoPage() {
  const now = useMemo(() => new Date(), []);
  const months = useMemo(() => buildMonthOptions(now), [now]);
  const [monthKey, setMonthKey] = useState<string>(months[0].key);
  const [locationId, setLocationId] = useState<string>("");

  const selected = months.find((m) => m.key === monthKey) ?? months[0];
  const { fromDate, toDate } = monthRange(selected.year, selected.month);
  const monthLabel = selected.label;

  const fetchLocations = useServerFn(listLocations);
  const locationsQ = useQuery({
    queryKey: ["admin-locations"],
    queryFn: () => fetchLocations(),
  });

  // Default: erster Standort (nicht "Alle").
  useEffect(() => {
    if (!locationId && locationsQ.data && locationsQ.data.length > 0) {
      setLocationId(locationsQ.data[0].id);
    }
  }, [locationId, locationsQ.data]);

  const locationName = useMemo(() => {
    if (!locationId) return "Alle Standorte";
    return locationsQ.data?.find((l) => l.id === locationId)?.name ?? "Standort";
  }, [locationId, locationsQ.data]);

  const fetchBreakdown = useServerFn(getCashDailyBreakdown);
  const q = useQuery({
    queryKey: ["cash-daily-breakdown", fromDate, toDate, locationId],
    queryFn: () =>
      fetchBreakdown({
        data: locationId ? { fromDate, toDate, locationId } : { fromDate, toDate },
      }),
  });

  const rows: CashDailyRow[] = useMemo(() => q.data ?? [], [q.data]);

  const totals = useMemo(() => {
    const t = {
      tagesumsatz: 0,
      kreditkarten: 0,
      souse: 0,
      wolt: 0,
      vouchersRedeemed: 0,
      finedine: 0,
      vouchersSold: 0,
      einladung: 0,
      openInvoices: 0,
      vorschuss: 0,
      expenses: 0,
      bargeld: 0,
    };
    for (const r of rows) {
      t.tagesumsatz += r.tagesumsatzCents;
      t.kreditkarten += r.kreditkartenCents;
      t.souse += r.deliverySouseCents;
      t.wolt += r.deliveryWoltCents;
      t.vouchersRedeemed += r.vouchersRedeemedCents;
      t.finedine += r.finedineCents;
      t.vouchersSold += r.vouchersSoldCents;
      t.einladung += r.einladungCents;
      t.openInvoices += r.openInvoicesCents;
      t.vorschuss += r.vorschussCents;
      t.expenses += r.expensesCents;
      t.bargeld += r.bargeldCents;
    }
    return t;
  }, [rows]);

  async function handleExport() {
    const label = `${monthLabel} – ${locationName}`;
    const blob = await buildBargeldXlsx(rows, label);
    const safe = locationName.replace(/[\s/\\]+/g, "_");
    downloadBlob(blob, `bargeld_uebersicht_${safe}_${fromDate}_bis_${toDate}.xlsx`);
  }

  const bargeldClass = (cents: number) =>
    "text-right tabular-nums " + (cents < 0 ? "text-destructive" : "text-emerald-600");

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            Tägliche Bargeldübersicht
          </h1>
          <p className="text-sm text-muted-foreground">
            Bargeld pro Tag eigenständig berechnet (kein Carry-over).
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <Select value={locationId || "__all__"} onValueChange={(v) => setLocationId(v === "__all__" ? "" : v)}>
            <SelectTrigger className="w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">Alle Standorte</SelectItem>
              {(locationsQ.data ?? []).map((l) => (
                <SelectItem key={l.id} value={l.id}>
                  {l.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={monthKey} onValueChange={setMonthKey}>
            <SelectTrigger className="w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {months.map((m) => (
                <SelectItem key={m.key} value={m.key}>
                  {m.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="outline" disabled={rows.length === 0} onClick={handleExport}>
            Export Excel
          </Button>
        </div>
      </div>

      <Card>
        {q.isLoading && <div className="p-6 text-sm text-muted-foreground">Lade…</div>}
        {q.isError && (
          <div className="p-6 text-sm text-destructive">
            {(q.error as Error).message ?? "Fehler beim Laden."}
          </div>
        )}
        {!q.isLoading && !q.isError && rows.length === 0 && (
          <div className="p-6 text-sm text-muted-foreground">
            Keine Sessions im gewählten Monat.
          </div>
        )}
        {!q.isLoading && !q.isError && rows.length > 0 && (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Datum</TableHead>
                <TableHead className="text-right">Tagesumsatz</TableHead>
                <TableHead className="text-right">Kreditkarten</TableHead>
                <TableHead className="text-right">OrderSmart</TableHead>
                <TableHead className="text-right">Wolt</TableHead>
                <TableHead className="text-right">Gutsch. EL</TableHead>
                <TableHead className="text-right">FineDine</TableHead>
                <TableHead className="text-right">Gutsch. VK</TableHead>
                <TableHead className="text-right">Einladung</TableHead>
                <TableHead className="text-right">Offene RE</TableHead>
                <TableHead className="text-right">Vorschuss</TableHead>
                <TableHead className="text-right">Ausgaben</TableHead>
                <TableHead className="text-right">Bargeld</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.businessDate}>
                  <TableCell>{formatShortDate(r.businessDate)}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {fmtEuro(r.tagesumsatzCents)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {fmtEuro(r.kreditkartenCents)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {fmtEuro(r.deliverySouseCents)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {fmtEuro(r.deliveryWoltCents)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {fmtEuro(r.vouchersRedeemedCents)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {fmtEuro(r.finedineCents)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {fmtEuro(r.vouchersSoldCents)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {fmtEuro(r.einladungCents)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {fmtEuro(r.openInvoicesCents)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {fmtEuro(r.vorschussCents)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {fmtEuro(r.expensesCents)}
                  </TableCell>
                  <TableCell className={bargeldClass(r.bargeldCents)}>
                    {fmtEuro(r.bargeldCents)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
            <TableFooter>
              <TableRow>
                <TableCell>Summe</TableCell>
                <TableCell className="text-right tabular-nums">
                  {fmtEuro(totals.tagesumsatz)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {fmtEuro(totals.kreditkarten)}
                </TableCell>
                <TableCell className="text-right tabular-nums">{fmtEuro(totals.souse)}</TableCell>
                <TableCell className="text-right tabular-nums">{fmtEuro(totals.wolt)}</TableCell>
                <TableCell className="text-right tabular-nums">
                  {fmtEuro(totals.vouchersRedeemed)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {fmtEuro(totals.finedine)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {fmtEuro(totals.vouchersSold)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {fmtEuro(totals.einladung)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {fmtEuro(totals.openInvoices)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {fmtEuro(totals.vorschuss)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {fmtEuro(totals.expenses)}
                </TableCell>
                <TableCell className={bargeldClass(totals.bargeld)}>
                  {fmtEuro(totals.bargeld)}
                </TableCell>
              </TableRow>
            </TableFooter>
          </Table>
        )}
      </Card>
    </div>
  );
}
