// TRMNL1 — reine Aufbereitungs-Helfer für die stille E-Ink-Bild-Route.
// Alle Funktionen sind pur (kein I/O, kein React) und werden mit Vitest
// getestet. Die Server-Route liest Rohdaten und ruft diese Helfer.

import type { Task, TaskStatus } from "@/lib/aufgaben/types";

/** Umschlagsschwelle (Europe/Berlin) für Roster: ab dieser Stunde MORGEN zeigen. */
export const ROSTER_LOOKAHEAD_HOUR = 20;

/** Kanban-Spalten für TRMNL: bewusst nur offene + laufende Aufgaben. */
export const TRMNL_COLUMNS: readonly TaskStatus[] = ["open", "in_progress"] as const;

/** Zieltag der Personal-Anzeige: vor 20 Uhr Berlin = heute, ab 20 Uhr = morgen. */
export function resolveRosterTarget(now: Date): {
  iso: string;
  label: "Heute im Dienst" | "Morgen im Dienst";
  hour: number;
} {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Berlin",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(now);
  const get = (t: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === t)?.value ?? "";
  const y = Number(get("year"));
  const m = Number(get("month"));
  const d = Number(get("day"));
  const rawHour = get("hour");
  const hour = rawHour === "24" ? 0 : Number(rawHour);
  const shift = hour >= ROSTER_LOOKAHEAD_HOUR ? 1 : 0;
  // Um DST-Sprünge zu vermeiden: mit UTC-Noon rechnen und Tag draufzählen.
  const base = Date.UTC(y, m - 1, d, 12, 0, 0);
  const target = new Date(base + shift * 24 * 60 * 60 * 1000);
  const iso = `${target.getUTCFullYear()}-${String(target.getUTCMonth() + 1).padStart(2, "0")}-${String(target.getUTCDate()).padStart(2, "0")}`;
  return {
    iso,
    label: shift === 0 ? "Heute im Dienst" : "Morgen im Dienst",
    hour,
  };
}

/** Überfällig = due_at liegt vor now. NULL / ohne Datum → nicht überfällig. */
export function isOverdue(dueAtIso: string | null, now: Date): boolean {
  if (!dueAtIso) return false;
  const t = Date.parse(dueAtIso);
  if (Number.isNaN(t)) return false;
  return t < now.getTime();
}

/** Sortiert Karten: Priorität DESC, dann due_at ASC (NULL zuletzt), dann Titel. */
export function sortCards(rows: Task[]): Task[] {
  return [...rows].sort((a, b) => {
    if (b.priority !== a.priority) return b.priority - a.priority;
    const ad = a.due_at ? Date.parse(a.due_at) : Number.POSITIVE_INFINITY;
    const bd = b.due_at ? Date.parse(b.due_at) : Number.POSITIVE_INFINITY;
    if (ad !== bd) return ad - bd;
    return a.title.localeCompare(b.title, "de");
  });
}

export type BoardColumn = {
  status: TaskStatus;
  visible: Task[];
  overflow: number;
};

/** Board: nur offen/läuft. Pro Spalte harter Deckel `columnLimit`, Rest → overflow. */
export function buildBoard(
  tasks: Task[],
  columnLimit: number,
  columns: readonly TaskStatus[] = TRMNL_COLUMNS,
): BoardColumn[] {
  if (columnLimit < 0) throw new Error("columnLimit muss >= 0 sein.");
  const grouped = new Map<TaskStatus, Task[]>();
  for (const c of columns) grouped.set(c, []);
  for (const t of tasks) {
    const arr = grouped.get(t.status);
    if (arr) arr.push(t);
  }
  return columns.map((status) => {
    const sorted = sortCards(grouped.get(status) ?? []);
    const visible = sorted.slice(0, columnLimit);
    const overflow = Math.max(0, sorted.length - visible.length);
    return { status, visible, overflow };
  });
}

export type ActionBadge = {
  key: "orders" | "leaves" | "swaps" | "wishes";
  count: number;
  label: string;
  icon: string;
  emphasize: boolean;
};

export type ActionCounts = {
  openLeaves: number;
  openSwaps: number;
  futureWishes: number;
  unsentOrders: number;
};

/**
 * Handlungs-Badges in fester Reihenfolge, 0-Werte werden ausgeblendet.
 * Bestellungen (unsent) stehen immer zuerst und sind hervorgehoben,
 * wenn > 0 (dringlichster operativer Punkt).
 */
export function actionBadges(counts: ActionCounts): ActionBadge[] {
  const all: ActionBadge[] = [
    {
      key: "orders",
      count: counts.unsentOrders,
      label: "Bestellungen offen",
      icon: "✉",
      emphasize: counts.unsentOrders > 0,
    },
    {
      key: "leaves",
      count: counts.openLeaves,
      label: "Urlaub",
      icon: "⧖",
      emphasize: false,
    },
    {
      key: "swaps",
      count: counts.openSwaps,
      label: "Tausch",
      icon: "⇄",
      emphasize: false,
    },
    {
      key: "wishes",
      count: counts.futureWishes,
      label: "Freiwunsch",
      icon: "☆",
      emphasize: false,
    },
  ];
  return all.filter((b) => b.count > 0);
}

// -------- Roster-Aufbereitung --------

