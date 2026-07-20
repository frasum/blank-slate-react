// DL1 — Druckbare Bestelllisten (Keller-Laufzettel).
//
// Reine HTML-/Print-Utility nach dem DailyPrintView-Muster
// (src/components/cash/DailyPrintView.tsx): kein PDF-Generator, kein
// Server-Schreibpfad. Aufrufer liefert bereits gefilterte/aggregierte
// Sections; diese Datei formatiert nur.

export type PrintArticle = {
  id: string;
  name: string;
  category: string | null;
  orderUnit: string;
  lastOrderIso: string | null;
};

export type PrintSupplierSection = {
  kind: "supplier";
  supplierName: string;
  // Innerhalb: nach Kategorie gruppiert, sonst alphabetisch.
  articles: PrintArticle[];
};

export type PrintWineSection = {
  kind: "wine";
  title: string;
  // Innerhalb: nach Lieferant geblockt.
  bySupplier: { supplierName: string; articles: PrintArticle[] }[];
};

export type PrintSection = PrintSupplierSection | PrintWineSection;

function esc(v: string): string {
  return v
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

// „Zuletzt bestellt" kompakt als TT.MM. — nie bestellt → „—".
export function fmtLastOrderDdMm(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return `${pad2(d.getDate())}.${pad2(d.getMonth() + 1)}.`;
}

function todayDeShort(): string {
  const d = new Date();
  return `${pad2(d.getDate())}.${pad2(d.getMonth() + 1)}.${d.getFullYear()}`;
}

// Ab ~35 Artikeln wird zweispaltig gesetzt, damit Top Service (~97) auf zwei
// Seiten passt. Kleinere Sections bleiben einspaltig/luftig.
const TWO_COL_THRESHOLD = 35;

const PRINT_CSS = `
  @page { size: A4; margin: 12mm; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body {
    font-family: -apple-system, "Helvetica Neue", Helvetica, Arial, sans-serif;
    font-size: 9pt;
    color: #111;
    background: #fff;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  section.dl {
    break-before: page;
    page-break-before: always;
  }
  section.dl:first-of-type {
    break-before: auto;
    page-break-before: auto;
  }
  header.dl-head {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    border-bottom: 1.5pt solid #111;
    padding-bottom: 1.5mm;
    margin-bottom: 3mm;
  }
  header.dl-head h1 { font-size: 15pt; margin: 0; font-weight: 700; }
  header.dl-head .meta { font-size: 8pt; color: #555; }
  .cols-2 { column-count: 2; column-gap: 6mm; column-rule: 1px solid #eee; }
  .cols-1 { column-count: 1; }
  .grp { break-inside: avoid-column; margin-bottom: 2mm; }
  .grp h2, .grp h3 {
    font-size: 9pt;
    text-transform: uppercase;
    letter-spacing: .04em;
    color: #334155;
    margin: 2mm 0 1mm;
    padding-bottom: 0.5mm;
    border-bottom: 0.5pt solid #cbd5e1;
    break-after: avoid;
  }
  .row {
    display: grid;
    grid-template-columns: 22mm 1fr 14mm 12mm;
    gap: 2mm;
    align-items: end;
    padding: 2.4mm 0 0.5mm;
    border-bottom: 0.4pt dotted #999;
    break-inside: avoid;
  }
  .row .write { border-bottom: 0.6pt solid #111; height: 5mm; }
  .row .name { font-size: 9pt; }
  .row .unit { font-size: 8pt; color: #334155; text-align: right; }
  .row .last { font-size: 7.5pt; color: #64748b; text-align: right; }
  .sonstiges { margin-top: 4mm; break-inside: avoid; }
  .sonstiges .row { grid-template-columns: 22mm 1fr; }
  .sonstiges .lbl { font-size: 8pt; color: #64748b; }
`;

function renderRow(a: PrintArticle): string {
  return (
    `<div class="row">` +
    `<div class="write"></div>` +
    `<div class="name">${esc(a.name)}</div>` +
    `<div class="unit">${esc(a.orderUnit || "")}</div>` +
    `<div class="last">${esc(fmtLastOrderDdMm(a.lastOrderIso))}</div>` +
    `</div>`
  );
}

function renderSonstiges(): string {
  const one = `<div class="row"><div class="write"></div><div class="lbl">Sonstiges</div></div>`;
  return `<div class="sonstiges">${one}${one}${one}</div>`;
}

function renderSupplierBody(articles: PrintArticle[]): string {
  // Nach Kategorie gruppiert (Zwischenüberschriften), innerhalb alphabetisch.
  const byCat = new Map<string, PrintArticle[]>();
  for (const a of articles) {
    const key = (a.category ?? "").trim() || "Ohne Kategorie";
    const arr = byCat.get(key) ?? [];
    arr.push(a);
    byCat.set(key, arr);
  }
  const cats = [...byCat.keys()].sort((a, b) => a.localeCompare(b, "de"));
  const blocks: string[] = [];
  for (const cat of cats) {
    const list = byCat.get(cat)!.slice().sort((a, b) => a.name.localeCompare(b.name, "de"));
    blocks.push(
      `<div class="grp"><h3>${esc(cat)}</h3>${list.map(renderRow).join("")}</div>`,
    );
  }
  return blocks.join("");
}

function renderWineBody(bySupplier: PrintWineSection["bySupplier"]): string {
  const blocks: string[] = [];
  const sorted = bySupplier
    .slice()
    .sort((a, b) => a.supplierName.localeCompare(b.supplierName, "de"));
  for (const g of sorted) {
    const list = g.articles.slice().sort((a, b) => a.name.localeCompare(b.name, "de"));
    if (list.length === 0) continue;
    blocks.push(
      `<div class="grp"><h2>${esc(g.supplierName)}</h2>${list.map(renderRow).join("")}</div>`,
    );
  }
  return blocks.join("");
}

function sectionArticleCount(section: PrintSection): number {
  if (section.kind === "supplier") return section.articles.length;
  return section.bySupplier.reduce((a, g) => a + g.articles.length, 0);
}

export function renderOrderListsHtml(input: {
  locationName: string;
  sections: PrintSection[];
}): string {
  const today = todayDeShort();
  const parts: string[] = [];
  for (const s of input.sections) {
    const count = sectionArticleCount(s);
    const colsCls = count >= TWO_COL_THRESHOLD ? "cols-2" : "cols-1";
    const title = s.kind === "supplier" ? s.supplierName : s.title;
    const body =
      s.kind === "supplier" ? renderSupplierBody(s.articles) : renderWineBody(s.bySupplier);
    parts.push(
      `<section class="dl">` +
        `<header class="dl-head">` +
          `<h1>${esc(title)}</h1>` +
          `<div class="meta">${esc(input.locationName)} · ${esc(today)} · ${count} Artikel</div>` +
        `</header>` +
        `<div class="${colsCls}">${body}</div>` +
        renderSonstiges() +
      `</section>`,
    );
  }

  return `<!doctype html>
<html lang="de">
<head>
<meta charset="utf-8" />
<title>Bestelllisten ${esc(today)}</title>
<style>${PRINT_CSS}</style>
</head>
<body>
${parts.join("")}
</body>
</html>`;
}

// Öffnet den System-Druckdialog Safari-fest via unsichtbarem srcdoc-iframe.
// Kopie des Musters aus DailyPrintView.printDailySummary — keine window.open,
// kein Download.
export function printOrderLists(input: {
  locationName: string;
  sections: PrintSection[];
}): void {
  if (typeof window === "undefined" || typeof document === "undefined") return;
  const html = renderOrderListsHtml(input);
  const iframe = document.createElement("iframe");
  iframe.setAttribute("aria-hidden", "true");
  iframe.style.position = "fixed";
  iframe.style.right = "0";
  iframe.style.bottom = "0";
  iframe.style.width = "0";
  iframe.style.height = "0";
  iframe.style.border = "0";
  iframe.style.visibility = "hidden";

  let cleaned = false;
  const cleanup = () => {
    if (cleaned) return;
    cleaned = true;
    try {
      iframe.parentNode?.removeChild(iframe);
    } catch {
      /* ignore */
    }
  };

  iframe.onload = () => {
    try {
      const w = iframe.contentWindow;
      if (!w) {
        cleanup();
        return;
      }
      w.addEventListener("afterprint", () => window.setTimeout(cleanup, 500));
      window.setTimeout(() => {
        try {
          w.focus();
          w.print();
        } catch {
          cleanup();
        }
        window.setTimeout(cleanup, 60_000);
      }, 50);
    } catch {
      cleanup();
    }
  };

  iframe.srcdoc = html;
  document.body.appendChild(iframe);
}