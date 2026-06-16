// B3c-2 — Kassensaldo-Ansicht mit Carry-over und CSV-Export.
//
// Reines Lese-UI auf getCashLedger. Saldokette wird serverseitig in
// cash-ledger.ts berechnet; hier nur Anzeige + Export.

import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getCashLedger, type CashLedgerRow } from "@/lib/cash/cash.functions";
import { formatShortDate } from "@/lib/format-date";

export const Route = createFileRoute("/_authenticated/admin/kasse-saldo")({
  head: () => ({ meta: [{ title: "Kassensaldo" }] }),
  component: KasseSaldoPage,
});

function fmtEuro(cents: number): string {
  return (cents / 100).toLocaleString("de-DE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function fmtEuroCsv(cents: number): string {
  // Dezimalkomma, keine Tausendertrennung (CSV-freundlich).
  return (cents / 100).toFixed(2).replace(".", ",");
}

function monthStartIso(d: Date): string {
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
}
function todayIso(d: Date): string {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).toISOString().slice(0, 10);
}

function buildCsv(rows: CashLedgerRow[]): string {
  const header = [
    "Datum",
    "Status",
    "Anfangssaldo",
    "Einnahmen",
    "Ausgaben",
    "Tagessaldo",
    "Differenz",
    "Kassenist",
    "Tresor ±",
    "Tresorbestand",
  ].join(";");
  const body = rows.map((r) =>
    [
      r.businessDate,
      r.status,
      fmtEuroCsv(r.openingBalanceCents),
      fmtEuroCsv(r.totalRevenueCents),
      fmtEuroCsv(r.totalExpensesCents),
      fmtEuroCsv(r.closingBalanceCents),
      fmtEuroCsv(r.differenzCents),
      r.cashActualCents === null ? "" : fmtEuroCsv(r.cashActualCents),
      r.surplusCents !== null && r.surplusCents > 0
        ? fmtEuroCsv(r.surplusCents)
        : r.shortfallCents !== null && r.shortfallCents > 0
          ? fmtEuroCsv(-r.shortfallCents)
          : "",
      fmtEuroCsv(r.safeBalanceCents),
    ].join(";"),
  );
  return "\uFEFF" + [header, ...body].join("\r\n") + "\r\n";
}

function KasseSaldoPage() {
  const now = new Date();
  const [fromDate, setFromDate] = useState<string>(monthStartIso(now));
  const [toDate, setToDate] = useState<string>(todayIso(now));

  const fetchLedger = useServerFn(getCashLedger);
  const q = useQuery({
    queryKey: ["cash-ledger", fromDate, toDate],
    queryFn: () => fetchLedger({ data: { fromDate, toDate } }),
    enabled: fromDate <= toDate,
  });

  const rows: CashLedgerRow[] = useMemo(() => q.data ?? [], [q.data]);

  const totals = useMemo(() => {
    let rev = 0;
    let exp = 0;
    let diff = 0;
    for (const r of rows) {
      rev += r.totalRevenueCents;
      exp += r.totalExpensesCents;
      diff += r.differenzCents;
    }
    return { rev, exp, diff };
  }, [rows]);

  function handleExport() {
    const csv = buildCsv(rows);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `kassensaldo_${fromDate}_bis_${toDate}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Kassensaldo</h1>
          <p className="text-sm text-muted-foreground">
            Saldokette mit Carry-over über den gewählten Zeitraum.
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <Label htmlFor="from">Von</Label>
            <Input
              id="from"
              type="date"
              value={fromDate}
              max={toDate}
              onChange={(e) => setFromDate(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="to">Bis</Label>
            <Input
              id="to"
              type="date"
              value={toDate}
              min={fromDate}
              onChange={(e) => setToDate(e.target.value)}
            />
          </div>
          <Button variant="outline" disabled={rows.length === 0} onClick={handleExport}>
            Export CSV
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
            Keine Sessions im gewählten Zeitraum.
          </div>
        )}
        {!q.isLoading && !q.isError && rows.length > 0 && (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Datum</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Anfangssaldo</TableHead>
                <TableHead className="text-right">Einnahmen</TableHead>
                <TableHead className="text-right">Ausgaben</TableHead>
                <TableHead className="text-right">Tagessaldo</TableHead>
                <TableHead className="text-right">Kassenist</TableHead>
                <TableHead className="text-right">Tresor ±</TableHead>
                <TableHead className="text-right">Tresorbestand</TableHead>
                <TableHead className="text-right">Differenz</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => {
                const negDiff = r.differenzCents < 0;
                const locked = r.status === "locked";
                return (
                  <TableRow
                    key={r.businessDate}
                    className={locked ? "italic text-muted-foreground" : undefined}
                  >
                     <TableCell>{formatShortDate(r.businessDate)}</TableCell>
                    <TableCell>{r.status}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {fmtEuro(r.openingBalanceCents)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {fmtEuro(r.totalRevenueCents)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {fmtEuro(r.totalExpensesCents)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {fmtEuro(r.closingBalanceCents)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">
                      {r.cashActualCents === null ? "—" : fmtEuro(r.cashActualCents)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {r.surplusCents !== null && r.surplusCents > 0 ? (
                        <span className="text-emerald-600">+{fmtEuro(r.surplusCents)}</span>
                      ) : r.shortfallCents !== null && r.shortfallCents > 0 ? (
                        <span className="text-destructive">−{fmtEuro(r.shortfallCents)}</span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {fmtEuro(r.safeBalanceCents)}
                    </TableCell>
                    <TableCell
                      className={
                        "text-right tabular-nums" + (negDiff ? " font-medium text-destructive" : "")
                      }
                    >
                      {fmtEuro(r.differenzCents)}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
            <TableFooter>
              <TableRow>
                <TableCell colSpan={3}>Summe</TableCell>
                <TableCell className="text-right tabular-nums">{fmtEuro(totals.rev)}</TableCell>
                <TableCell className="text-right tabular-nums">{fmtEuro(totals.exp)}</TableCell>
                <TableCell />
                <TableCell />
                <TableCell />
                <TableCell />
                <TableCell
                  className={
                    "text-right tabular-nums" +
                    (totals.diff < 0 ? " font-medium text-destructive" : "")
                  }
                >
                  {fmtEuro(totals.diff)}
                </TableCell>
              </TableRow>
            </TableFooter>
          </Table>
        )}
      </Card>
    </div>
  );
}