export type RosterShiftLite = {
  staffId: string;
  locationId: string;
  area: string; // kitchen | service | gl
  servicePeriod: string | null; // frueh | mittag | abend
};

export type RosterGroup = {
  areaKey: "kitchen" | "service" | "gl";
  areaLabel: string;
  period: "frueh" | "mittag" | "abend" | null;
  names: string[];
};

export type RosterLocationBlock = {
  locationId: string;
  locationName: string;
  groups: RosterGroup[];
  total: number;
};

/**
 * Kappt eine Namensliste bei `max` Einträgen; Rest als `overflow`-Zähler.
 * Wird für die 800×480-Kompaktansicht genutzt (feste Zeilenbreite).
 */
export function truncateNames(
  names: string[],
  max: number,
): { visible: string[]; overflow: number } {
  if (max < 0) throw new Error("max muss >= 0 sein.");
  if (names.length <= max) return { visible: names.slice(), overflow: 0 };
  return { visible: names.slice(0, max), overflow: names.length - max };
}

/**
 * Kürzt Text auf höchstens `max` Zeichen; hängt ein Ellipsis-Zeichen an,
 * wenn tatsächlich gekappt wurde. `max` schließt das Ellipsis-Zeichen ein.
 */
export function ellipsize(text: string, max: number): string {
  if (max <= 0) return "";
  if (text.length <= max) return text;
  if (max === 1) return "…";
  return text.slice(0, max - 1) + "…";
}

const AREA_LABEL: Record<string, string> = {
  kitchen: "Küche",
  service: "Service",
  gl: "GL",
};

const PERIOD_ORDER: Record<string, number> = { frueh: 0, mittag: 1, abend: 2 };
const PERIOD_LABEL: Record<string, string> = {
  frueh: "Früh",
  mittag: "Mittag",
  abend: "Abend",
};

/**
 * Gruppiert Schichten des Zieltags nach Standort → Bereich (optional Fenster).
 * Ist an einem Standort mehr als ein Fenster aktiv, wird zusätzlich nach
 * Fenster gruppiert; sonst nur nach Bereich. Abwesende Personen werden
 * ausgeschlossen. Namen alphabetisch, Bereiche kitchen → service → gl.
 */
export function groupRosterByLocation(input: {
  shifts: RosterShiftLite[];
  staffNames: Map<string, string>;
  locationNames: Map<string, string>;
  absentStaffIds: Set<string>;
}): RosterLocationBlock[] {
  const { shifts, staffNames, locationNames, absentStaffIds } = input;
  const byLoc = new Map<string, RosterShiftLite[]>();
  for (const s of shifts) {
    if (absentStaffIds.has(s.staffId)) continue;
    const arr = byLoc.get(s.locationId) ?? [];
    arr.push(s);
    byLoc.set(s.locationId, arr);
  }

  const blocks: RosterLocationBlock[] = [];
  for (const [locationId, rows] of byLoc) {
    // Fenster-Gruppierung nur, wenn tatsächlich > 1 Fenster im Standort erscheint.
    const periods = new Set(
      rows.map((r) =>
        r.servicePeriod && PERIOD_ORDER[r.servicePeriod] !== undefined ? r.servicePeriod : "abend",
      ),
    );
    const useWindows = periods.size > 1;

    // Key: area|period (period null wenn !useWindows)
    const groupMap = new Map<
      string,
      {
        areaKey: "kitchen" | "service" | "gl";
        period: "frueh" | "mittag" | "abend" | null;
        names: Set<string>;
      }
    >();
    for (const r of rows) {
      const areaKey: "kitchen" | "service" | "gl" =
        r.area === "kitchen" ? "kitchen" : r.area === "service" ? "service" : "gl";
      const period = useWindows
        ? ((PERIOD_ORDER[r.servicePeriod ?? "abend"] !== undefined ? r.servicePeriod : "abend") as
            | "frueh"
            | "mittag"
            | "abend")
        : null;
      const key = `${areaKey}|${period ?? ""}`;
      const bucket = groupMap.get(key) ?? { areaKey, period, names: new Set<string>() };
      bucket.names.add(staffNames.get(r.staffId) ?? "—");
      groupMap.set(key, bucket);
    }

    const groups: RosterGroup[] = Array.from(groupMap.values())
      .map((g) => ({
        areaKey: g.areaKey,
        areaLabel: AREA_LABEL[g.areaKey] + (g.period ? ` · ${PERIOD_LABEL[g.period]}` : ""),
        period: g.period,
        names: Array.from(g.names).sort((a, b) => a.localeCompare(b, "de")),
      }))
      .sort((a, b) => {
        const areaRank: Record<string, number> = { kitchen: 0, service: 1, gl: 2 };
        if (areaRank[a.areaKey] !== areaRank[b.areaKey])
          return areaRank[a.areaKey] - areaRank[b.areaKey];
        const ap = a.period ? PERIOD_ORDER[a.period] : 0;
        const bp = b.period ? PERIOD_ORDER[b.period] : 0;
        return ap - bp;
      });

    const total = groups.reduce((n, g) => n + g.names.length, 0);
    blocks.push({
      locationId,
      locationName: locationNames.get(locationId) ?? "—",
      groups,
      total,
    });
  }

  blocks.sort((a, b) => a.locationName.localeCompare(b.locationName, "de"));
  return blocks;
}
