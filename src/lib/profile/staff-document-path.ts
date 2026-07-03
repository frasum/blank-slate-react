// Pfad-Guard für den privaten `staff-documents`-Storage-Bucket.
// Muster analog `payslip-path.ts`: reine Helfer, kein DB-/Server-Import.
// Pfad-Konvention: `${organization_id}/${staff_id}/${doc_type}/<uuid>.<ext>`.

export const ALLOWED_DOC_MIME: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "application/pdf": "pdf",
};

export const MAX_DOC_SIZE_BYTES = 10 * 1024 * 1024;

export const DOC_TYPES = [
  "passport",
  "visa",
  "work_permit",
  "health_certificate",
  "contract",
  "other",
] as const;
export type StaffDocumentType = (typeof DOC_TYPES)[number];

export function staffDocumentFolder(
  organizationId: string,
  staffId: string,
  docType: StaffDocumentType,
): string {
  return `${organizationId}/${staffId}/${docType}`;
}

/**
 * Säubert einen Anzeige-Dateinamen (nur für die Ablage in `original_filename`,
 * NICHT für den Storage-Pfad). Verbietet Pfad-Trenner und `..`. Endung wird
 * aus dem Mime-Type abgeleitet — dem Client-Namen wird nicht vertraut.
 */
export function sanitizeDocumentFileName(name: string): string | null {
  if (typeof name !== "string") return null;
  const trimmed = name.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith(".")) return null;
  if (trimmed.includes("/") || trimmed.includes("\\")) return null;
  if (trimmed.includes("..")) return null;
  if (trimmed.length > 200) return null;
  if (!/^[A-Za-z0-9._ -]+$/.test(trimmed)) return null;
  return trimmed;
}

export function isStaffDocumentPathAllowed(
  path: string,
  organizationId: string,
  staffId: string,
): boolean {
  if (typeof path !== "string" || !path) return false;
  if (path.startsWith("/")) return false;
  if (path.includes("..") || path.includes("\\")) return false;
  if (path.includes("//")) return false;
  const prefix = `${organizationId}/${staffId}/`;
  if (!path.startsWith(prefix)) return false;
  const rest = path.slice(prefix.length);
  const firstSlash = rest.indexOf("/");
  if (firstSlash <= 0) return false;
  const docType = rest.slice(0, firstSlash);
  if (!(DOC_TYPES as readonly string[]).includes(docType)) return false;
  const file = rest.slice(firstSlash + 1);
  if (!file || file.includes("/")) return false;
  return true;
}

export function extensionForMime(mime: string): string | null {
  return ALLOWED_DOC_MIME[mime] ?? null;
}
