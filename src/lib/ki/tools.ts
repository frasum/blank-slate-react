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
          description:
            "Filter auf Warengruppen (case-insensitiv). Leer = alle Getränkegruppen.",
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
];