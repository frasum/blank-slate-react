// G1a Scheibe 2 — 1:1 aus src/routes/_authenticated/admin/zeit-uebersicht.tsx
// extrahiert. Verhaltensgleich; Props-Verträge unverändert.

import { Fragment, useState, type ReactNode } from "react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { CalendarDays, Download, FileDown, FileSpreadsheet, Plus, Search, X } from "lucide-react";
import type { BuchhaltungExportRow, BuchhaltungMode } from "@/lib/time/buchhaltung-export";
import {
  DEPT_BG,
  DEPT_LABEL,
  DEPT_ORDER,
  fmtDec,
  fmtHm,
  type Department,
} from "@/lib/time/zeit-uebersicht-core";

export type PayrollRecurringEntry = {
  id: string;
  kind: "rate" | "dauer";
  display: string;
  canceled: boolean;
};
export type CreateRecurringVars = {
  staffId: string;
  kind: "rate" | "dauer";
  text: string;
  periodsTotal: number | null;
};

export function PayrollTab({
  mode,
  onModeChange,
  search,
  onSearchChange,
  searchActive,
  rowsByDept,
  staffRows,
  totals,
  readOnly,
  onSaveNote,
  onExportPdf,
  onExportXlsx,
  onExportCsv,
  fullNameByStaffId,
  recurringByStaff,
  onAddRecurring,
  onCancelRecurring,
  renderStaffName,
}: {
  mode: BuchhaltungMode;
  onModeChange: (m: BuchhaltungMode) => void;
  search: string;
  onSearchChange: (s: string) => void;
  searchActive: boolean;
  rowsByDept: Map<Department, BuchhaltungExportRow[]>;
  staffRows: Map<string, BuchhaltungExportRow & { staffId: string; department: Department }>;
  totals: {
    totalHours: number;
    shifts: number;
    evening: number;
    night: number;
    sunHol: number;
    sonntag: number;
    feiertag: number;
    feiertag150: number;
    urlaubDays: number;
    krankDays: number;
    vorschussEUR: number;
  };
  readOnly: boolean;
  onSaveNote: (staffId: string, besonderheiten: string) => void;
  onExportPdf: () => void;
  onExportXlsx: () => void;
  onExportCsv?: () => void;
  fullNameByStaffId?: Map<string, string>;
  recurringByStaff?: Map<string, PayrollRecurringEntry[]>;
  onAddRecurring?: (vars: CreateRecurringVars) => void;
  onCancelRecurring?: (id: string) => void;
  renderStaffName?: (staffId: string, displayName: string) => ReactNode;
}) {
  const is3b = mode === "section3b";
  // Spaltenanzahl für colSpan: Name + Gesamt + Schichten + (3 SFN | 5 §3b) + U + K + Vorschuss + Besonderheiten
  const sfnCols = is3b ? 5 : 3;
  const colSpan = 3 + sfnCols + 4;
  const anyRows = Array.from(rowsByDept.values()).some((arr) => arr.length > 0);

  return (
    <div className="space-y-3">
      <Card className="p-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="inline-flex rounded-md border border-input bg-background p-1">
            <button
              type="button"
              onClick={() => onModeChange("simple")}
              className={`h-7 rounded px-3 text-sm transition ${
                !is3b ? "bg-primary text-primary-foreground" : "text-foreground hover:bg-muted"
              }`}
            >
              Einfach
            </button>
            <button
              type="button"
              onClick={() => onModeChange("section3b")}
              className={`h-7 rounded px-3 text-sm transition ${
                is3b ? "bg-primary text-primary-foreground" : "text-foreground hover:bg-muted"
              }`}
            >
              §3b
            </button>
          </div>
          <span className="text-xs text-muted-foreground">
            {is3b
              ? "§3b: Sonntag, Feiertag (125 %) und Feiertag 150 % (1. Mai, 25./26. 12.) getrennt ausgewiesen."
              : "Einfach: 20–24 (Abend), 24–X (Nacht) und SO/FEI als Summe."}
          </span>
          <div className="ml-auto flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={onExportPdf}>
              <FileDown className="mr-1 h-4 w-4" /> PDF
            </Button>
            <Button variant="outline" size="sm" onClick={onExportXlsx}>
              <FileSpreadsheet className="mr-1 h-4 w-4" /> Excel
            </Button>
            {onExportCsv && (
              <Button variant="outline" size="sm" onClick={onExportCsv}>
                <Download className="mr-1 h-4 w-4" /> CSV
              </Button>
            )}
          </div>
        </div>
        <div className="relative mt-3 max-w-xs">
          <Search className="pointer-events-none absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Mitarbeiter suchen…"
            className="h-9 pl-8"
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
          />
        </div>
      </Card>

      <Card className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="h-9 text-xs uppercase tracking-wider text-muted-foreground">
                Mitarbeiter
              </TableHead>
              <TableHead className="h-9 text-xs uppercase tracking-wider text-muted-foreground text-right w-24">
                Gesamt
              </TableHead>
              <TableHead
                className="h-9 text-xs uppercase tracking-wider text-muted-foreground text-right w-20"
                title="Abendstunden 20–24 Uhr"
              >
                20–24
              </TableHead>
              <TableHead
                className="h-9 text-xs uppercase tracking-wider text-muted-foreground text-right w-20"
                title="Nachtstunden ab 24 Uhr"
              >
                24–X
              </TableHead>
              {!is3b && (
                <TableHead
                  className="h-9 text-xs uppercase tracking-wider text-muted-foreground text-right w-20"
                  title="Sonntag + Feiertag zusammen"
                >
                  SO/FEI
                </TableHead>
              )}
              {is3b && (
                <>
                  <TableHead
                    className="h-9 text-xs uppercase tracking-wider text-muted-foreground text-right w-20"
                    title="Stunden an Sonntagen"
                  >
                    Sonntag
                  </TableHead>
                  <TableHead
                    className="h-9 text-xs uppercase tracking-wider text-muted-foreground text-right w-20"
                    title="Feiertag 125 %"
                  >
                    Feiertag
                  </TableHead>
                  <TableHead
                    className="h-9 text-xs uppercase tracking-wider text-muted-foreground text-right w-24"
                    title="Feiertag 150 % (1. Mai, 25./26. 12.)"
                  >
                    Feiertag 150 %
                  </TableHead>
                </>
              )}
              <TableHead
                className="h-9 text-xs uppercase tracking-wider text-red-600 text-right w-16"
                title="Schichten in der Abrechnungsperiode"
              >
                S
              </TableHead>
              <TableHead className="h-9 text-xs uppercase tracking-wider text-green-600 text-right w-12">
                U
              </TableHead>
              <TableHead className="h-9 text-xs uppercase tracking-wider text-blue-600 text-right w-12">
                K
              </TableHead>
              <TableHead className="h-9 text-xs uppercase tracking-wider text-muted-foreground text-right w-28">
                Vorschuss
              </TableHead>
              <TableHead className="h-9 text-xs uppercase tracking-wider text-muted-foreground">
                Besonderheiten
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {!anyRows && (
              <TableRow>
                <TableCell colSpan={colSpan} className="text-center text-muted-foreground">
                  Keine Einträge im Zeitraum.
                </TableCell>
              </TableRow>
            )}
            {DEPT_ORDER.map((dept) => {
              const list = rowsByDept.get(dept) ?? [];
              if (list.length === 0) return null;
              return (
                <Fragment key={`p-grp-${dept}`}>
                  {!searchActive && (
                    <TableRow className={`${DEPT_BG[dept]} hover:${DEPT_BG[dept]}`}>
                      <TableCell
                        colSpan={colSpan}
                        className="py-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground"
                      >
                        {DEPT_LABEL[dept]}
                      </TableCell>
                    </TableRow>
                  )}
                  {list.map((r) => {
                    const full = staffRows.get(
                      (r as BuchhaltungExportRow & { staffId: string }).staffId,
                    );
                    const staffId = full?.staffId ?? "";
                    return (
                      <PayrollRow
                        key={staffId}
                        row={r}
                        is3b={is3b}
                        readOnly={readOnly}
                        fullName={fullNameByStaffId?.get(staffId)}
                        onSave={(b) => onSaveNote(staffId, b)}
                        nameSlot={renderStaffName?.(staffId, r.displayName)}
                        recurring={recurringByStaff?.get(staffId) ?? []}
                        onAddRecurring={
                          onAddRecurring
                            ? (vars) => onAddRecurring({ ...vars, staffId })
                            : undefined
                        }
                        onCancelRecurring={onCancelRecurring}
                      />
                    );
                  })}
                </Fragment>
              );
            })}
            {anyRows && (
              <TableRow className="bg-muted/50 font-medium">
                <TableCell className="py-1.5">Summe</TableCell>
                <TableCell className="py-1.5 text-right tabular-nums">
                  {fmtHm(totals.totalHours)}
                </TableCell>
                <TableCell className="py-1.5 text-right tabular-nums">
                  {fmtDec(totals.evening)}
                </TableCell>
                <TableCell className="py-1.5 text-right tabular-nums">
                  {fmtDec(totals.night)}
                </TableCell>
                {!is3b && (
                  <TableCell className="py-1.5 text-right tabular-nums">
                    {fmtDec(totals.sunHol)}
                  </TableCell>
                )}
                {is3b && (
                  <>
                    <TableCell className="py-1.5 text-right tabular-nums">
                      {fmtDec(totals.sonntag)}
                    </TableCell>
                    <TableCell className="py-1.5 text-right tabular-nums">
                      {fmtDec(totals.feiertag)}
                    </TableCell>
                    <TableCell className="py-1.5 text-right tabular-nums">
                      {fmtDec(totals.feiertag150)}
                    </TableCell>
                  </>
                )}
                <TableCell
                  className={`py-1.5 text-right tabular-nums ${totals.shifts > 0 ? "text-red-600 font-medium" : "text-muted-foreground/50"}`}
                >
                  {totals.shifts}
                </TableCell>
                <TableCell
                  className={`py-1.5 text-right tabular-nums ${totals.urlaubDays > 0 ? "text-green-600 font-medium" : "text-muted-foreground/50"}`}
                >
                  {totals.urlaubDays > 0 ? totals.urlaubDays : "–"}
                </TableCell>
                <TableCell
                  className={`py-1.5 text-right tabular-nums ${totals.krankDays > 0 ? "text-blue-600 font-medium" : "text-muted-foreground/50"}`}
                >
                  {totals.krankDays > 0 ? totals.krankDays : "–"}
                </TableCell>
                <TableCell className="py-1.5 text-right tabular-nums">
                  {totals.vorschussEUR > 0
                    ? totals.vorschussEUR.toLocaleString("de-DE", {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })
                    : "–"}
                </TableCell>
                <TableCell className="py-1.5" />
              </TableRow>
            )}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}

function PayrollRow({
  row,
  is3b,
  readOnly,
  onSave,
  fullName,
  nameSlot,
  recurring,
  onAddRecurring,
  onCancelRecurring,
}: {
  row: BuchhaltungExportRow;
  is3b: boolean;
  readOnly: boolean;
  onSave: (besonderheiten: string) => void;
  fullName?: string;
  nameSlot?: ReactNode;
  recurring?: PayrollRecurringEntry[];
  onAddRecurring?: (vars: {
    kind: "rate" | "dauer";
    text: string;
    periodsTotal: number | null;
  }) => void;
  onCancelRecurring?: (id: string) => void;
}) {
  const [besonderheiten, setBesonderheiten] = useState<string>(row.besonderheiten ?? "");
  const [addOpen, setAddOpen] = useState(false);
  const [addKind, setAddKind] = useState<"rate" | "dauer">("rate");
  const [addText, setAddText] = useState("");
  const [addPeriods, setAddPeriods] = useState<string>("6");
  const resetAdd = () => {
    setAddOpen(false);
    setAddText("");
    setAddPeriods("6");
    setAddKind("rate");
  };
  const vorschussLabel =
    row.vorschussEUR > 0
      ? row.vorschussEUR.toLocaleString("de-DE", {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        })
      : null;
  const numCell = (v: number) =>
    v > 0 ? (
      <span className="tabular-nums">{fmtDec(v)}</span>
    ) : (
      <span className="tabular-nums text-muted-foreground/50">–</span>
    );
  return (
    <TableRow className="group">
      <TableCell className="py-1.5 font-medium">
        <div>{nameSlot ?? row.displayName}</div>
        {fullName && <div className="text-xs font-normal text-muted-foreground">{fullName}</div>}
      </TableCell>
      <TableCell className="py-1.5 text-right tabular-nums font-medium">
        {fmtHm(row.totalHours)}
      </TableCell>
      <TableCell className="py-1.5 text-right">{numCell(row.evening)}</TableCell>
      <TableCell className="py-1.5 text-right">{numCell(row.night)}</TableCell>
      {!is3b && <TableCell className="py-1.5 text-right">{numCell(row.sunHol)}</TableCell>}
      {is3b && (
        <>
          <TableCell className="py-1.5 text-right">{numCell(row.sonntag)}</TableCell>
          <TableCell className="py-1.5 text-right">{numCell(row.feiertag)}</TableCell>
          <TableCell className="py-1.5 text-right">{numCell(row.feiertag150)}</TableCell>
        </>
      )}
      <TableCell
        className={`py-1.5 text-right tabular-nums ${row.shifts > 0 ? "text-red-600 font-medium" : "text-muted-foreground/50"}`}
      >
        {row.shifts}
      </TableCell>
      <TableCell
        className={`py-1.5 text-right tabular-nums ${
          row.urlaubDays > 0 ? "text-green-600 font-medium" : "text-muted-foreground/50"
        }`}
      >
        {row.urlaubDays > 0 ? row.urlaubDays : "–"}
      </TableCell>
      <TableCell
        className={`py-1.5 text-right tabular-nums ${
          row.krankDays > 0 ? "text-blue-600 font-medium" : "text-muted-foreground/50"
        }`}
      >
        {row.krankDays > 0 ? row.krankDays : "–"}
      </TableCell>
      <TableCell
        className={`py-1.5 text-right tabular-nums text-sm ${
          vorschussLabel ? "font-medium" : "text-muted-foreground/50"
        }`}
      >
        {vorschussLabel ?? "–"}
      </TableCell>
      <TableCell className="py-1.5">
        {(recurring?.length ?? 0) > 0 && (
          <div className="mb-1 flex flex-wrap gap-1">
            {recurring!.map((r) => (
              <span
                key={r.id}
                className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs ${
                  r.kind === "dauer"
                    ? "border-amber-300 bg-amber-50 text-amber-900"
                    : "border-sky-300 bg-sky-50 text-sky-900"
                }`}
                title={r.kind === "dauer" ? "Dauer-Notiz (permanent)" : "Ratennotiz"}
              >
                {r.display}
                {!readOnly && onCancelRecurring && (
                  <button
                    type="button"
                    aria-label="Notiz beenden"
                    className="ml-0.5 rounded-full text-muted-foreground hover:text-foreground"
                    onClick={() => {
                      if (window.confirm("Notiz beenden?")) onCancelRecurring(r.id);
                    }}
                  >
                    ✕
                  </button>
                )}
              </span>
            ))}
          </div>
        )}
        {row.absenceNote ? (
          <div
            className="mb-1 flex items-start gap-1 text-xs text-muted-foreground"
            title="Automatisch aus Urlaub/Krank — Korrekturen dort vornehmen."
          >
            <CalendarDays className="mt-0.5 h-3 w-3 shrink-0" aria-hidden />
            <span className="leading-tight">{row.absenceNote}</span>
          </div>
        ) : null}
        <Textarea
          rows={1}
          placeholder="–"
          className="min-h-7 h-7 py-1 resize-none text-sm border-transparent bg-transparent hover:border-input focus:border-input focus:bg-background focus:min-h-16 transition-all placeholder:text-muted-foreground/40"
          readOnly={readOnly}
          disabled={readOnly}
          value={besonderheiten}
          onChange={(e) => setBesonderheiten(e.target.value)}
          onBlur={() => {
            if (readOnly) return;
            const prev = row.besonderheiten ?? "";
            if (besonderheiten !== prev) onSave(besonderheiten);
          }}
        />
        {!readOnly && onAddRecurring && (
          <div className="mt-1">
            {!addOpen ? (
              <button
                type="button"
                onClick={() => setAddOpen(true)}
                className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
              >
                <Plus className="h-3 w-3" /> Rate / Dauer-Notiz
              </button>
            ) : (
              <div className="mt-1 space-y-1 rounded border border-input bg-muted/30 p-2">
                <div className="flex items-center gap-2 text-xs">
                  <label className="inline-flex items-center gap-1">
                    <input
                      type="radio"
                      name={`k-${row.displayName}`}
                      checked={addKind === "rate"}
                      onChange={() => setAddKind("rate")}
                    />
                    Rate
                  </label>
                  <label className="inline-flex items-center gap-1">
                    <input
                      type="radio"
                      name={`k-${row.displayName}`}
                      checked={addKind === "dauer"}
                      onChange={() => setAddKind("dauer")}
                    />
                    Dauer
                  </label>
                  {addKind === "rate" && (
                    <label className="inline-flex items-center gap-1">
                      Perioden:
                      <Input
                        className="h-6 w-14 px-1 py-0 text-xs"
                        value={addPeriods}
                        onChange={(e) => setAddPeriods(e.target.value)}
                      />
                    </label>
                  )}
                  <button
                    type="button"
                    aria-label="Abbrechen"
                    className="ml-auto text-muted-foreground hover:text-foreground"
                    onClick={resetAdd}
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
                <div className="flex items-center gap-2">
                  <Input
                    className="h-7 flex-1 text-xs"
                    placeholder={addKind === "rate" ? "z. B. Darlehen 500 €" : "z. B. Pfändung"}
                    value={addText}
                    onChange={(e) => setAddText(e.target.value)}
                  />
                  <Button
                    size="sm"
                    className="h-7 text-xs"
                    onClick={() => {
                      const t = addText.trim();
                      if (!t) return;
                      const n = addKind === "rate" ? Number(addPeriods) : null;
                      if (addKind === "rate" && (!Number.isFinite(n) || (n as number) < 1)) return;
                      onAddRecurring({ kind: addKind, text: t, periodsTotal: n });
                      resetAdd();
                    }}
                  >
                    Anlegen
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
      </TableCell>
    </TableRow>
  );
}
