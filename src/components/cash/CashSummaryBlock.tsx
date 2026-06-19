import { Input } from "@/components/ui/input";
import { fmtCents } from "@/lib/format";
import { parseEuroToCents } from "@/lib/cash/kasse-helpers";
import { computeSummaryRows } from "@/lib/cash/cash-summary";
import { sessionToDayInput } from "@/lib/cash/session-day-input";
import type { Overview } from "@/lib/cash/kasse-types";

type CashSummaryMisc = {
  vouchersSold: string;
  vouchersRedeemed: string;
  finedineVouchers: string;
  opentabs: string;
  vorschuss: string;
  einladung: string;
  sonstige: string;
  vectron: string;
  cashActual: string;
  guestCount: string;
  notes: string;
};

export function CashSummaryBlock({
  misc,
  setMisc,
  writable,
  chRows,
  channelById,
  tmRows,
  expenses,
  advances,
  overview,
  cashBalanceTargetCents,
}: {
  misc: CashSummaryMisc;
  setMisc: React.Dispatch<React.SetStateAction<CashSummaryMisc>>;
  writable: boolean;
  chRows: { id: string; euro: string }[];
  channelById: Record<string, { kind: string } | undefined>;
  tmRows: { id: string; euro: string }[];
  expenses: Array<{ amountCents: number }>;
  advances: Array<{ amountCents: number }>;
  overview: Overview;
  cashBalanceTargetCents: number;
}) {
  const sess = overview.session!;
  const channelSum = (kind: string) =>
    chRows
      .filter((r) => channelById[r.id]?.kind === kind)
      .reduce((s, r) => s + (parseEuroToCents(r.euro) ?? 0), 0);
  const cardTotalCents = tmRows.reduce((s, r) => s + (parseEuroToCents(r.euro) ?? 0), 0);

  const openInvoicesCents = overview.settlements
    .filter((s) => (s.status as string) !== "superseded")
    .map((s) => Number(s.open_invoices_cents));

  const dayInput = sessionToDayInput(
    {
      business_date: sess.business_date,
      vectron_daily_total_cents: parseEuroToCents(misc.vectron) ?? 0,
      vouchers_sold_cents: parseEuroToCents(misc.vouchersSold) ?? 0,
      vouchers_redeemed_cents: parseEuroToCents(misc.vouchersRedeemed) ?? 0,
      finedine_vouchers_cents: parseEuroToCents(misc.finedineVouchers) ?? 0,
      einladung_cents: parseEuroToCents(misc.einladung) ?? 0,
      sonstige_einnahme_cents: parseEuroToCents(misc.sonstige) ?? 0,
      vorschuss_cents: parseEuroToCents(misc.vorschuss) ?? 0,
    },
    {
      cardTotalCents,
      deliverySouseCents: channelSum("delivery_souse"),
      deliveryWoltCents: channelSum("delivery_wolt"),
      openInvoicesCents,
      expensesCents: expenses.map((e) => e.amountCents),
      advancesCents: advances.map((a) => a.amountCents),
    },
  );

  const caRaw = misc.cashActual.trim();
  const cashActualCents = caRaw === "" ? null : parseEuroToCents(caRaw);
  const rows = computeSummaryRows({
    dayInput,
    cashActualCents,
    cashTargetCents: cashBalanceTargetCents,
  });

  const fmtEur = (c: number) => `${fmtCents(c)} €`;

  return (
    <div>
      <div
        className={`border-b px-3 py-2 flex items-center justify-between text-sm ${
          rows.tagesBargeldCents < 0 ? "bg-red-50" : "bg-emerald-50"
        }`}
      >
        <span className="font-semibold text-foreground">Tages-Bargeld</span>
        <span
          className={`font-mono tabular-nums font-semibold ${
            rows.tagesBargeldCents < 0 ? "text-red-700" : "text-emerald-700"
          }`}
        >
          {fmtEur(rows.tagesBargeldCents)}
        </span>
      </div>
      {rows.tresorCents > 0 && (
        <div className="border-b bg-orange-50 px-3 py-2 flex items-center justify-between text-sm">
          <span className="text-orange-700">Bargeld mit der Abrechnung in den Tresor legen</span>
          <span className="font-mono tabular-nums text-orange-700">{fmtEur(rows.tresorCents)}</span>
        </div>
      )}
      <div className="bg-emerald-50 px-3 py-2 flex items-center justify-between gap-3 text-sm">
        <label htmlFor="wechselgeld-input" className="font-semibold text-foreground">
          Wechselgeldbestand (soll ist {fmtEur(cashBalanceTargetCents)})
        </label>
        {(() => {
          const parsed = parseEuroToCents(misc.cashActual);
          const effective =
            parsed ??
            (rows.tagesBargeldCents < 0 ? cashBalanceTargetCents + rows.tagesBargeldCents : null);
          const below = effective !== null && effective < cashBalanceTargetCents;
          return (
            <Input
              id="wechselgeld-input"
              className={`h-7 w-36 text-sm text-right font-mono bg-white ${
                below
                  ? "border-red-300 text-red-700 placeholder:text-red-700"
                  : "border-emerald-200"
              }`}
              inputMode="decimal"
              value={misc.cashActual}
              placeholder={
                rows.tagesBargeldCents < 0
                  ? fmtCents(cashBalanceTargetCents + rows.tagesBargeldCents)
                  : undefined
              }
              onChange={(e) => setMisc((prev) => ({ ...prev, cashActual: e.target.value }))}
              disabled={!writable}
            />
          );
        })()}
      </div>
    </div>
  );
}
