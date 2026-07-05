// PV3 — Server-seitige Validierungs-Helfer für den POS-Stundenbericht-Import.
// Ausgelagert für Vitest ohne DB (spiegelt pos-report-server.ts, PV2).

import { z } from "zod";

export const PosHourlyRowSchema = z.object({
  hour: z.number().int().min(0).max(23),
  anzahl: z.number().int(),
  wertCents: z.number().int(),
});
export type PosHourlyRow = z.infer<typeof PosHourlyRowSchema>;

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Datum im Format YYYY-MM-DD erwartet.");

function todayIsoBerlin(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Berlin" }).format(new Date());
}

export const ReplacePosHourlyStatsInput = z
  .object({
    locationId: z.string().uuid(),
    period: z.enum(["d365", "alltime"]),
    reportDate: isoDate,
    rows: z
      .array(PosHourlyRowSchema)
      .min(1, "Mindestens eine Zeile erforderlich.")
      .max(24, "Höchstens 24 Stundenzeilen.")
      .refine(
        (rs) => new Set(rs.map((r) => r.hour)).size === rs.length,
        "Stunden müssen eindeutig sein.",
      ),
    footer: z.object({
      anzahl: z.number().int(),
      wertCents: z.number().int(),
    }),
  })
  .refine((d) => d.reportDate <= todayIsoBerlin(), {
    message: "reportDate darf nicht in der Zukunft liegen.",
    path: ["reportDate"],
  });
export type ReplacePosHourlyStatsInputT = z.infer<typeof ReplacePosHourlyStatsInput>;

export type HourlySumCheck = { sumAnzahl: number; sumCents: number; matches: boolean };

export function checkHourlyAgainstFooter(
  rows: readonly PosHourlyRow[],
  footer: { anzahl: number; wertCents: number },
): HourlySumCheck {
  const sumAnzahl = rows.reduce((s, r) => s + r.anzahl, 0);
  const sumCents = rows.reduce((s, r) => s + r.wertCents, 0);
  return {
    sumAnzahl,
    sumCents,
    matches: sumAnzahl === footer.anzahl && sumCents === footer.wertCents,
  };
}

// Kleine Anzeige-Helfer (reine Funktionen, in der UI wiederverwendet).
export function hourShare(wertCents: number, totalCents: number): number | null {
  if (totalCents === 0) return null;
  return (wertCents / totalCents) * 100;
}

export function avgPerBookingCents(wertCents: number, anzahl: number): number | null {
  if (anzahl === 0) return null;
  return Math.round(wertCents / anzahl);
}
