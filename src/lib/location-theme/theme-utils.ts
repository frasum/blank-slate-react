// TH1 — Hooks + interner Context für das Location-Theme.
// Ausgelagert aus context.tsx, damit context.tsx nur noch die
// LocationThemeProvider-Komponente exportiert (react-refresh/only-export-
// components: keine Nicht-Komponenten-Exports in Komponenten-Dateien).
// KEINE Logik-Änderung — reines Verschieben.

import { createContext, useContext, useEffect, useMemo } from "react";
import { locationThemeKey, type LocationThemeKey } from "./location-theme";

export type LocationThemeCtx = {
  themeKey: LocationThemeKey;
  setThemeKey: (k: LocationThemeKey) => void;
};

export const LocationThemeContext = createContext<LocationThemeCtx | null>(null);

export function useLocationTheme(): LocationThemeKey {
  const ctx = useContext(LocationThemeContext);
  return ctx?.themeKey ?? "neutral";
}

/**
 * Meldet die Auswahl einer Standort-Pille an den Theme-Kontext.
 * Beim Unmount setzt der Hook zurück auf „neutral".
 */
export function useLocationThemeSync(
  locations: { id: string; name: string }[] | undefined,
  value: string | null | undefined,
): void {
  const ctx = useContext(LocationThemeContext);
  const name = useMemo(() => {
    if (!value || !locations) return null;
    return locations.find((l) => l.id === value)?.name ?? null;
  }, [locations, value]);
  useEffect(() => {
    if (!ctx) return;
    ctx.setThemeKey(locationThemeKey(name));
    return () => {
      ctx.setThemeKey("neutral");
    };
    // ctx-Referenz ist stabil (State-Setter); nur name treibt Updates.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name]);
}
