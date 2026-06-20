// Wochenplan-Export (PDF + Excel). Reine Funktionen, ohne React-Abhängigkeit.
// Eingaben sind bereits aufbereitet (Mitarbeiter-Reihen mit Schichten pro Tag
// + Tagessummen). Hier wird nur formatiert und gerendert.

export type WeeklyExportShift = { from: string; to: string }; // HH:MM
export type WeeklyExportDay = {
  iso: string; // YYYY-MM-DD
  label: string; // z. B. "Mo 08.06"
  isSunOrHol: boolean;
  shifts: WeeklyExportShift[];
  crossLocation: boolean; // ×
};
export type WeeklyExportRow = {
  staffId: string;
  displayName: string;
  department: "kitchen" | "service" | "gl";
  days: WeeklyExportDay[]; // genau 7 Einträge
  totals: {
    total: number;
    evening: number;
    night: number;
    sunHol: number;
  };
};
export type WeeklyExportInput = {
  locationLabel: string;
  weekNo: number;
  weekYear: number;
  rangeLabel: string; // "08.06.–14.06.2026"
  days: { iso: string; label: string; isSunOrHol: boolean }[]; // 7 Tage
  rowsByDept: { dept: "kitchen" | "service" | "gl"; deptLabel: string; rows: WeeklyExportRow[] }[];
};

function fmtDec(n: number): string {
  return n.toFixed(2).replace(".", ",");
}

export function buildFileBaseName(input: WeeklyExportInput): string {
  const loc = input.locationLabel.replace(/[^a-zA-Z0-9_-]+/g, "_");
  return `Wochenplan_${loc}_KW${String(input.weekNo).padStart(2, "0")}_${input.weekYear}`;
}

// ---------- Excel ----------

export async function buildWeeklyXlsx(input: WeeklyExportInput): Promise<Blob> {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  wb.creator = "Coco";
  const ws = wb.addWorksheet(`KW ${input.weekNo}`);

  // Header (zwei Zeilen, je Tag zwei Spalten Anfang/Ende)
  const top: (string | number)[] = ["Mitarbeiter"];
  const sub: (string | number)[] = [""];
  for (const d of input.days) {
    top.push(d.label, "");
    sub.push("Anfang", "Ende");
  }
  top.push("Ges", "20–24", "24–x", "So/Fei", "U", "K");
  sub.push("", "", "", "", "", "");
  ws.addRow(top);
  ws.addRow(sub);
  // Tag-Header mergen
  for (let i = 0; i < input.days.length; i++) {
    const col = 2 + i * 2;
    ws.mergeCells(1, col, 1, col + 1);
  }
  ws.getRow(1).font = { bold: true };
  ws.getRow(2).font = { italic: true, size: 10 };

  // Sonntag/Feiertag-Header farbig
  for (let i = 0; i < input.days.length; i++) {
    if (!input.days[i].isSunOrHol) continue;
    const col = 2 + i * 2;
    for (const c of [col, col + 1]) {
      for (const r of [1, 2]) {
        ws.getCell(r, c).fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: "FFFFF3CD" },
        };
      }
    }
  }

  for (const grp of input.rowsByDept) {
    if (grp.rows.length === 0) continue;
    const hRow = ws.addRow([grp.deptLabel.toUpperCase()]);
    hRow.font = { bold: true };
    hRow.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: {
        argb:
          grp.dept === "kitchen" ? "FFFFE8D6" : grp.dept === "service" ? "FFDDEBF7" : "FFEDEDED",
      },
    };
    for (const row of grp.rows) {
      const cells: (string | number)[] = [row.displayName];
      for (const day of row.days) {
        if (day.shifts.length === 0) {
          cells.push(day.crossLocation ? "×" : "", "");
        } else if (day.shifts.length === 1) {
          cells.push(day.shifts[0].from, day.shifts[0].to);
        } else {
          cells.push(
            day.shifts.map((s) => s.from).join(" / "),
            day.shifts.map((s) => s.to).join(" / "),
          );
        }
      }
      cells.push(
        fmtDec(row.totals.total),
        fmtDec(row.totals.evening),
        fmtDec(row.totals.night),
        fmtDec(row.totals.sunHol),
        "",
        "",
      );
      const r = ws.addRow(cells);
      // Tageszellen mit Sonn-/Feiertag-Hintergrund
      for (let i = 0; i < row.days.length; i++) {
        if (!row.days[i].isSunOrHol) continue;
        const col = 2 + i * 2;
        for (const c of [col, col + 1]) {
          r.getCell(c).fill = {
            type: "pattern",
            pattern: "solid",
            fgColor: { argb: "FFFFF8E1" },
          };
        }
      }
    }
  }

  // Spaltenbreiten
  ws.getColumn(1).width = 22;
  for (let i = 0; i < input.days.length; i++) {
    const col = 2 + i * 2;
    ws.getColumn(col).width = 8;
    ws.getColumn(col + 1).width = 8;
  }
  const tail = 2 + input.days.length * 2;
  for (let i = 0; i < 6; i++) ws.getColumn(tail + i).width = 8;

  const buf = await wb.xlsx.writeBuffer();
  return new Blob([buf], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}

