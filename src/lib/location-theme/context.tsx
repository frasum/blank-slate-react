// TH1 — LocationThemeProvider (Komponente). Hooks/Context leben in
// theme-utils.ts, damit diese Datei ausschließlich Komponenten exportiert
// (react-refresh/only-export-components).

import { useMemo, useState } from "react";
import { LocationThemeContext } from "./theme-utils";
import type { LocationThemeKey } from "./location-theme";

export function LocationThemeProvider({ children }: { children: React.ReactNode }) {
  const [themeKey, setThemeKey] = useState<LocationThemeKey>("neutral");
  const value = useMemo(() => ({ themeKey, setThemeKey }), [themeKey]);
  return <LocationThemeContext.Provider value={value}>{children}</LocationThemeContext.Provider>;
}
