// Zentraler Katalog aller Rechte (UI-Labels + Beschreibung).
// Quelle der Wahrheit für die deutschen Texte; DB-Enum app_permission
// liefert die Schlüssel.

export type AppPermission =
  | "cash.session.view"
  | "cash.session.open"
  | "cash.session.edit"
  | "cash.session.finalize"
  | "cash.session.lock"
  | "cash.settlement.submit_self"
  | "cash.settlement.view_all"
  | "cash.settlement.correct"
  | "cash.settlement.admin_create"
  | "cash.tippool.manage"
  | "cash.channel.manage"
  | "cash.export.pdf";

export type PermissionEffect = "allow" | "deny";

export type PermissionMeta = {
  key: AppPermission;
  module: "kasse";
  label: string;
  description: string;
  /** Wenn true, kann das Recht standortspezifisch vergeben werden. */
  scopable: boolean;
};

export const PERMISSION_CATALOG: readonly PermissionMeta[] = [
  {
    key: "cash.session.view",
    module: "kasse",
    label: "Kassen-Sessions sehen",
    description: "Tagesabrechnung & Kassen-Übersicht öffnen.",
    scopable: true,
  },
  {
    key: "cash.session.open",
    module: "kasse",
    label: "Session öffnen",
    description: "Neue Tages-Session für einen Standort starten.",
    scopable: true,
  },
  {
    key: "cash.session.edit",
    module: "kasse",
    label: "Session bearbeiten",
    description: "Kanal-/Terminal-Beträge, Ausgaben, Vorschüsse pflegen.",
    scopable: true,
  },
  {
    key: "cash.session.finalize",
    module: "kasse",
    label: "Session abschließen",
    description: "Tag abrechnen / finalisieren (kein Editieren mehr danach).",
    scopable: true,
  },
  {
    key: "cash.session.lock",
    module: "kasse",
    label: "Tagessperre setzen",
    description: "Geschäftstags-Sperre für einen Standort setzen oder lösen.",
    scopable: true,
  },
  {
    key: "cash.settlement.submit_self",
    module: "kasse",
    label: "Eigene Abrechnung abgeben",
    description: "Eigene Kellner-Abrechnung für den laufenden Tag einreichen.",
    scopable: true,
  },
  {
    key: "cash.settlement.view_all",
    module: "kasse",
    label: "Alle Abrechnungen sehen",
    description: "Kellner-Abrechnungen anderer Mitarbeiter einsehen.",
    scopable: true,
  },
  {
    key: "cash.settlement.correct",
    module: "kasse",
    label: "Fremde Abrechnung korrigieren",
    description: "Abrechnung eines anderen Mitarbeiters ändern.",
    scopable: true,
  },
  {
    key: "cash.settlement.admin_create",
    module: "kasse",
    label: "Abrechnung nachträglich anlegen",
    description: "Kellnerabrechnung nachträglich für einen anderen Mitarbeiter anlegen.",
    scopable: true,
  },
  {
    key: "cash.tippool.manage",
    module: "kasse",
    label: "Trinkgeldpool verwalten",
    description: "Pool-Einträge pflegen (Restverteilung, Korrekturen).",
    scopable: false,
  },
  {
    key: "cash.channel.manage",
    module: "kasse",
    label: "Erlöskanäle & Terminals verwalten",
    description: "Kanäle/Kartenterminals pro Standort anlegen, ändern, löschen.",
    scopable: true,
  },
  {
    key: "cash.export.pdf",
    module: "kasse",
    label: "Bargeld-/PDF-Export",
    description: "PDF- und Bargeld-Exporte erzeugen.",
    scopable: false,
  },
] as const;

export function getPermissionMeta(key: AppPermission): PermissionMeta {
  const m = PERMISSION_CATALOG.find((p) => p.key === key);
  if (!m) throw new Error(`Unbekanntes Recht: ${key}`);
  return m;
}