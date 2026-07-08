// TRMNL2 — Stille, token-geschützte HTML-Route für das E-Ink-Display
// TRMNL X (1872×1404, 16 Graustufen) mit rollierendem 14-Tage-Dienstplan
// (Service · Abend) pro Standort. Sicherheitsmuster identisch zu TRMNL1
// (trmnl-tasks.$token.ts): Längen-Gate, timing-safe Vergleich, bei jedem
// Fehler generisches 404, cache-control: no-store, escapeHtml überall.
//
// Query-Parameter `location` (uuid, Pflicht): muss zur selben Organisation
// gehören wie das Token. Kein Default — falsche/fehlende Location = 404.

import { createFileRoute } from "@tanstack/react-router";
import { Buffer } from "node:buffer";
import { timingSafeEqual } from "node:crypto";
import { buildDisplayData } from "@/lib/display/display-data.server";
import { buildRosterGrid, EMPTY_MARKER, type Grid } from "@/lib/trmnl/roster-grid";

function notFound(): Response {
  return new Response("Not found", {
    status: 404,
    headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" },
  });
}

function safeCompare(a: string, b: string): boolean {
  const aBuf = Buffer.from(a);
  const bBuf = Buffer.from(b);
  if (aBuf.length !== bBuf.length) return false;
  return timingSafeEqual(aBuf, bBuf);
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatDayHeader(iso: string): { wd: string; dm: string; dow: number } {
  const d = new Date(iso + "T00:00:00Z");
  const wd = d.toLocaleDateString("de-DE", { weekday: "short", timeZone: "UTC" });
  const dm = `${String(d.getUTCDate()).padStart(2, "0")}.`;
  return { wd, dm, dow: d.getUTCDay() };
}

function todayIsoBerlin(): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Berlin",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const get = (t: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

function formatDateHuman(iso: string): string {
  const d = new Date(iso + "T12:00:00Z");
  return d.toLocaleDateString("de-DE", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

export const Route = createFileRoute("/api/public/trmnl-dienstplan/$token")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const token = String(params.token ?? "");
        if (token.length < 16 || token.length > 256) return notFound();

        const url = new URL(request.url);
        const locationId = url.searchParams.get("location") ?? "";
        if (!/^[0-9a-fA-F-]{8,64}$/.test(locationId)) return notFound();

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        // Org via Token (Muster TRMNL1).
        type OrgTokenRow = { id: string; name: string; trmnl_token: string | null };
        type OrgQuery = {
          select: (cols: string) => {
            eq: (
              col: string,
              val: string,
            ) => {
              maybeSingle: () => Promise<{
                data: OrgTokenRow | null;
                error: { message: string } | null;
              }>;
            };
          };
        };
        const orgQ = supabaseAdmin.from("organizations") as unknown as OrgQuery;
        const { data: orgRow, error: orgErr } = await orgQ
          .select("id, name, trmnl_token")
          .eq("trmnl_token", token)
          .maybeSingle();
        if (orgErr || !orgRow || !orgRow.trmnl_token) return notFound();
        if (!safeCompare(orgRow.trmnl_token, token)) return notFound();

        const orgId = orgRow.id;

        // Location muss zur Org gehören — sonst generisches 404.
        const { data: locRow, error: locErr } = await supabaseAdmin
          .from("locations")
          .select("id, name")
          .eq("id", locationId)
          .eq("organization_id", orgId)
          .maybeSingle();
        if (locErr || !locRow) return notFound();

        const result = await buildDisplayData(supabaseAdmin, {
          organizationId: orgId,
          locationId,
          days: 14,
          showAreas: ["service"],
        });
        if (!result.ok) return notFound();

        const grid = buildRosterGrid(result.data, {
          area: "service",
          period: "abend",
          days: 14,
        });

        const html = renderPage({
          locationName: locRow.name,
          todayIso: todayIsoBerlin(),
          grid,
          now: new Date(),
        });

        return new Response(html, {
          status: 200,
          headers: {
            "content-type": "text/html; charset=utf-8",
            "cache-control": "no-store",
          },
        });
      },
    },
  },
});

