// TH1 — LocationThemeProvider: hält den aktuellen Theme-Key (spicery/yum/
// neutral) für den Authenticated-Bereich. Seiten melden ihre Auswahl über
// useLocationThemeSync(locations, value); beim Unmount wird auf „neutral"
// zurückgesetzt, damit Seiten ohne Standort-Wahl neutral bleiben.

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { locationThemeKey, type LocationThemeKey } from "./location-theme";

type Ctx = {
  themeKey: LocationThemeKey;
  setThemeKey: (k: LocationThemeKey) => void;
};

const LocationThemeCtx = createContext<Ctx | null>(null);

export function LocationThemeProvider({ children }: { children: React.ReactNode }) {
  const [themeKey, setThemeKey] = useState<LocationThemeKey>("neutral");
  const value = useMemo(() => ({ themeKey, setThemeKey }), [themeKey]);
  return <LocationThemeCtx.Provider value={value}>{children}</LocationThemeCtx.Provider>;
}

export function useLocationTheme(): LocationThemeKey {
  const ctx = useContext(LocationThemeCtx);
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
  const ctx = useContext(LocationThemeCtx);
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
