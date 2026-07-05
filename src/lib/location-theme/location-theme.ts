// TH1 — Ableitung des Standort-Themes aus dem angezeigten Namen.
// Reine Funktion, damit sich das Mapping ohne UI testen lässt.

export type LocationThemeKey = "spicery" | "yum" | "neutral";

export function locationThemeKey(name: string | null | undefined): LocationThemeKey {
  if (!name) return "neutral";
  const n = name.trim().toLowerCase();
  if (n === "") return "neutral";
  if (n.includes("spicery")) return "spicery";
  if (n.includes("yum")) return "yum";
  return "neutral";
}
