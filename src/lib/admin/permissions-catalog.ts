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
  | "cash.export.pdf"
  // Modul Zeit
  | "time.entry.view_self"
  | "time.entry.view_all"
  | "time.entry.clock"
  | "time.entry.edit"
  | "time.period.view"
  | "time.period.manage"
  | "time.period.lock"
  | "time.payroll_note.view"
  | "time.payroll_note.edit"
  | "time.export";

export type PermissionEffect = "allow" | "deny";

export type PermissionModule = "kasse" | "zeit";

export const MODULE_LABEL: Record<PermissionModule, string> = {
  kasse: "Kasse / Tagesabrechnung",
  zeit: "Zeiterfassung",
};

export type PermissionMeta = {
  key: AppPermission;
  module: PermissionModule;
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
  // ----- Modul Zeit -----
  {
    key: "time.entry.view_self",
    module: "zeit",
    label: "Eigene Zeiten sehen",
    description: "Eigene Stempel- und Schicht-Einträge ansehen.",
    scopable: false,
  },
  {
    key: "time.entry.view_all",
    module: "zeit",
    label: "Alle Zeiten sehen",
    description: "Zeiten aller Mitarbeiter ansehen (standortspezifisch einschränkbar).",
    scopable: true,
  },
  {
    key: "time.entry.clock",
    module: "zeit",
    label: "Stempeln (Ein/Aus)",
    description: "Sich selbst ein- und ausstempeln (standortspezifisch einschränkbar).",
    scopable: true,
  },
  {
    key: "time.entry.edit",
    module: "zeit",
    label: "Fremde Zeiten ändern",
    description: "Zeiten anderer Mitarbeiter anlegen oder korrigieren (standortspezifisch).",
    scopable: true,
  },
  {
    key: "time.period.view",
    module: "zeit",
    label: "Lohn-Perioden sehen",
    description: "Periodenliste (26.–25.) ansehen.",
    scopable: false,
  },
  {
    key: "time.period.manage",
    module: "zeit",
    label: "Perioden verwalten",
    description: "Perioden anlegen, ändern, löschen.",
    scopable: false,
  },
  {
    key: "time.period.lock",
    module: "zeit",
    label: "Periode sperren/entsperren",
    description: "Status einer Periode auf sperren/öffnen schalten.",
    scopable: false,
  },
  {
    key: "time.payroll_note.view",
    module: "zeit",
    label: "Lohnbüro-Notizen sehen",
    description: "Vorschuss-/Besonderheiten-Notizen pro Mitarbeiter ansehen.",
    scopable: false,
  },
  {
    key: "time.payroll_note.edit",
    module: "zeit",
    label: "Lohnbüro-Notizen pflegen",
    description: "Notizen anlegen und ändern.",
    scopable: false,
  },
  {
    key: "time.export",
    module: "zeit",
    label: "Lohn-/Wochen-Export",
    description: "Wochen- und Lohn-Exporte erzeugen.",
    scopable: false,
  },
] as const;

export function getPermissionMeta(key: AppPermission): PermissionMeta {
  const m = PERMISSION_CATALOG.find((p) => p.key === key);
  if (!m) throw new Error(`Unbekanntes Recht: ${key}`);
  return m;
}