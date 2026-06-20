// Buchhaltung-Export (PDF + Excel). Reine Funktionen, ohne React-Abhängigkeit.
// Spalten je nach §3b-Modus dynamisch. Provisions-Parameter bewusst weggelassen.

export type BuchhaltungMode = "simple" | "section3b";

export type BuchhaltungExportRow = {
  displayName: string;
  totalHours: number;
  shifts: number;
  evening: number; // 20–24
  night: number; // 24–X
  sunHol: number; // SO/FEI (simple)
  sonntag: number; // §3b
  feiertag: number; // §3b 125 %
  feiertag150: number; // §3b 150 %
  urlaubDays: number;
  krankDays: number;
  vorschussEUR: number;
  besonderheiten: string;
};

export type BuchhaltungExportInput = {
  locationLabel: string;
  periodLabel: string;
  rangeLabel: string; // "26.05.–25.06.2026"
  mode: BuchhaltungMode;
  rowsByDept: { dept: string; deptLabel: string; rows: BuchhaltungExportRow[] }[];
};

function fmtDec(n: number): string {
  return n.toFixed(2).replace(".", ",");
}
function fmtEUR(n: number): string {
  return n.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function columns(
  mode: BuchhaltungMode,
): { key: keyof BuchhaltungExportRow | "name"; label: string }[] {
  const base: { key: keyof BuchhaltungExportRow | "name"; label: string }[] = [
    { key: "name", label: "Mitarbeiter" },
    { key: "totalHours", label: "Gesamt" },
    { key: "shifts", label: "Schichten" },
    { key: "evening", label: "20–24" },
    { key: "night", label: "24–X" },
  ];
  if (mode === "section3b") {
    base.push(
      { key: "sonntag", label: "Sonntag" },
      { key: "feiertag", label: "Feiertag" },
      { key: "feiertag150", label: "Feiertag 150%" },
    );
  } else {
    base.push({ key: "sunHol", label: "SO/FEI" });
  }
  base.push(
    { key: "urlaubDays", label: "U" },
    { key: "krankDays", label: "K" },
    { key: "vorschussEUR", label: "Vorschuss" },
    { key: "besonderheiten", label: "Besonderheiten" },
  );
  return base;
}

function cellValue(row: BuchhaltungExportRow, key: string): string | number {
  switch (key) {
    case "name":
      return row.displayName;
    case "totalHours":
      return fmtDec(row.totalHours);
    case "shifts":
      return row.shifts;
    case "evening":
      return fmtDec(row.evening);
    case "night":
      return fmtDec(row.night);
    case "sunHol":
      return fmtDec(row.sunHol);
    case "sonntag":
      return fmtDec(row.sonntag);
    case "feiertag":
      return fmtDec(row.feiertag);
    case "feiertag150":
      return fmtDec(row.feiertag150);
    case "urlaubDays":
      return row.urlaubDays > 0 ? row.urlaubDays : "";
    case "krankDays":
      return row.krankDays > 0 ? row.krankDays : "";
    case "vorschussEUR":
      return row.vorschussEUR > 0 ? fmtEUR(row.vorschussEUR) : "";
    case "besonderheiten":
      return row.besonderheiten ?? "";
    default:
      return "";
  }
}

function totals(rows: BuchhaltungExportRow[]): BuchhaltungExportRow {
  const sum = (sel: (r: BuchhaltungExportRow) => number) => rows.reduce((a, r) => a + sel(r), 0);
  return {
    displayName: "",
    totalHours: sum((r) => r.totalHours),
    shifts: sum((r) => r.shifts),
    evening: sum((r) => r.evening),
    night: sum((r) => r.night),
    sunHol: sum((r) => r.sunHol),
    sonntag: sum((r) => r.sonntag),
    feiertag: sum((r) => r.feiertag),
    feiertag150: sum((r) => r.feiertag150),
    urlaubDays: sum((r) => r.urlaubDays),
    krankDays: sum((r) => r.krankDays),
    vorschussEUR: sum((r) => r.vorschussEUR),
    besonderheiten: "",
  };
}

export function buildBuchhaltungFileBase(input: BuchhaltungExportInput): string {
  const loc = input.locationLabel.replace(/[^a-zA-Z0-9_-]+/g, "_");
  const per = input.periodLabel.replace(/[^a-zA-Z0-9_-]+/g, "_");
  const suffix = input.mode === "section3b" ? "_3b" : "";
  return `Buchhaltung_${loc}_${per}${suffix}`;
}

// ---------- Excel ----------

export async function buildBuchhaltungXlsx(input: BuchhaltungExportInput): Promise<Blob> {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  wb.creator = "Coco";
  const ws = wb.addWorksheet("Buchhaltung");
  const cols = columns(input.mode);

  ws.addRow(cols.map((c) => c.label)).font = { bold: true };

  const allRows: BuchhaltungExportRow[] = [];
  for (const grp of input.rowsByDept) {
    if (grp.rows.length === 0) continue;
    const h = ws.addRow([grp.deptLabel.toUpperCase()]);
    h.font = { bold: true };
    h.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEDEDED" } };
    for (const row of grp.rows) {
      ws.addRow(cols.map((c) => cellValue(row, c.key as string)));
      allRows.push(row);
    }
  }
  if (allRows.length > 0) {
    const sum = totals(allRows);
    const row = ws.addRow(
      cols.map((c, idx) => (idx === 0 ? "Summe" : cellValue(sum, c.key as string))),
    );
    row.font = { bold: true };
    row.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF3F4F6" } };
  }

  ws.getColumn(1).width = 24;
  for (let i = 2; i <= cols.length; i++) {
    ws.getColumn(i).width = cols[i - 1].key === "besonderheiten" ? 28 : 12;
  }

  const buf = await wb.xlsx.writeBuffer();
  return new Blob([buf], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}

// ---------- PDF ----------

export async function buildBuchhaltungPdf(input: BuchhaltungExportInput): Promise<Blob> {
  const { default: jsPDF } = await import("jspdf");
  const { default: autoTable } = await import("jspdf-autotable");
  const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
  doc.setFontSize(14);
  doc.text(
    `Buchhaltung — ${input.locationLabel} · ${input.periodLabel} (${input.rangeLabel})${
      input.mode === "section3b" ? "  ·  §3b" : ""
    }`,
    40,
    36,
  );

  const cols = columns(input.mode);
  const head = [cols.map((c) => c.label)];
  type Body = (string | number | { content: string; styles?: object; colSpan?: number })[];
  const body: Body[] = [];
  const allRows: BuchhaltungExportRow[] = [];
  for (const grp of input.rowsByDept) {
    if (grp.rows.length === 0) continue;
    body.push([
      {
        content: grp.deptLabel.toUpperCase(),
        colSpan: cols.length,
        styles: { fontStyle: "bold", fillColor: [237, 237, 237] },
      },
    ]);
    for (const r of grp.rows) {
      body.push(cols.map((c) => cellValue(r, c.key as string)));
      allRows.push(r);
    }
  }
  if (allRows.length > 0) {
    const sum = totals(allRows);
    const sumRow: Body = cols.map((c, idx) =>
      idx === 0
        ? { content: "Summe", styles: { fontStyle: "bold", fillColor: [243, 244, 246] } }
        : {
            content: String(cellValue(sum, c.key as string)),
            styles: { fontStyle: "bold", fillColor: [243, 244, 246], halign: "right" },
          },
    );
    body.push(sumRow);
  }

  autoTable(doc, {
    head: head as never,
    body: body as never,
    startY: 56,
    styles: { fontSize: 8, cellPadding: 3 },
    headStyles: { fillColor: [230, 230, 230], textColor: 20, halign: "center" },
    columnStyles: Object.fromEntries(
      cols.map((c, i) => [i, { halign: i === 0 || c.key === "besonderheiten" ? "left" : "right" }]),
    ),
    theme: "grid",
  });

  return doc.output("blob");
}
