// Geteilter Helper: baut den `DayInput` für eine einzelne Session
// (Tagesabrechnung / PDF) aus dem Session-DTO + Satelliten-Listen.
//
// Identisch zur bisherigen Inline-Konstruktion in `pdfExport.ts`
// (Zeilen 187–218). Wird sowohl im PDF als auch im Kasse-Editor verwendet,
// damit beide Stellen bit-genau dieselbe Tages-Bargeld-Zahl ergeben.

import type { DayInput } from "./cash-ledger";

export type SessionDayFields = {
  business_date: string;
  vectron_daily_total_cents?: number | null;
  vouchers_sold_cents?: number | null;
  vouchers_redeemed_cents?: number | null;
  finedine_vouchers_cents?: number | null;
  einladung_cents?: number | null;
  sonstige_einnahme_cents?: number | null;
  vorschuss_cents?: number | null;
};

export type SessionDayInputArgs = {
  cardTotalCents: number;
  deliverySouseCents: number;
  deliveryWoltCents: number;
  expensesCents: number[];
  advancesCents: number[];
  openInvoicesCents: number[];
};

export function sessionToDayInput(sess: SessionDayFields, args: SessionDayInputArgs): DayInput {
  return {
    businessDate: sess.business_date,
    grossRevenueCents: Number(sess.vectron_daily_total_cents ?? 0),
    cardTotalCents: args.cardTotalCents,
    deliverySouseCents: args.deliverySouseCents,
    deliveryWoltCents: args.deliveryWoltCents,
    vouchersSoldCents: Number(sess.vouchers_sold_cents ?? 0),
    vouchersRedeemedCents: Number(sess.vouchers_redeemed_cents ?? 0),
    finedineVouchersCents: Number(sess.finedine_vouchers_cents ?? 0),
    einladungCents: Number(sess.einladung_cents ?? 0),
    openInvoicesCents: args.openInvoicesCents,
    sonstigeEinnahmeCents: Number(sess.sonstige_einnahme_cents ?? 0),
    vorschussCents: Number(sess.vorschuss_cents ?? 0),
    satellites: {
      expensesCents: args.expensesCents,
      advancesCents: args.advancesCents,
      cardTransactionsCents: [],
      bankDepositsCents: [],
      registerTransfers: [],
    },
  };
}
