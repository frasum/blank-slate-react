// KI1 — Werkzeugkasten für „Frag COCO" (Welle 1). JSON-Schema-Definitionen
// je Tool + typisierte Union `ToolName`. Ausführungslogik liegt in
// `tool-dispatcher.server.ts` — hier NUR Beschreibung/Schema (auch am Client
// importierbar, falls die UI später Tools listen möchte).

import type { ToolDef } from "./anthropic-client";

export const TOOL_NAMES = [
  "stammdaten_lookup",
  "getraenke_ranking",
  "umsatz_zeitraum",
  "arbeitsstunden",
  "abwesenheiten",
  "personalkosten_quote",
  "kasse_tagesabschluss",
  "bestellungen_zeitraum",
  "inventur_aktuell",
  "bwa_monat",
  "bilanz_summen",
  "dienstplan_geplant",
  "aufgaben_status",
  "tausch_anfragen",
  "urlaub_antraege",
  "branchenbenchmark_lookup",
] as const;

export type ToolName = (typeof TOOL_NAMES)[number];

export const TOOLS: ToolDef[] = [
  {
    name: "stammdaten_lookup",
    description:
      "Liefert Referenzdaten der Organisation, damit du Standorte, Warengruppen und Zeitraum-Presets korrekt benennst statt zu raten.",
    input_schema: {
      type: "object",
      properties: {
        art: {
          type: "string",
          enum: ["warengruppen", "standorte", "zeitraum_presets"],
          description: "Welche Stammdaten sollen geladen werden?",
        },
      },
      required: ["art"],
    },
  },
  {
    name: "getraenke_ranking",
    description:
      "Renner & Penner-Rangliste der Getränke (Wein/Spirituosen/Cocktails etc.) aus dem POS-Snapshot. Wein wird über Portion+Flasche zusammengefasst. Der Snapshot deckt entweder die letzten 365 Tage oder den gesamten erfassten Zeitraum ab — beliebige Datumsfenster sind für Getränke NICHT möglich.",
    input_schema: {
      type: "object",
      properties: {
        period: {
          type: "string",
          enum: ["d365", "alltime"],
          description: "Snapshot-Fenster.",
        },
        gruppen: {
          type: "array",
          items: { type: "string" },
          description: "Filter auf Warengruppen (case-insensitiv). Leer = alle Getränkegruppen.",
        },
        location_id: {
          type: "string",
          description: "Optionaler Standort (UUID). Leer = alle Standorte kombiniert.",
        },
        top_n: {
          type: "integer",
          description: "Wieviele Zeilen pro Rangliste (Default 10, max. 20).",
        },
      },
      required: ["period"],
    },
  },
  {
    name: "umsatz_zeitraum",
    description:
      "Netto-/Brutto-Umsatz der Sessions in einem Datumsfenster (inklusive Kanal-Splittung Haus/Takeaway). Datumsangaben immer als ISO YYYY-MM-DD.",
    input_schema: {
      type: "object",
      properties: {
        from: { type: "string", description: "Startdatum (ISO YYYY-MM-DD, inklusive)." },
        to: { type: "string", description: "Enddatum (ISO YYYY-MM-DD, inklusive)." },
        location_id: { type: "string", description: "Optionaler Standort (UUID)." },
      },
      required: ["from", "to"],
    },
  },
  {
    name: "arbeitsstunden",
    description:
      "Netto-Arbeitsstunden aus Time-Entries (Pausen bereinigt), aggregiert pro Standort und optional Abteilung. Deckt geschlossene Schichten (mit ended_at) ab.",
    input_schema: {
      type: "object",
      properties: {
        from: { type: "string" },
        to: { type: "string" },
        department: {
          type: "string",
          enum: ["service", "kueche", "kitchen"],
          description: "Optional; 'kueche' und 'kitchen' sind Synonyme.",
        },
        location_id: { type: "string" },
      },
      required: ["from", "to"],
    },
  },
  {
    name: "abwesenheiten",
    description:
      "Krank-/Urlaubstage pro Mitarbeiter aus dem Dienstplan (roster_absence). Personenangaben sind pseudonymisiert (MA-1, MA-2 …).",
    input_schema: {
      type: "object",
      properties: {
        from: { type: "string" },
        to: { type: "string" },
        typ: { type: "string", enum: ["krank", "urlaub"] },
      },
      required: ["from", "to"],
    },
  },
  {
    name: "personalkosten_quote",
    description:
      "Personalkosten (Brutto-Basis: Netto-Stunden × staff_compensation.hourly_rate) gegenüber Umsatz für ein Datumsfenster. Wichtiger Hinweis für die Antwort: AG-SV-Anteil und SFN-Zuschläge sind NICHT enthalten — die Quote ist eine Näherung.",
    input_schema: {
      type: "object",
      properties: {
        from: { type: "string" },
        to: { type: "string" },
        location_id: { type: "string" },
      },
      required: ["from", "to"],
    },
  },
  {
    name: "kasse_tagesabschluss",
    description:
      "Kasse: Aggregierte Session-Kennzahlen für einen Datumsbereich — Umsatz, Ausgaben (Barentnahmen), Kartenzahlungen, Bank-Einzahlungen, Tresor-Transfers, Gutscheine, Gästezahl, Session-Anzahl. KEIN Zugriff auf Personallohn/-details.",
    input_schema: {
      type: "object",
      properties: {
        from: { type: "string" },
        to: { type: "string" },
        location_id: { type: "string" },
      },
      required: ["from", "to"],
    },
  },
  {
    name: "bestellungen_zeitraum",
    description:
      "Wareneinkauf: Bestellungen (orders) pro Lieferant in einem Datumsbereich (nach Bestelldatum created_at). Liefert Bestellanzahl, Gesamtsumme (brutto), Top-Lieferanten. Optional Standort- oder Lieferantenfilter.",
    input_schema: {
      type: "object",
      properties: {
        from: { type: "string" },
        to: { type: "string" },
        location_id: { type: "string" },
        supplier_id: { type: "string" },
        status: {
          type: "string",
          enum: ["pending", "confirmed", "cancelled", "any"],
          description: "Filter auf Bestellstatus. 'any' = alle.",
        },
      },
      required: ["from", "to"],
    },
  },
  {
    name: "inventur_aktuell",
    description:
      "Aktueller Inventurwert je Standort: letzte abgeschlossene Inventur (completed) mit Gesamtwert in EUR, Datum und Anzahl gezählter Artikel. Optional Standortfilter.",
    input_schema: {
      type: "object",
      properties: {
        location_id: { type: "string" },
      },
    },
  },
  {
    name: "bwa_monat",
    description:
      "BWA-Monatszahlen aus bwa_monthly. Aggregiert über cost_center (Standort) und optional entity (Betrieb). Liefert Umsatz, Personal, Wareneinsatz, Sachkosten, Abschreibung, Betriebsergebnis.",
    input_schema: {
      type: "object",
      properties: {
        month: {
          type: "string",
          description: "Monat als YYYY-MM oder YYYY-MM-01.",
        },
        entity: {
          type: "string",
          description: "Optional: nur ein Betrieb (z. B. 'spicery', 'yumco').",
        },
        cost_center: {
          type: "string",
          description: "Optional: nur ein cost_center (Standort-Kürzel).",
        },
      },
      required: ["month"],
    },
  },
  {
    name: "bilanz_summen",
    description:
      "Bilanz-Summen aus bilanz_positions für ein Geschäftsjahr und einen Betrieb. Aggregiert auf oberster Ebene (level=1) pro statement (aktiva/passiva/ertrag/aufwand).",
    input_schema: {
      type: "object",
      properties: {
        fiscal_year: { type: "integer", description: "Geschäftsjahr, z. B. 2025." },
        entity: { type: "string", description: "Betrieb (z. B. 'spicery')." },
      },
      required: ["fiscal_year", "entity"],
    },
  },
  {
    name: "dienstplan_geplant",
    description:
      "Geplante Schichten aus dem Dienstplan (roster_shifts) für einen Datumsbereich. Liefert Anzahl Schichten insgesamt, pro Abteilung, pro Servicezeit (früh/mittag/abend) und pseudonymisiert pro Mitarbeiter. HINWEIS: geplante Stunden sind nicht hinterlegt — hier zählt die Schichtanzahl. Für tatsächliche Stunden nutze arbeitsstunden.",
    input_schema: {
      type: "object",
      properties: {
        from: { type: "string" },
        to: { type: "string" },
        location_id: { type: "string" },
        department: {
          type: "string",
          enum: ["service", "kitchen", "gl"],
        },
      },
      required: ["from", "to"],
    },
  },
  {
    name: "aufgaben_status",
    description:
      "Kanban-Aufgaben: Zählungen pro Status (offen/laufend/erledigt/abgebrochen), pro Kategorie und Anzahl überfällig (due_at < heute, offen). Optional Standort- oder Kategoriefilter. Ohne Datumsfilter = aktueller Bestand (nicht archiviert).",
    input_schema: {
      type: "object",
      properties: {
        location_id: { type: "string" },
        category: {
          type: "string",
          enum: ["service", "kitchen", "maintenance", "manager_admin"],
        },
      },
    },
  },
  {
    name: "tausch_anfragen",
    description:
      "Schicht-Tauschanfragen (shift_swap_requests). Ohne Filter = alle offenen (Status pending/peer_accepted). Liefert Zusammenfassung und pseudonymisierte Liste (MA-Codes) mit Datum und Standort.",
    input_schema: {
      type: "object",
      properties: {
        status: {
          type: "string",
          enum: ["open", "pending", "peer_accepted", "approved", "rejected", "cancelled", "any"],
          description: "'open' = pending + peer_accepted (Default).",
        },
        from: { type: "string" },
        to: { type: "string" },
      },
    },
  },
  {
    name: "urlaub_antraege",
    description:
      "Urlaubsanträge (leave_requests). Ohne Filter = alle offenen ('offen'). Optional Zeitraum (überschneidet start/end). Liefert Zusammenfassung und pseudonymisierte Liste mit Zeiträumen.",
    input_schema: {
      type: "object",
      properties: {
        status: {
          type: "string",
          enum: ["offen", "genehmigt", "abgelehnt", "any"],
        },
        from: { type: "string" },
        to: { type: "string" },
      },
    },
  },
];
