import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { fmtCents } from "@/lib/format";
import type { Overview, SettlementRow } from "@/lib/cash/kasse-types";

export function SettlementsCard({
  data,
  correctable,
  onCorrect,
  onCreate,
}: {
  data: Overview;
  correctable: boolean;
  onCorrect: (row: SettlementRow) => void;
  onCreate: () => void;
}) {
  const rows = data.settlements;
  return (
    <Card>
      <div className="flex items-center justify-between border-b px-4 py-3">
        <div className="text-sm font-medium">Kellner-Abrechnungen</div>
        <Button size="sm" variant="outline" disabled={!correctable} onClick={onCreate}>
          Neue Abrechnung
        </Button>
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Kellner</TableHead>
            <TableHead className="text-right">POS</TableHead>
            <TableHead className="text-right">Karte</TableHead>
            <TableHead className="text-right">Hilf</TableHead>
            <TableHead className="text-right">Offen</TableHead>
            <TableHead className="text-right">Bargeld</TableHead>
            <TableHead className="text-right">Differenz</TableHead>
            <TableHead className="text-right">Tip</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-right">Aktion</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.length === 0 && (
            <TableRow>
              <TableCell colSpan={10} className="text-center text-muted-foreground">
                Noch keine Abrechnungen.
              </TableCell>
            </TableRow>
          )}
          {rows.map((r) => {
            const superseded = r.status === "superseded";
            return (
              <TableRow key={r.id} className={superseded ? "opacity-50" : ""}>
                <TableCell>
                  {r.staffName}
                  {r.partner_staff_id && (
                    <Badge variant="secondary" className="ml-2">
                      Paar
                    </Badge>
                  )}
                </TableCell>
                <TableCell className="text-right font-mono">
                  {fmtCents(Number(r.pos_sales_cents))}
                </TableCell>
                <TableCell className="text-right font-mono">
                  {fmtCents(Number(r.card_total_cents))}
                </TableCell>
                <TableCell className="text-right font-mono">
                  {fmtCents(Number(r.hilf_mahl_cents))}
                </TableCell>
                <TableCell className="text-right font-mono">
                  {fmtCents(Number(r.open_invoices_cents))}
                </TableCell>
                <TableCell className="text-right font-mono">
                  {fmtCents(Number(r.cash_handed_in_cents))}
                </TableCell>
                <TableCell
                  className={`text-right font-mono ${Number(r.differenz_cents) < 0 ? "text-destructive" : ""}`}
                >
                  {fmtCents(Number(r.differenz_cents))}
                </TableCell>
                <TableCell className="text-right font-mono">
                  {fmtCents(Number(r.kitchen_tip_cents))}
                </TableCell>
                <TableCell>
                  <Badge variant={superseded ? "outline" : "default"}>{r.status}</Badge>
                </TableCell>
                <TableCell className="text-right">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={!correctable || superseded}
                    onClick={() => onCorrect(r)}
                  >
                    Korrektur
                  </Button>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </Card>
  );
}
