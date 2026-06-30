// Geteilte Farb-/Text-Logik für Schicht-Pillen. Wird sowohl im
// Dienstplan-Grid (ShiftPill) als auch im öffentlichen Display
// genutzt, damit beide Ansichten nicht auseinanderdriften.

export function abbr(s: string | null | undefined): string {
  if (!s) return "";
  return s.trim().slice(0, 2).toUpperCase();
}

export type PillStyleInput = {
  skillColor: string | null;
  area: "kitchen" | "service";
  label: string;
  status: "planned" | "confirmed";
};

export type PillStyleResult = {
  backgroundColor: string;
  textClass: string;
};

export function pillStyle(input: PillStyleInput): PillStyleResult {
  const isDefaultService = input.area === "service" && input.label === "X";
  if (isDefaultService) {
    return {
      backgroundColor: "#ffffff",
      textClass: "text-black border-transparent",
    };
  }
  const bg = input.skillColor ?? (input.area === "service" ? "#ffffff" : "#9ca3af");
  const mixPct = input.status === "confirmed" ? 85 : 92;
  return {
    backgroundColor: `color-mix(in oklab, ${bg} ${mixPct}%, black)`,
    textClass: "text-white border-transparent",
  };
}