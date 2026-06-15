// Density-Stufen für das Roster-Grid. "fit" rendert kompakt;
// im RosterGrid wird die Zeilenhöhe später dynamisch berechnet.
import { useCallback, useEffect, useState } from "react";

export type Density = "compact" | "normal" | "comfortable" | "fit";

const KEY = "coco.roster.density";

export const DENSITY_ROW_HEIGHT: Record<Density, number> = {
  compact: 32,
  normal: 40,
  comfortable: 56,
  fit: 32,
};

export const DENSITY_PILL_CLASS: Record<Density, string> = {
  compact: "h-6 w-10 text-[10px]",
  normal: "h-7 w-12 text-[11px]",
  comfortable: "h-9 w-14 text-sm",
  fit: "h-6 w-10 text-[10px]",
};

function read(): Density {
  if (typeof window === "undefined") return "normal";
  const v = window.localStorage.getItem(KEY);
  if (v === "compact" || v === "normal" || v === "comfortable" || v === "fit") return v;
  return "normal";
}

export function useDensity(): [Density, (d: Density) => void] {
  const [density, setDensity] = useState<Density>(() => read());
  useEffect(() => {
    try {
      window.localStorage.setItem(KEY, density);
    } catch {
      // ignore (private mode etc.)
    }
  }, [density]);
  const set = useCallback((d: Density) => setDensity(d), []);
  return [density, set];
}
