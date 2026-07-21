// Gemeinsamer deutscher Zahl-Parser für Dialog und Grid (AP1-B §1).
// Komma oder Punkt als Dezimaltrenner; leer/ungültig → null.
export function parseNumberDe(value: string): number | null {
  const s = value.trim().replace(",", ".");
  if (s === "") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}