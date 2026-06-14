// D2c — Anzeige-Kürzel für Service-Schichten im Dienstplan-Grid und im
// externen Display (D3). Mapping basiert auf skill.name. Default ist "X"
// (arbeitet, ohne spezielle Rolle).

export function serviceMarker(skillName: string | null | undefined): string {
  if (!skillName) return "X";
  const n = skillName.trim().toLowerCase();
  if (n === "service") return "X";
  if (n === "gl") return "GL";
  if (n === "bar") return "B";
  if (n === "19 uhr" || n === "19uhr" || n === "19h") return "19h";
  if (n === "hausmeister") return "H";
  return "X";
}
