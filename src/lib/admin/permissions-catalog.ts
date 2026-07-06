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
  | "time.export"
  // Modul Dienstplan
  | "roster.shift.view_self"
  | "roster.shift.view_all"
  | "roster.shift.manage"
  | "roster.availability.manage_self"
  | "roster.availability.manage_all"
  | "roster.absence.view"
  | "roster.absence.manage"
  | "roster.wish.create_self"
  | "roster.wish.view_all"
  | "roster.wish.manage_all"
  | "roster.leave.request_self"
  | "roster.leave.view_all"
  | "roster.leave.decide"
  // PL1 — Schichttausch-Verwaltung
  | "roster.swap.view_pending"
  | "roster.swap.decide"
  // Modul Lohn/HR
  | "payroll.compensation.view"
  | "payroll.compensation.edit"
  | "payroll.personal.view"
  | "payroll.personal.edit"
  | "payroll.personal.import"
  | "payroll.calc.run"
  | "payroll.period.view"
  // Modul Aufgaben
  | "tasks.view"
  | "tasks.create"
  | "tasks.assign"
  | "tasks.change_status"
  | "tasks.delete"
  // Modul Verkaufsartikel / Rezepturen
  | "recipes.manage";

export type PermissionEffect = "allow" | "deny";

export type PermissionModule =
  | "kasse"
  | "zeit"
  | "dienstplan"
  | "lohn"
  | "aufgaben"
  | "verkaufsartikel";

