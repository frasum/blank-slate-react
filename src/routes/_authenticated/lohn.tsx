import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  getPayslipSignedUrl,
  listMyPayslips,
  type PayslipEntry,
} from "@/lib/payslips/payslips.functions";

export const Route = createFileRoute("/_authenticated/lohn")({
  head: () => ({ meta: [{ title: "Lohnabrechnungen" }] }),
  component: LohnPage,
});

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("de-DE", { year: "numeric", month: "2-digit", day: "2-digit" });
}

function isIosSafari(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  const isIos = /iPhone|iPad|iPod/.test(ua);
  const isSafari = /Safari\//.test(ua) && !/CriOS|FxiOS|EdgiOS|OPiOS/.test(ua);
  return isIos && isSafari;
}

function LohnPage() {
  const callOpen = useServerFn(getPayslipSignedUrl);
  const q = useQuery({
    queryKey: ["payslips", "mine"],
    queryFn: () => listMyPayslips(),
  });

  async function open(entry: PayslipEntry) {
    // iOS-Safari verwirft window.open nach await als non-user-gesture — dort
    // muss das Tab-Handle synchron im Click geöffnet werden. Auf allen anderen
    // Browsern führt das zu einem sichtbaren leeren Vordergrund-Tab, deshalb
    // dort erst die Signed-URL holen und den Tab direkt mit der Ziel-URL öffnen.
    if (isIosSafari()) {
      // Bewusst OHNE "noopener": mit diesem Feature-String liefert window.open
      // per Spezifikation null zurück, dann verlieren wir das Tab-Handle und
      // können weder den Hinweistext schreiben noch später die Ziel-URL setzen.
      // Ziel ist ausschließlich unsere eigene signierte Storage-URL
      // (vertrauenswürdig, kein Fremdinhalt), daher unbedenklich.
      const win = window.open("about:blank", "_blank");
      // Sichtbarer Hinweis, damit der Zwischen-Tab nicht leer wirkt.
      if (win && !win.closed) {
        try {
          win.document.write(
            '<!doctype html><meta charset="utf-8">' +
              "<title>Lohnabrechnung wird geladen…</title>" +
              "<style>html,body{height:100%;margin:0;" +
              "font:16px -apple-system,system-ui,sans-serif;" +
              "background:#fff;color:#111;display:flex;" +
              "align-items:center;justify-content:center}</style>" +
              "<p>Öffne PDF…</p>",
          );
          win.document.close();
        } catch {
          /* cross-origin nach location-Wechsel: ignorieren */
        }
      }
      try {
        const res = await callOpen({ data: { path: entry.path } });
        if (win && !win.closed) win.location.href = res.url;
        else window.location.href = res.url;
      } catch (e) {
        if (win && !win.closed) win.close();
        alert(e instanceof Error ? e.message : "Öffnen fehlgeschlagen.");
      }
      return;
    }
    try {
      const res = await callOpen({ data: { path: entry.path } });
      const win = window.open(res.url, "_blank", "noopener");
      if (!win) window.location.href = res.url; // Popup-Blocker: gleicher Tab.
    } catch (e) {
      alert(e instanceof Error ? e.message : "Öffnen fehlgeschlagen.");
    }
  }

  const items = q.data ?? [];

  return (
    <div className="mx-auto max-w-xl space-y-6 px-4 py-8">
      <header className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Lohnabrechnungen</h1>
        <Link
          to="/zeit"
          className="text-sm text-muted-foreground underline-offset-2 hover:underline"
        >
          Mein COCO
        </Link>
      </header>

      {q.isLoading ? (
        <p className="text-sm text-muted-foreground">Lade…</p>
      ) : q.isError ? (
        <p className="text-sm text-destructive">
          Fehler beim Laden: {q.error instanceof Error ? q.error.message : "Unbekannter Fehler."}
        </p>
      ) : items.length === 0 ? (
        <p className="text-sm text-muted-foreground">Noch keine Lohnabrechnungen hinterlegt.</p>
      ) : (
        <ul className="divide-y divide-border rounded-md border border-border">
          {items.map((it) => (
            <li key={it.path} className="flex items-center justify-between gap-3 px-4 py-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-foreground">{it.name}</p>
                <p className="text-xs text-muted-foreground">{fmtDate(it.createdAt)}</p>
              </div>
              <button
                type="button"
                onClick={() => open(it)}
                className="shrink-0 rounded-md border border-border px-3 py-1.5 text-sm hover:bg-muted"
              >
                Öffnen
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
