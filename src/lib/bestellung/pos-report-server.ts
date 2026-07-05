// PV2 — Server-seitige Validierungs-Helfer für den POS-Verkaufs-Import.
//
// Ausgelagert, damit die Zod-Schemas und der Summen-Gate ohne DB in Vitest
// testbar sind. Die eigentliche Server-Fn (replacePosSalesStats) liegt in
// sales-stats.functions.ts und ruft diese Helfer zuerst.

import { z } from "zod";

/** Ein importierter Artikel (nach Parser + Klammer-Strip). */
export const PosRowSchema = z.object({
  nummer: z.number().int(),
  name: z.string().trim().min(1),
  verkaufCount: z.number().int(),
  umsatzCents: z.number().int(),
});
export type PosRow = z.infer<typeof PosRowSchema>;

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Datum im Format YYYY-MM-DD erwartet.");

function todayIsoBerlin(): string {
  // Europe/Berlin-Datum (die App arbeitet konsistent in dieser Zone; siehe
  // current_business_date()). Locale/de mit Intl deckt Sommerzeit korrekt ab.
  const fmt = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Berlin" });
  return fmt.format(new Date());
}

export const ReplacePosSalesStatsInput = z
  .object({
    locationId: z.string().uuid(),
    period: z.enum(["d365", "alltime"]),
    reportDate: isoDate,
    rows: z.array(PosRowSchema).min(1, "Mindestens eine Zeile erforderlich."),
    footer: z.object({
      verkaufCount: z.number().int(),
      umsatzCents: z.number().int(),
    }),
  })
  .refine((d) => d.reportDate <= todayIsoBerlin(), {
    message: "reportDate darf nicht in der Zukunft liegen.",
    path: ["reportDate"],
  });
export type ReplacePosSalesStatsInputT = z.infer<typeof ReplacePosSalesStatsInput>;

export type SumCheck = {
  sumCount: number;
  sumCents: number;
  matches: boolean;
};

export function checkRowsAgainstFooter(
  rows: readonly PosRow[],
  footer: { verkaufCount: number; umsatzCents: number },
): SumCheck {
  const sumCount = rows.reduce((s, r) => s + r.verkaufCount, 0);
  const sumCents = rows.reduce((s, r) => s + r.umsatzCents, 0);
  return {
    sumCount,
    sumCents,
    matches: sumCount === footer.verkaufCount && sumCents === footer.umsatzCents,
  };
}