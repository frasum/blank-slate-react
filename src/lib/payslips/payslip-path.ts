// Reine Helfer für Pfade des `payslips`-Storage-Buckets.
// Pfad-Konvention: `${organization_id}/${staff_id}/<dateiname>`.

export function payslipFolder(organizationId: string, staffId: string): string {
  return `${organizationId}/${staffId}`;
}

/**
 * Säubert einen vom Client gelieferten Dateinamen. Erlaubt nur
 * `[A-Za-z0-9._ -]`; verbietet Pfad-Trenner und `..`-Sequenzen, leere
 * Namen und solche, die mit einem Punkt beginnen.
 */
export function sanitizePayslipFileName(name: string): string | null {
  if (typeof name !== "string") return null;
  const trimmed = name.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith(".")) return null;
  if (trimmed.includes("/") || trimmed.includes("\\")) return null;
  if (trimmed.includes("..")) return null;
  if (!/^[A-Za-z0-9._ -]+$/.test(trimmed)) return null;
  return trimmed;
}

export type PayslipRole = "admin" | "manager" | "staff" | "payroll";

/**
 * True, wenn der Aufrufer den angegebenen Storage-Pfad lesen darf:
 * eigene Datei immer, sonst nur Admin innerhalb der eigenen Organisation.
 */
export function isPayslipPathAllowed(args: {
  path: string;
  organizationId: string;
  staffId: string;
  role: PayslipRole;
}): boolean {
  const { path, organizationId, staffId, role } = args;
  if (typeof path !== "string" || !path) return false;
  if (path.startsWith(`${organizationId}/${staffId}/`)) return true;
  if (role === "admin" && path.startsWith(`${organizationId}/`)) return true;
  return false;
}