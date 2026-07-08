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
import { computeTipTotalCents } from "@/lib/cash/tip-pool";

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
  // Für Korrekturen: Vorgänger-Zeile per corrected_from_id auflösen,
  // damit geänderte Zellen dezent markiert werden können.
  const byId = new Map(rows.map((r) => [r.id, r] as const));
  const changedMark = "underline decoration-destructive/70 decoration-2 underline-offset-4";
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
            <TableHead className="text-right">Leistung</TableHead>
            <TableHead className="text-right">Abgabe</TableHead>
            <TableHead className="text-right">Karte</TableHead>
            <TableHead className="text-right">Hilf</TableHead>
            <TableHead className="text-right">Offen</TableHead>
            <TableHead className="text-right">Bargeld</TableHead>
            <TableHead className="text-right">Tip</TableHead>
            <TableHead className="text-right">Tip %</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-right">Aktion</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.length === 0 && (
            <TableRow>
              <TableCell colSpan={11} className="text-center text-muted-foreground">
                Noch keine Abrechnungen.
              </TableCell>
            </TableRow>
          )}
          {rows.map((r) => {
            const superseded = r.status === "superseded";
            const pos = Number(r.pos_sales_cents);
            const kassiertBrutto = Number(
              (r as { kassiert_brutto_cents?: number | string | null }).kassiert_brutto_cents ??
                r.pos_sales_cents,
            );
            // Tip pro Kellner = Pool-Formel (Spicery-Abrechnung, kanonisch):
            //   card + cashHandedIn + open − kassiertBrutto − hilfMahl
            const tipTotal = computeTipTotalCents([
              {
                cardTotalCents: Number(r.card_total_cents),
                cashHandedInCents: Number(r.cash_handed_in_cents),
                posSalesCents: pos,
                openInvoicesCents: Number(r.open_invoices_cents),
                hilfMahlCents: Number(r.hilf_mahl_cents),
                kassiertBruttoCents: kassiertBrutto,
              },
            ]);
            const tipPct = pos > 0 ? (tipTotal / pos) * 100 : null;
            // Wenn diese Zeile eine andere korrigiert, zellenweise vergleichen.
            const prevId = (r as { corrected_from_id?: string | null }).corrected_from_id ?? null;
            const prev = !superseded && prevId ? byId.get(prevId) : undefined;
            const diff = (a: number, b: number | string | null | undefined) =>
              prev ? a !== Number(b ?? 0) : false;
            const prevKassiert = prev
              ? Number(
                  (prev as { kassiert_brutto_cents?: number | string | null })
                    .kassiert_brutto_cents ?? prev.pos_sales_cents,
                )
              : 0;
            const prevTip = prev
              ? computeTipTotalCents([
                  {
                    cardTotalCents: Number(prev.card_total_cents),
                    cashHandedInCents: Number(prev.cash_handed_in_cents),
                    posSalesCents: Number(prev.pos_sales_cents),
                    openInvoicesCents: Number(prev.open_invoices_cents),
                    hilfMahlCents: Number(prev.hilf_mahl_cents),
                    kassiertBruttoCents: prevKassiert,
                  },
                ])
              : 0;
            const prevPos = prev ? Number(prev.pos_sales_cents) : 0;
            const prevTipPct = prev && prevPos > 0 ? (prevTip / prevPos) * 100 : null;
            const mark = (changed: boolean) => (changed ? ` ${changedMark}` : "");
            return (
              <TableRow key={r.id} className={superseded ? "opacity-50" : ""}>
                <TableCell>
                  {r.staffName}
                  {(() => {
                    const partnerCount =
                      (r as { partnerStaffNames?: string[] }).partnerStaffNames?.length ??
                      (r as { partnerStaffIds?: string[] }).partnerStaffIds?.length ??
                      (r.partner_staff_id ? 1 : 0);
                    if (partnerCount <= 0) return null;
                    return (
                      <Badge variant="secondary" className="ml-2">
                        {partnerCount === 1 ? "Paar" : "Gruppe"}
                      </Badge>
                    );
                  })()}
                </TableCell>
                <TableCell className="text-right font-mono">
                  <span className={"inline-block" + mark(diff(pos, prev?.pos_sales_cents))}>
                    {fmtCents(pos)}
                  </span>
                </TableCell>
                <TableCell className="text-right font-mono">
                  <span className={"inline-block" + mark(prev ? kassiertBrutto !== prevKassiert : false)}>
                    {fmtCents(kassiertBrutto)}
                  </span>
                </TableCell>
                <TableCell className="text-right font-mono">
                  <span
                    className={
                      "inline-block" +
                      mark(diff(Number(r.card_total_cents), prev?.card_total_cents))
                    }
                  >
                    {fmtCents(Number(r.card_total_cents))}
                  </span>
                </TableCell>
                <TableCell className="text-right font-mono">
                  <span
                    className={
                      "inline-block" +
                      mark(diff(Number(r.hilf_mahl_cents), prev?.hilf_mahl_cents))
                    }
                  >
                    {fmtCents(Number(r.hilf_mahl_cents))}
                  </span>
                </TableCell>
                <TableCell className="text-right font-mono">
                  <span
                    className={
                      "inline-block" +
                      mark(diff(Number(r.open_invoices_cents), prev?.open_invoices_cents))
                    }
                  >
                    {fmtCents(Number(r.open_invoices_cents))}
                  </span>
                </TableCell>
                <TableCell className="text-right font-mono">
                  <span
                    className={
                      "inline-block" +
                      mark(diff(Number(r.cash_handed_in_cents), prev?.cash_handed_in_cents))
                    }
                  >
                    {fmtCents(Number(r.cash_handed_in_cents))}
                  </span>
                </TableCell>
                <TableCell className="text-right font-mono">
                  <span className={"inline-block" + mark(prev ? tipTotal !== prevTip : false)}>
                    {fmtCents(tipTotal)}
                  </span>
                </TableCell>
                <TableCell className="text-right font-mono">
                  <span
                    className={
                      "inline-block" +
                      mark(prev ? (tipPct ?? 0) !== (prevTipPct ?? 0) : false)
                    }
                  >
                    {tipPct === null ? "–" : `${tipPct.toFixed(1).replace(".", ",")} %`}
                  </span>
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
