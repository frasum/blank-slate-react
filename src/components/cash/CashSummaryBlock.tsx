import { fmtCents } from "@/lib/format";
import { parseEuroToCents } from "@/lib/cash/kasse-helpers";
import { computeWechselgeld } from "@/lib/cash/cash-summary";
import { computeDailyCash } from "@/lib/cash/cash-ledger";
import { sessionToDayInput } from "@/lib/cash/session-day-input";
import { cardDeductionFromTerminalRows } from "@/lib/cash/session-channels";
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
  writable,
  chRows,
  channelById,
  tmRows,
  expenses,
  advances,
  overview,
  cashBalanceTargetCents,
  previousDeficitCents,
  previousDeficitSourceDate,
}: {
  misc: CashSummaryMisc;
  writable: boolean;
  chRows: { id: string; euro: string }[];
  channelById: Record<string, { kind: string } | undefined>;
  tmRows: { id: string; euro: string; isGl: boolean }[];
  expenses: Array<{ amountCents: number }>;
  advances: Array<{ amountCents: number }>;
  overview: Overview;
  cashBalanceTargetCents: number;
  previousDeficitCents: number;
  previousDeficitSourceDate: string | null;
}) {
  void writable;
  const sess = overview.session!;
  const channelSum = (kind: string) =>
    chRows
      .filter((r) => channelById[r.id]?.kind === kind)
      .reduce((s, r) => s + (parseEuroToCents(r.euro) ?? 0), 0);
  const cardTotalCents = cardDeductionFromTerminalRows(tmRows, parseEuroToCents);

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

  const tagesBargeldCents = computeDailyCash(dayInput);
  const { tresorCents, wechselgeldbestandCents } = computeWechselgeld({
    tagesBargeldCents,
    previousDeficitCents,
    cashTargetCents: cashBalanceTargetCents,
  });

  const fmtEur = (c: number) => `${fmtCents(c)} €`;
  const fmtDate = (iso: string): string => {
    const [y, m, d] = iso.split("-");
    return `${d}.${m}.${y}`;
  };
  const below = wechselgeldbestandCents < cashBalanceTargetCents;

  return (
    <div>
      <div
        className={`border-b px-3 py-2 flex items-center justify-between text-sm ${
          tagesBargeldCents < 0 ? "bg-red-50" : "bg-emerald-50"
        }`}
      >
        <span className="font-semibold text-foreground">Tages-Bargeld</span>
        <span
          className={`font-mono tabular-nums font-semibold ${
            tagesBargeldCents < 0 ? "text-red-700" : "text-emerald-700"
          }`}
        >
          {fmtEur(tagesBargeldCents)}
        </span>
      </div>
      {previousDeficitCents < 0 && (
        <div className="border-b bg-red-50 px-3 py-2 flex items-center justify-between text-sm">
          <span className="text-red-700">
            Fehlbetrag Vortag
            {previousDeficitSourceDate ? ` (${fmtDate(previousDeficitSourceDate)})` : ""}
          </span>
          <span className="font-mono tabular-nums text-red-700">
            {fmtEur(previousDeficitCents)}
          </span>
        </div>
      )}
      {tresorCents > 0 && (
        <div className="border-b bg-orange-50 px-3 py-2 flex items-center justify-between text-sm">
          <span className="text-orange-700">Bargeld mit der Abrechnung in den Tresor legen</span>
          <span className="font-mono tabular-nums text-orange-700">{fmtEur(tresorCents)}</span>
        </div>
      )}
      <div
        className={`px-3 py-2 flex items-center justify-between gap-3 text-sm ${
          below ? "bg-red-50" : "bg-emerald-50"
        }`}
      >
        <span className="font-semibold text-foreground">
          Wechselgeldbestand (soll ist {fmtEur(cashBalanceTargetCents)})
        </span>
        <span
          className={`font-mono tabular-nums font-semibold ${
            below ? "text-red-700" : "text-emerald-700"
          }`}
        >
          {fmtEur(wechselgeldbestandCents)}
        </span>
      </div>
    </div>
  );
}
