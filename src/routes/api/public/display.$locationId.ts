// Öffentlicher Display-Endpoint. Ohne Login, nur per Token erreichbar.
// Pfad /api/public/* bypasst die Auth-Schicht der Lovable-Publishing-Plattform.
// Token wird timing-safe verglichen; bei jedem Fehler 401/403 ohne Details.

import { createFileRoute } from "@tanstack/react-router";
import { Buffer } from "node:buffer";
import { timingSafeEqual } from "node:crypto";
import { resolveCellKind } from "@/lib/display/cell";
import { currentPeriodEnd, nextPeriodEnd, periodLabel } from "@/lib/display/period-split";
import {
  remindersForBusinessDate,
  type Reminder,
  type ReminderColor,
} from "@/lib/display/reminders";
import { businessDateOf } from "@/lib/business-date";

type DisplayCell = {
  k: "shift" | "urlaub" | "krank" | "wish" | "available" | "empty";
  skill: string | null;
  color: string | null;
};
type DisplayRow = {
  staffId: string;
  staffName: string;
  cells: DisplayCell[];
  shiftCountCurrent: number;
  shiftCountNext: number;
};
type DisplayBlock = {
  area: "kitchen" | "service";
  title: string;
  rows: DisplayRow[];
  dayCounts: number[];
};
type DisplayPeriodBlocks = {
  period: "mittag" | "abend";
  blocks: DisplayBlock[];
};
type DisplayReminder = {
  id: string;
  title: string;
  emoji: string | null;
  color: ReminderColor;
  weekday: number;
  intervalWeeks: 1 | 2;
  anchorDate: string | null;
  fromTime: string;
  untilTime: string;
  sortOrder: number;
};
type DisplayPayload = {
  location: { id: string; name: string };
  generatedAt: string;
  refreshIntervalSeconds: number;
  rotationIntervalSeconds: number;
  dayServiceEnabled: boolean;
  windowStart: string;
  windowEnd: string;
  days: string[];
  blocks: DisplayBlock[];
  /** SP1b — bei day_service_enabled: zwei Fenster-Blöcke (Mittag/Abend). */
  periodBlocks: DisplayPeriodBlocks[] | null;
  showAreas: string[] | null;
  showHeader: boolean;
  showFooter: boolean;
  customMessage: string | null;
  birthdays: string[];
  currentPeriodLabel: string;
  nextPeriodLabel: string;
  currentPeriodEnd: string;
  nextPeriodEnd: string;
  reminders: DisplayReminder[];
};

