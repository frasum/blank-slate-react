// Reine Zell-Priorität fürs Display-Gitter. Keine DB, kein React — testbar.
export type DisplayCellKind = "shift" | "urlaub" | "krank" | "wish" | "available" | "empty";

export function resolveCellKind(input: {
  hasShift: boolean;
  absenceType: "urlaub" | "krank" | null;
  hasWish: boolean;
  hasAvailability: boolean;
}): DisplayCellKind {
  if (input.hasShift) return "shift";
  if (input.absenceType === "urlaub") return "urlaub";
  if (input.absenceType === "krank") return "krank";
  if (input.hasWish) return "wish";
  if (input.hasAvailability) return "available";
  return "empty";
}