// SM1 — Sofortmeldung-Regeln (reines Modul, keine I/O).
//
// Status wird BERECHNET, nicht gespeichert:
//   nicht_erforderlich | unvollstaendig | bereit | gemeldet
//
// SV-Nummer ist NICHT hart Pflicht — als Fallback reichen
// Geburtsort + Nationalität (so meldet man in sv.net Neueinstellungen,
// deren SV-Nr noch nicht vergeben ist).

export type SofortmeldungStatus = "nicht_erforderlich" | "unvollstaendig" | "bereit" | "gemeldet";

export type SofortmeldungStaff = {
  first_name: string | null;
  last_name: string | null;
};

export type SofortmeldungDetails = {
  date_of_birth: string | null;
  employment_start_date: string | null;
  social_security_number: string | null;
  place_of_birth: string | null;
  nationality: string | null;
  health_insurance?: string | null;
};

export const SOFORTMELDUNG_REQUIRED_FIELDS: {
  key: string;
  label: string;
}[] = [
  { key: "first_name", label: "Vorname" },
  { key: "last_name", label: "Nachname" },
  { key: "date_of_birth", label: "Geburtsdatum" },
  { key: "employment_start_date", label: "Beschäftigungsbeginn" },
  { key: "social_security_number", label: "SV-Nummer (oder Geburtsort + Nationalität)" },
];

function isBlank(v: string | null | undefined): boolean {
  return v === null || v === undefined || v.trim() === "";
}

export function sofortmeldungMissingFields(
  staff: SofortmeldungStaff,
  details: SofortmeldungDetails | null,
): string[] {
  const missing: string[] = [];
  if (isBlank(staff.first_name)) missing.push("first_name");
  if (isBlank(staff.last_name)) missing.push("last_name");
  if (!details) {
    return [...missing, "date_of_birth", "employment_start_date", "social_security_number"];
  }
  if (isBlank(details.date_of_birth)) missing.push("date_of_birth");
  if (isBlank(details.employment_start_date)) missing.push("employment_start_date");
  const hasSv = !isBlank(details.social_security_number);
  const hasFallback = !isBlank(details.place_of_birth) && !isBlank(details.nationality);
  if (!hasSv && !hasFallback) missing.push("social_security_number");
  return missing;
}

export function sofortmeldungStatus(args: {
  required: boolean;
  missingFields: string[];
  reportedAt: string | null;
}): SofortmeldungStatus {
  if (args.reportedAt) return "gemeldet";
  if (!args.required) return "nicht_erforderlich";
  return args.missingFields.length === 0 ? "bereit" : "unvollstaendig";
}

export function labelForField(key: string): string {
  return SOFORTMELDUNG_REQUIRED_FIELDS.find((f) => f.key === key)?.label ?? key;
}

function formatDateDe(iso: string | null): string {
  if (isBlank(iso)) return "—";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso as string);
  if (!m) return iso as string;
  return `${m[3]}.${m[2]}.${m[1]}`;
}

export function buildSvNetDataBlock(
  staff: SofortmeldungStaff,
  details: SofortmeldungDetails | null,
  betriebsnummer: string | null,
): { label: string; value: string }[] {
  const d = details;
  const rows: { label: string; value: string }[] = [
    { label: "Nachname", value: staff.last_name ?? "—" },
    { label: "Vorname", value: staff.first_name ?? "—" },
    { label: "Geburtsdatum", value: formatDateDe(d?.date_of_birth ?? null) },
  ];
  const sv = d?.social_security_number;
  if (!isBlank(sv)) {
    rows.push({ label: "SV-Nummer", value: sv as string });
  } else {
    rows.push({ label: "SV-Nummer", value: "—" });
    rows.push({ label: "Geburtsort", value: d?.place_of_birth ?? "—" });
    rows.push({ label: "Nationalität", value: d?.nationality ?? "—" });
  }
  rows.push({
    label: "Beschäftigungsbeginn",
    value: formatDateDe(d?.employment_start_date ?? null),
  });
  if (!isBlank(d?.health_insurance)) {
    rows.push({ label: "Krankenkasse", value: d!.health_insurance as string });
  }
  if (!isBlank(betriebsnummer)) {
    rows.push({ label: "Betriebsnummer", value: betriebsnummer as string });
  } else {
    rows.push({
      label: "Betriebsnummer",
      value: "— (in Einstellungen pflegen)",
    });
  }
  return rows;
}