function jsonError(status: number, error: string) {
  return new Response(JSON.stringify({ error }), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}

function safeCompare(a: string, b: string): boolean {
  const aBuf = Buffer.from(a);
  const bBuf = Buffer.from(b);
  if (aBuf.length !== bBuf.length) return false;
  return timingSafeEqual(aBuf, bBuf);
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function rollingDays(startIso: string, count: number): string[] {
  const out: string[] = [];
  const d = new Date(startIso + "T00:00:00Z");
  for (let i = 0; i < count; i++) {
    out.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return out;
}

export const Route = createFileRoute("/api/public/display/$locationId")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const url = new URL(request.url);
        const token = url.searchParams.get("token") ?? "";
        const locationId = params.locationId;

        if (!token || token.length < 16 || token.length > 256) {
          return jsonError(401, "Ungültiger Sicherheits-Token.");
        }
        if (!/^[0-9a-fA-F-]{8,64}$/.test(locationId)) {
          return jsonError(400, "Ungültige Filial-ID.");
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        const { data: settings, error: settingsErr } = await supabaseAdmin
          .from("display_settings" as never)
          .select(
            "display_token, is_enabled, refresh_interval_seconds, organization_id, rotation_enabled, rotation_interval_seconds, show_areas, show_header, show_footer, custom_message",
          )
          .eq("location_id", locationId)
          .maybeSingle();

        if (settingsErr || !settings) {
          return jsonError(401, "Ungültiger Sicherheits-Token.");
        }

        const s = settings as {
          display_token: string;
          is_enabled: boolean;
          refresh_interval_seconds: number;
          organization_id: string;
          rotation_enabled: boolean;
          rotation_interval_seconds: number;
          show_areas: string[] | null;
          show_header: boolean;
          show_footer: boolean;
          custom_message: string | null;
        };

        if (!safeCompare(s.display_token, token)) {
          return jsonError(401, "Ungültiger Sicherheits-Token.");
        }
        if (!s.is_enabled) {
          return jsonError(403, "Display für diese Filiale ist deaktiviert.");
        }

        const { data: location, error: locErr } = await supabaseAdmin
          // ST1: bewusst ungefiltert — Daten-Zugriff (Display-API by id).
          .from("locations")
          .select("id, name, day_service_enabled")
          .eq("id", locationId)
          .eq("organization_id", s.organization_id)
          .maybeSingle();
        if (locErr || !location) return jsonError(404, "Filiale nicht gefunden.");
        const dayServiceEnabled =
          (location as { day_service_enabled?: boolean | null }).day_service_enabled === true;

        const today = todayIso();
        const businessDate = businessDateOf(new Date());
        const days = rollingDays(today, 31);
        const windowStart = days[0];
        const windowEnd = days[days.length - 1];
        const curEnd = currentPeriodEnd(today);
        const nxtEnd = nextPeriodEnd(curEnd);
        const curLabel = periodLabel(curEnd);
        const nxtLabel = periodLabel(nxtEnd);

        // Reminders des heutigen Geschäftstags — Client entscheidet über
        // Fälligkeit anhand fromTime (isReminderActive in reminders.ts).
        const { data: reminderRows } = await supabaseAdmin
          .from("display_reminders" as never)
          .select(
            "id, title, emoji, color, weekday, interval_weeks, anchor_date, from_time, until_time, sort_order",
          )
          .eq("organization_id", s.organization_id)
          .eq("location_id", locationId)
          .eq("is_active", true);
        const reminderList: Reminder[] = (
          (reminderRows ?? []) as Array<{
            id: string;
            title: string;
            emoji: string | null;
            color: string;
            weekday: number;
            interval_weeks: number;
            anchor_date: string | null;
            from_time: string;
            until_time: string;
            sort_order: number;
          }>
        ).map((r) => ({
          id: r.id,
          title: r.title,
          emoji: r.emoji,
          color: r.color as ReminderColor,
          weekday: r.weekday,
          intervalWeeks: (r.interval_weeks === 2 ? 2 : 1) as 1 | 2,
          anchorDate: r.anchor_date,
          fromTime: (r.from_time ?? "").slice(0, 5),
          untilTime: (r.until_time ?? "01:00").slice(0, 5),
          sortOrder: r.sort_order,
        }));
        const todaysReminders: DisplayReminder[] = remindersForBusinessDate(
          reminderList,
          businessDate,
        ).map((r) => ({
          id: r.id,
          title: r.title,
          emoji: r.emoji,
          color: r.color,
          weekday: r.weekday,
          intervalWeeks: r.intervalWeeks,
          anchorDate: r.anchorDate,
          fromTime: r.fromTime,
          untilTime: r.untilTime,
          sortOrder: r.sortOrder,
        }));

        // Geburtstage des aktiven Teams am Standort (Tag+Monat == heute).
        const todayMmDd = today.slice(5); // "MM-DD"
        const birthdays: string[] = [];
        const { data: locRows } = await supabaseAdmin
          .from("staff_locations")
          .select("staff_id")
          .eq("location_id", locationId)
          .eq("organization_id", s.organization_id);
        const teamIds = Array.from(
          new Set((locRows ?? []).map((r) => (r as { staff_id: string }).staff_id)),
        );
        if (teamIds.length) {
          const { data: teamRows } = await supabaseAdmin
            .from("staff")
            .select("id, first_name, last_name, display_name")
            .in("id", teamIds)
            .eq("is_active", true);
          const activeIds = (teamRows ?? []).map((r) => (r as { id: string }).id);
          if (activeIds.length) {
            const { data: dobRows } = await supabaseAdmin
              .from("staff_personal_details")
              .select("staff_id, date_of_birth")
              .in("staff_id", activeIds);
            const dobMap = new Map<string, string>();
            for (const d of dobRows ?? []) {
              const r = d as { staff_id: string; date_of_birth: string | null };
              if (r.date_of_birth) dobMap.set(r.staff_id, String(r.date_of_birth).slice(5, 10));
            }
            for (const t of teamRows ?? []) {
              const r = t as {
                id: string;
                first_name: string | null;
                last_name: string | null;
                display_name: string | null;
              };
              if (dobMap.get(r.id) === todayMmDd) {
                const name = r.display_name || `${r.first_name ?? ""} ${r.last_name ?? ""}`.trim();
                if (name) birthdays.push(name);
              }
            }
          }
        }

        // Zeilenbasis: payroll-IDs ausschließen, Standort-Mitarbeiter laden.
        const { data: payrollRows, error: payrollErr } = await supabaseAdmin
          .from("role_assignments")
          .select("staff_id")
          .eq("organization_id", s.organization_id)
          .eq("role", "payroll");
        if (payrollErr) return jsonError(500, "Daten konnten nicht geladen werden.");
        const payrollIds = new Set((payrollRows ?? []).map((r) => r.staff_id as string));

        const { data: slRows, error: slErr } = await supabaseAdmin
          .from("staff_locations")
          .select("staff_id, department, staff(id, display_name, is_active)")
          .eq("organization_id", s.organization_id)
          .eq("location_id", locationId);
        if (slErr) return jsonError(500, "Daten konnten nicht geladen werden.");

        type RowEntry = {
          staffId: string;
          staffName: string;
          area: "kitchen" | "service";
        };
        const rowEntries: RowEntry[] = [];
        const rowSeen = new Set<string>();
        for (const r of slRows ?? []) {
          const staffId = r.staff_id as string;
          if (payrollIds.has(staffId)) continue;
          const st = r.staff as { display_name: string | null; is_active: boolean } | null;
          if (st?.is_active === false) continue;
          const dept = r.department as "kitchen" | "service" | "gl" | null;
          const area: "kitchen" | "service" = dept === "kitchen" ? "kitchen" : "service";
          const key = `${staffId}|${area}`;
          if (rowSeen.has(key)) continue;
          rowSeen.add(key);
          rowEntries.push({
            staffId,
            staffName: st?.display_name ?? "—",
            area,
          });
        }
        rowEntries.sort((a, b) => a.staffName.localeCompare(b.staffName, "de"));

        const rowStaffIds = Array.from(new Set(rowEntries.map((r) => r.staffId)));
        const idSafe = rowStaffIds.length ? rowStaffIds : ["00000000-0000-0000-0000-000000000000"];

        // Schichten im Fenster.
        const { data: shiftRows, error: shiftErr } = await supabaseAdmin
          .from("roster_shifts")
          .select("staff_id, shift_date, area, skill_id, service_period")
          .eq("organization_id", s.organization_id)
          .eq("location_id", locationId)
          .gte("shift_date", windowStart)
          .lte("shift_date", windowEnd);
        if (shiftErr) return jsonError(500, "Daten konnten nicht geladen werden.");

        // Map staffId|date|blockArea(|period) → skill_id (gesetzten Eintrag bevorzugen).
        // Ohne Tagesbetrieb ignorieren wir das Fenster (Legacy-Verhalten, alle
        // Schichten in einer Ansicht). Mit Tagesbetrieb wird das Fenster in
        // den Key aufgenommen und pro Fenster ein eigener Block gebaut.
        const shiftMap = new Map<string, string | null>();
        const skillIdSet = new Set<string>();
        for (const sh of shiftRows ?? []) {
          const staffId = sh.staff_id as string;
          const date = sh.shift_date as string;
          const rawArea = sh.area as string;
          const blockArea: "kitchen" | "service" = rawArea === "kitchen" ? "kitchen" : "service";
          const skillId = (sh.skill_id as string | null) ?? null;
          const period = ((sh.service_period as string | null) ?? "abend") as "mittag" | "abend";
          const keys = dayServiceEnabled
            ? [`${staffId}|${date}|${blockArea}|${period}`]
            : [`${staffId}|${date}|${blockArea}`];
          for (const key of keys) {
            const existing = shiftMap.get(key);
            if (existing === undefined || (existing === null && skillId !== null)) {
              shiftMap.set(key, skillId);
            }
          }
          if (skillId) skillIdSet.add(skillId);
        }

        // Skills.
        const skillIds = Array.from(skillIdSet);
        const skillMap = new Map<string, { name: string; color: string | null }>();
        if (skillIds.length) {
          const { data: skRows, error: skErr } = await supabaseAdmin
            .from("skills")
            .select("id, name, color")
            .in("id", skillIds);
          if (skErr) return jsonError(500, "Daten konnten nicht geladen werden.");
          for (const sk of skRows ?? []) {
            skillMap.set(sk.id as string, {
              name: sk.name as string,
              color: (sk.color as string | null) ?? null,
            });
          }
        }

        // Overlays (org-weit, nicht standort-gefiltert).
        const [absRes, wishRes, availRes] = await Promise.all([
          supabaseAdmin
            .from("roster_absence")
            .select("staff_id, date, type")
            .eq("organization_id", s.organization_id)
            .in("staff_id", idSafe)
            .gte("date", windowStart)
            .lte("date", windowEnd),
          supabaseAdmin
            .from("day_off_wishes")
            .select("staff_id, wish_date")
            .eq("organization_id", s.organization_id)
            .in("staff_id", idSafe)
            .gte("wish_date", windowStart)
            .lte("wish_date", windowEnd),
          supabaseAdmin
            .from("roster_availability")
            .select("staff_id, date")
            .eq("organization_id", s.organization_id)
            .in("staff_id", idSafe)
            .gte("date", windowStart)
            .lte("date", windowEnd),
        ]);
        if (absRes.error || wishRes.error || availRes.error) {
          return jsonError(500, "Daten konnten nicht geladen werden.");
        }
        const absenceMap = new Map<string, "urlaub" | "krank">();
        for (const a of absRes.data ?? []) {
          const t = a.type as string;
          if (t === "urlaub" || t === "krank") {
            absenceMap.set(`${a.staff_id as string}|${a.date as string}`, t);
          }
        }
        const wishSet = new Set<string>(
          (wishRes.data ?? []).map((w) => `${w.staff_id as string}|${w.wish_date as string}`),
        );
        const availSet = new Set<string>(
          (availRes.data ?? []).map((a) => `${a.staff_id as string}|${a.date as string}`),
        );

        // Blöcke bauen.
        const wantedAreas = s.show_areas;
        const areaOrder: Array<{ area: "kitchen" | "service"; title: string }> = [
          { area: "kitchen", title: "Küche" },
          { area: "service", title: "Service" },
        ];
        const blocks: DisplayBlock[] = [];
        for (const { area, title } of areaOrder) {
          if (wantedAreas && !wantedAreas.includes(area)) continue;
          const blockRows = rowEntries.filter((r) => r.area === area);
          const dayCounts = new Array<number>(days.length).fill(0);
          const rows: DisplayRow[] = blockRows.map((entry) => {
            const cells: DisplayCell[] = days.map((date, i) => {
              const shiftKey = `${entry.staffId}|${date}|${area}`;
              const hasShift = shiftMap.has(shiftKey);
              const overlayKey = `${entry.staffId}|${date}`;
              const absenceType = absenceMap.get(overlayKey) ?? null;
              const hasWish = wishSet.has(overlayKey);
              const hasAvailability = availSet.has(overlayKey);
              const k = resolveCellKind({ hasShift, absenceType, hasWish, hasAvailability });
              let skill: string | null = null;
              let color: string | null = null;
              if (k === "shift") {
                const sid = shiftMap.get(shiftKey) ?? null;
                const meta = sid ? (skillMap.get(sid) ?? null) : null;
                skill = meta?.name ?? null;
                color = meta?.color ?? null;
                dayCounts[i] += 1;
              }
              return { k, skill, color };
            });
            let shiftCountCurrent = 0;
            let shiftCountNext = 0;
            for (let i = 0; i < cells.length; i++) {
              if (cells[i].k !== "shift") continue;
              if (days[i] <= curEnd) shiftCountCurrent += 1;
              else shiftCountNext += 1;
            }
            return {
              staffId: entry.staffId,
              staffName: entry.staffName,
              cells,
              shiftCountCurrent,
              shiftCountNext,
            };
          });
          blocks.push({ area, title, rows, dayCounts });
        }

        const payload: DisplayPayload = {
          location: { id: location.id, name: location.name },
          generatedAt: new Date().toISOString(),
          refreshIntervalSeconds: s.refresh_interval_seconds,
          windowStart,
          windowEnd,
          days,
          blocks,
          showAreas: s.show_areas,
          showHeader: s.show_header,
          showFooter: s.show_footer,
          customMessage: s.custom_message,
          birthdays,
          currentPeriodLabel: curLabel,
          nextPeriodLabel: nxtLabel,
          currentPeriodEnd: curEnd,
          nextPeriodEnd: nxtEnd,
          reminders: todaysReminders,
        };

        return new Response(JSON.stringify(payload), {
          status: 200,
          headers: { "content-type": "application/json", "cache-control": "no-store" },
        });
      },
    },
  },
});