function renderPage(input: {
  locationName: string;
  todayIso: string;
  grid: Grid;
  now: Date;
}): string {
  const timeStr = input.now.toLocaleString("de-DE", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Berlin",
  });
  const todayHuman = formatDateHuman(input.todayIso);

  const headerCells = input.grid.days
    .map((iso) => {
      const { wd, dm, dow } = formatDayHeader(iso);
      const we = dow === 0 || dow === 6;
      const today = iso === input.todayIso;
      const cls = ["day-head", we ? "we" : "", today ? "today" : ""].filter(Boolean).join(" ");
      return `<th class="${cls}"><div class="wd">${escapeHtml(wd)}</div><div class="dm">${escapeHtml(dm)}</div></th>`;
    })
    .join("");

  const rowsHtml =
    input.grid.rows.length === 0
      ? `<tr><td class="name">—</td>${input.grid.days
          .map(() => `<td class="cell empty">${EMPTY_MARKER}</td>`)
          .join("")}</tr>`
      : input.grid.rows
          .map((r) => {
            const cells = r.markers
              .map((m, i) => {
                const iso = input.grid.days[i];
                const { dow } = formatDayHeader(iso);
                const we = dow === 0 || dow === 6;
                const today = iso === input.todayIso;
                const empty = m === EMPTY_MARKER;
                const cls = ["cell", we ? "we" : "", today ? "today" : "", empty ? "empty" : ""]
                  .filter(Boolean)
                  .join(" ");
                return `<td class="${cls}">${escapeHtml(m)}</td>`;
              })
              .join("");
            return `<tr><td class="name">${escapeHtml(r.staffName)}</td>${cells}</tr>`;
          })
          .join("");

  return `<!doctype html>
<html lang="de">
<head>
<meta charset="utf-8">
<title>COCO TRMNL — Dienstplan</title>
<meta name="viewport" content="width=1872, initial-scale=1">
<style>
  :root { color-scheme: only light; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; background: #fff; color: #000; }
  body {
    width: 1872px; height: 1404px;
    padding: 40px;
    font-family: -apple-system, "Helvetica Neue", Arial, sans-serif;
    font-size: 22px; line-height: 1.2;
    -webkit-font-smoothing: none;
  }
  h1 { font-size: 40px; margin: 0; letter-spacing: -0.5px; }
  .header { display: flex; justify-content: space-between; align-items: baseline; border-bottom: 4px solid #000; padding-bottom: 10px; }
  .header .sub { font-size: 26px; font-weight: 600; margin-top: 4px; }
  .header .right { font-size: 22px; text-align: right; }
  table.grid { border-collapse: collapse; width: 100%; margin-top: 20px; table-layout: fixed; }
  table.grid th, table.grid td { border: 1.5px solid #000; padding: 0; text-align: center; }
  table.grid th.name-head, table.grid td.name {
    width: 240px; text-align: left; padding: 8px 12px; font-weight: 700; font-size: 26px;
  }
  table.grid th.day-head { padding: 6px 0; font-weight: 700; }
  table.grid th.day-head .wd { font-size: 20px; }
  table.grid th.day-head .dm { font-size: 26px; font-weight: 800; }
  table.grid th.we, table.grid td.we { background: #ddd; }
  table.grid th.today, table.grid td.today { outline: 4px solid #000; outline-offset: -4px; }
  table.grid td.cell { height: 72px; font-size: 34px; font-weight: 800; }
  table.grid td.cell.empty { color: #888; font-weight: 400; font-size: 26px; }
  .footer { position: absolute; left: 40px; right: 40px; bottom: 20px; border-top: 2px solid #000; padding-top: 8px; font-size: 20px; display: flex; justify-content: space-between; }
</style>
</head>
<body>
  <header class="header">
    <div>
      <h1>${escapeHtml(input.locationName)}</h1>
      <div class="sub">Service · Abend · 14 Tage</div>
    </div>
    <div class="right">
      <div>${escapeHtml(todayHuman)}</div>
      <div>${escapeHtml(timeStr)} Uhr</div>
    </div>
  </header>
  <table class="grid">
    <thead>
      <tr>
        <th class="name-head">Mitarbeiter</th>
        ${headerCells}
      </tr>
    </thead>
    <tbody>
      ${rowsHtml}
    </tbody>
  </table>
  <footer class="footer">
    <span>X Dienst · B Bar · 19h · GL · H Hausmeister · U Urlaub · K Krank · ♡ Wunsch</span>
    <span>Abruf ${escapeHtml(timeStr)} Uhr</span>
  </footer>
</body>
</html>`;
}
