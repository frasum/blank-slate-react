// Wiederverwendbare EKW-Badge-Anzeige (Wareneinsatz in Prozent). Nutzt die
// Schwellwerte aus `ek-linking.ts`, damit die Farbstufen an EINER Stelle
// definiert bleiben (KGL — keine Zweitimplementierung).

import { WE_GELB_BIS, WE_GRUEN_BIS } from "@/lib/bestellung/ek-linking";

export const WE_TOOLTIP =
  "Wareneinsatz = EK netto ÷ VK netto (VK ÷ 1,19). Grün ≤ 25 % · Gelb ≤ 35 % · Rot > 35 %";

export function WeBadge({ pct }: { pct: number | null }) {
  if (pct === null) return <span className="text-xs text-muted-foreground">—</span>;
  const cls =
    pct <= WE_GRUEN_BIS
      ? "bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-900/40 dark:text-emerald-200 dark:border-emerald-800"
      : pct <= WE_GELB_BIS
        ? "bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-900/40 dark:text-amber-200 dark:border-amber-800"
        : "bg-red-100 text-red-800 border-red-200 dark:bg-red-900/40 dark:text-red-200 dark:border-red-800";
  return (
    <span
      className={`inline-flex items-center rounded-md border px-2 py-0.5 font-mono text-xs ${cls}`}
      title={WE_TOOLTIP}
    >
      {pct.toLocaleString("de-DE", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} %
    </span>
  );
}