export const MODULE_LABEL: Record<PermissionModule, string> = {
  kasse: "Kasse / Tagesabrechnung",
  zeit: "Zeiterfassung",
  dienstplan: "Dienstplan & Urlaub",
  lohn: "Lohn & HR",
  aufgaben: "Aufgaben / Tagesbetrieb",
  verkaufsartikel: "Verkaufsartikel & Rezepturen",
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
  // ----- Modul Dienstplan -----
  {
    key: "roster.shift.view_self",
    module: "dienstplan",
    label: "Eigene Schichten sehen",
    description: "Eigene Einteilungen im Dienstplan ansehen.",
    scopable: false,
  },
  {
    key: "roster.shift.view_all",
    module: "dienstplan",
    label: "Alle Schichten sehen",
    description: "Dienstplan aller Mitarbeiter ansehen.",
    scopable: false,
  },
  {
    key: "roster.shift.manage",
    module: "dienstplan",
    label: "Schichten verwalten",
    description: "Schichten anlegen, verschieben, Status ändern, löschen.",
    scopable: false,
  },
  {
    key: "roster.availability.manage_self",
    module: "dienstplan",
    label: "Eigene Verfügbarkeit pflegen",
    description: "Eigene Kann-nicht-Tage setzen und entfernen.",
    scopable: false,
  },
  {
    key: "roster.availability.manage_all",
    module: "dienstplan",
    label: "Verfügbarkeit aller pflegen",
    description: "Verfügbarkeit fremder Mitarbeiter ansehen und ändern.",
    scopable: false,
  },
  {
    key: "roster.absence.view",
    module: "dienstplan",
    label: "Abwesenheiten sehen",
    description: "Urlaub/Krank aller Mitarbeiter im Dienstplan ansehen.",
    scopable: false,
  },
  {
    key: "roster.absence.manage",
    module: "dienstplan",
    label: "Abwesenheiten pflegen",
    description: "Urlaub/Krank-Tage und -Zeiträume anlegen oder entfernen.",
    scopable: false,
  },
  {
    key: "roster.wish.create_self",
    module: "dienstplan",
    label: "Eigene Wunschfrei-Tage",
    description: "Wunschfrei-Tage für sich selbst eintragen und entfernen.",
    scopable: false,
  },
  {
    key: "roster.wish.view_all",
    module: "dienstplan",
    label: "Alle Wunschfrei-Tage sehen",
    description: "Wunschfrei-Tage aller Mitarbeiter ansehen.",
    scopable: false,
  },
  {
    key: "roster.wish.manage_all",
    module: "dienstplan",
    label: "Wunschfrei-Tage fremder MA pflegen",
    description: "Wunschfrei-Einträge anderer Mitarbeiter ändern oder löschen.",
    scopable: false,
  },
  {
    key: "roster.leave.request_self",
    module: "dienstplan",
    label: "Eigenen Urlaubsantrag stellen",
    description: "Urlaubsantrag einreichen oder offenen Antrag zurückziehen.",
    scopable: false,
  },
  {
    key: "roster.leave.view_all",
    module: "dienstplan",
    label: "Alle Urlaubsanträge sehen",
    description: "Antragsliste aller Mitarbeiter ansehen.",
    scopable: true,
  },
  {
    key: "roster.leave.decide",
    module: "dienstplan",
    label: "Urlaubsanträge entscheiden",
    description: "Anträge genehmigen oder ablehnen.",
    scopable: true,
  },
  {
    key: "roster.swap.view_pending",
    module: "dienstplan",
    label: "Tauschanfragen sehen",
    description: "Wartende und offene Schichttausch-Anfragen ansehen.",
    scopable: true,
  },
  {
    key: "roster.swap.decide",
    module: "dienstplan",
    label: "Tauschanfragen entscheiden",
    description: "Schichttausch genehmigen oder ablehnen.",
    scopable: true,
  },
  // ----- Modul Lohn/HR -----
  {
    key: "payroll.compensation.view",
    module: "lohn",
    label: "Vergütung sehen",
    description: "Stundenlohn aller Mitarbeiter ansehen.",
    scopable: false,
  },
  {
    key: "payroll.compensation.edit",
    module: "lohn",
    label: "Vergütung pflegen",
    description: "Stundenlohn anlegen, ändern, löschen.",
    scopable: false,
  },
  {
    key: "payroll.personal.view",
    module: "lohn",
    label: "Personaldaten sehen",
    description: "Personalakte (Adresse, SV-Nr, Steuer-ID, Bank etc.) öffnen.",
    scopable: false,
  },
  {
    key: "payroll.personal.edit",
    module: "lohn",
    label: "Personaldaten pflegen",
    description: "Personalakte anlegen oder ändern.",
    scopable: false,
  },
  {
    key: "payroll.personal.import",
    module: "lohn",
    label: "Personaldaten importieren",
    description: "CSV-Import von Personaldaten ausführen.",
    scopable: false,
  },
  {
    key: "payroll.calc.run",
    module: "lohn",
    label: "Lohnrechner ausführen",
    description: "Brutto-/Netto-Berechnung pro Mitarbeiter ausführen.",
    scopable: false,
  },
  {
    key: "payroll.period.view",
    module: "lohn",
    label: "Lohn-Periode sehen",
    description: "SFN-Periode (26.–25.) pro Mitarbeiter ansehen.",
    scopable: false,
  },
  // ----- Modul Aufgaben -----
  {
    key: "tasks.view",
    module: "aufgaben",
    label: "Aufgaben sehen",
    description: "Kanban-Board pro Standort öffnen.",
    scopable: true,
  },
  {
    key: "tasks.create",
    module: "aufgaben",
    label: "Aufgaben anlegen",
    description: "Neue Aufgabe erstellen.",
    scopable: true,
  },
  {
    key: "tasks.assign",
    module: "aufgaben",
    label: "Aufgaben zuweisen",
    description: "Aufgabe an Mitarbeiter zuweisen.",
    scopable: true,
  },
  {
    key: "tasks.change_status",
    module: "aufgaben",
    label: "Status ändern",
    description: "Status offen/läuft/erledigt wechseln.",
    scopable: true,
  },
  {
    key: "tasks.delete",
    module: "aufgaben",
    label: "Aufgaben archivieren",
    description: "Aufgabe aus dem Board entfernen (bleibt im Audit, wiederherstellbar; Admin).",
    scopable: true,
  },
  {
    key: "recipes.manage",
    module: "verkaufsartikel",
    label: "Rezepte verwalten",
    description:
      "Speisen-Rezepturen anlegen und ändern (Zwischenrezepte, Zutaten, Inhalt-Felder auf Einkaufsartikeln). Admin und Manager automatisch; einzelne Planer per Override.",
    scopable: false,
  },
] as const;

export function getPermissionMeta(key: AppPermission): PermissionMeta {
  const m = PERMISSION_CATALOG.find((p) => p.key === key);
  if (!m) throw new Error(`Unbekanntes Recht: ${key}`);
  return m;
}