// ---------- PDF ----------

export function buildWeeklyPdf(input: WeeklyExportInput): Blob {
  const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
  doc.setFontSize(14);
  doc.text(
    `Wochenplan — ${input.locationLabel} · KW ${input.weekNo} (${input.rangeLabel})`,
    40,
    36,
  );

  const head1: (string | { content: string; colSpan?: number; styles?: object })[] = [
    { content: "Mitarbeiter", styles: { halign: "left" } },
  ];
  const head2: (string | { content: string; colSpan?: number; styles?: object })[] = [
    { content: "", styles: {} },
  ];
  for (const d of input.days) {
    head1.push({
      content: d.label,
      colSpan: 2,
      styles: { halign: "center", fillColor: d.isSunOrHol ? [255, 243, 205] : [240, 240, 240] },
    });
    head2.push(
      { content: "Anf.", styles: { halign: "center", fontStyle: "italic" } },
      { content: "Ende", styles: { halign: "center", fontStyle: "italic" } },
    );
  }
  for (const lbl of ["Ges", "20–24", "24–x", "So/Fei", "U", "K"]) {
    head1.push({ content: lbl, styles: { halign: "right" } });
    head2.push({ content: "", styles: {} });
  }

  type Body = (string | { content: string; styles?: object; colSpan?: number })[];
  const body: Body[] = [];
  for (const grp of input.rowsByDept) {
    if (grp.rows.length === 0) continue;
    body.push([
      {
        content: grp.deptLabel.toUpperCase(),
        colSpan: 1 + input.days.length * 2 + 6,
        styles: {
          fontStyle: "bold",
          fillColor:
            grp.dept === "kitchen"
              ? [255, 232, 214]
              : grp.dept === "service"
                ? [221, 235, 247]
                : [237, 237, 237],
        },
      },
    ]);
    for (const row of grp.rows) {
      const cells: Body = [{ content: row.displayName, styles: { fontStyle: "bold" } }];
      for (const day of row.days) {
        const bg = day.isSunOrHol ? { fillColor: [255, 248, 225] } : {};
        if (day.shifts.length === 0) {
          cells.push(
            { content: day.crossLocation ? "×" : "", styles: { halign: "center", ...bg } },
            { content: "", styles: { halign: "center", ...bg } },
          );
        } else {
          cells.push(
            {
              content: day.shifts.map((s) => s.from).join("\n"),
              styles: { halign: "center", ...bg },
            },
            {
              content: day.shifts.map((s) => s.to).join("\n"),
              styles: { halign: "center", ...bg },
            },
          );
        }
      }
      cells.push(
        { content: fmtDec(row.totals.total), styles: { halign: "right", fontStyle: "bold" } },
        { content: fmtDec(row.totals.evening), styles: { halign: "right" } },
        { content: fmtDec(row.totals.night), styles: { halign: "right" } },
        { content: fmtDec(row.totals.sunHol), styles: { halign: "right" } },
        { content: "", styles: { halign: "right" } },
        { content: "", styles: { halign: "right" } },
      );
      body.push(cells);
    }
  }

  autoTable(doc, {
    head: [head1 as never, head2 as never],
    body: body as never,
    startY: 56,
    styles: { fontSize: 8, cellPadding: 3 },
    headStyles: { fillColor: [230, 230, 230], textColor: 20 },
    theme: "grid",
  });

  return doc.output("blob");
}

// ---------- Browser-Download ----------

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  a.target = "_self";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
