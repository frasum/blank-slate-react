// Admin-UI für Modul M-BWA (Welle F1).
//
// Nur Admins sehen die Seite (payroll/manager per beforeLoad ausgeschlossen).
// Erfassung/Bearbeitung via Dialog mit Live-Ableitung (deriveBwa) und
// Client-seitiger Quersummen-Vorschau (validateBwaMonth); die maßgebliche
// Prüfung passiert aber serverseitig in upsertBwaMonth.

import { createFileRoute, redirect } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { parseEuroToCents, fmtCents } from "@/lib/format";
import {
  listBwaMonths,
  upsertBwaMonth,
  deleteBwaMonth,
  type BwaRow,
} from "@/lib/bwa/bwa.functions";
import { deriveBwa, validateBwaMonth, type BwaMonthInput } from "@/lib/bwa/bwa-core";

export const Route = createFileRoute("/_authenticated/admin/bwa")({
  beforeLoad: ({ context }) => {
    const role = (context as { identity?: { role?: string } }).identity?.role;
    if (role !== "admin") throw redirect({ to: "/admin" });
  },
  head: () => ({ meta: [{ title: "BWA — Monatsauswertungen" }] }),
  component: BwaPage,
});

const DEFAULT_ENTITY = "YUM Gastronomie GmbH";

function monthFirst(iso: string): string {
  // Erwartet YYYY-MM oder YYYY-MM-DD; liefert Monatserster.
  const m = iso.match(/^(\d{4})-(\d{2})/);
  if (!m) return iso;
  return `${m[1]}-${m[2]}-01`;
}

function fmtMonth(iso: string): string {
  const d = new Date(`${iso}T12:00:00Z`);
  return d.toLocaleDateString("de-DE", { month: "short", year: "numeric" });
}

type FormState = {
  id?: string;
  entity: string;
  costCenter: string;
  monthInput: string; // YYYY-MM
  umsatz: string;
  getraenke: string;
  speisenHaus: string;
  speisenAusserHaus: string;
  sonstigeErloese: string;
  sonstErtraege: string;
  wareneinsatz: string;
  personal: string;
  sachkosten: string;
  anlage: string;
  abschreibung: string;
  betriebsergebnis: string;
};

const EMPTY_FORM: FormState = {
  entity: DEFAULT_ENTITY,
  costCenter: "",
  monthInput: new Date().toISOString().slice(0, 7),
  umsatz: "",
  getraenke: "",
  speisenHaus: "",
  speisenAusserHaus: "",
  sonstigeErloese: "",
  sonstErtraege: "",
  wareneinsatz: "",
  personal: "",
  sachkosten: "",
  anlage: "",
  abschreibung: "",
  betriebsergebnis: "",
};

function formFromRow(r: BwaRow): FormState {
  const eur = (c: number) => (c / 100).toFixed(2).replace(".", ",");
  return {
    id: r.id,
    entity: r.entity,
    costCenter: r.costCenter,
    monthInput: r.month.slice(0, 7),
    umsatz: eur(r.umsatzCents),
    getraenke: eur(r.getraenkeCents),
    speisenHaus: eur(r.speisenHausCents),
    speisenAusserHaus: eur(r.speisenAusserHausCents),
    sonstigeErloese: eur(r.sonstigeErloeseCents),
    sonstErtraege: eur(r.sonstErtraegeCents),
    wareneinsatz: eur(r.wareneinsatzCents),
    personal: eur(r.personalCents),
    sachkosten: eur(r.sachkostenCents),
    anlage: eur(r.anlageCents),
    abschreibung: eur(r.abschreibungCents),
    betriebsergebnis: eur(r.betriebsergebnisCents),
  };
}

function parseCents(s: string, allowNegative = false): number | null {
  return parseEuroToCents(s, { emptyAs: 0, allowNegative });
}

function formToInput(f: FormState): BwaMonthInput | null {
  const g = parseCents(f.getraenke);
  const sh = parseCents(f.speisenHaus);
  const sa = parseCents(f.speisenAusserHaus);
  const so = parseCents(f.sonstigeErloese);
  const se = parseCents(f.sonstErtraege);
  const u = parseCents(f.umsatz);
  const w = parseCents(f.wareneinsatz);
  const p = parseCents(f.personal);
  const s = parseCents(f.sachkosten);
  const a = parseCents(f.anlage, true);
  const ab = parseCents(f.abschreibung, true);
  const be = parseCents(f.betriebsergebnis, true);
  const all = [g, sh, sa, so, se, u, w, p, s, a, ab, be];
  if (all.some((v) => v === null)) return null;
  return {
    umsatzCents: u!,
    getraenkeCents: g!,
    speisenHausCents: sh!,
    speisenAusserHausCents: sa!,
    sonstigeErloeseCents: so!,
    sonstErtraegeCents: se!,
    wareneinsatzCents: w!,
    personalCents: p!,
    sachkostenCents: s!,
    anlageCents: a!,
    abschreibungCents: ab!,
    betriebsergebnisCents: be!,
  };
}

function BwaPage() {
  const qc = useQueryClient();
  const listFn = useServerFn(listBwaMonths);
  const upsertFn = useServerFn(upsertBwaMonth);
  const deleteFn = useServerFn(deleteBwaMonth);

  const listQ = useQuery({
    queryKey: ["bwa-monthly"],
    queryFn: () => listFn(),
  });

  const [entityFilter, setEntityFilter] = useState<string>("__all__");
  const [ccFilter, setCcFilter] = useState<string>("__all__");
  const [openDialog, setOpenDialog] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const rows = listQ.data ?? [];

  const entities = useMemo(
    () => Array.from(new Set(rows.map((r) => r.entity))).sort(),
    [rows],
  );
  const costCenters = useMemo(
    () => Array.from(new Set(rows.map((r) => r.costCenter))).sort(),
    [rows],
  );

  const filtered = rows.filter(
    (r) =>
      (entityFilter === "__all__" || r.entity === entityFilter) &&
      (ccFilter === "__all__" || r.costCenter === ccFilter),
  );

  const derived = useMemo(() => {
    const inp = formToInput(form);
    return inp ? deriveBwa(inp) : null;
  }, [form]);

  const validation = useMemo(() => {
    const inp = formToInput(form);
    return inp ? validateBwaMonth(inp) : null;
  }, [form]);

  const upsertMut = useMutation({
    mutationFn: () => {
      const inp = formToInput(form);
      if (!inp) throw new Error("Bitte alle Beträge im Euro-Format eingeben.");
      return upsertFn({
        data: {
          id: form.id,
          entity: form.entity.trim(),
          costCenter: form.costCenter.trim(),
          month: monthFirst(form.monthInput),
          ...inp,
        },
      });
    },
    onSuccess: () => {
      toast.success("BWA-Monat gespeichert.");
      setOpenDialog(false);
      setForm(EMPTY_FORM);
      qc.invalidateQueries({ queryKey: ["bwa-monthly"] });
    },
    onError: (e: unknown) =>
      toast.error(e instanceof Error ? e.message : "Speichern fehlgeschlagen."),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => deleteFn({ data: { id } }),
    onSuccess: () => {
      toast.success("BWA-Monat gelöscht.");
      setDeleteId(null);
      qc.invalidateQueries({ queryKey: ["bwa-monthly"] });
    },
    onError: (e: unknown) =>
      toast.error(e instanceof Error ? e.message : "Löschen fehlgeschlagen."),
  });

  function openNew() {
    setForm({
      ...EMPTY_FORM,
      entity: entities[0] ?? DEFAULT_ENTITY,
      costCenter: costCenters[0] ?? "",
    });
    setOpenDialog(true);
  }

  function openEdit(r: BwaRow) {
    setForm(formFromRow(r));
    setOpenDialog(true);
  }

  const saveDisabled =
    !form.entity.trim() ||
    !form.costCenter.trim() ||
    !/^\d{4}-\d{2}$/.test(form.monthInput) ||
    !validation ||
    !validation.ok ||
    upsertMut.isPending;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <h1 className="text-2xl font-semibold">BWA</h1>
          <p className="text-sm text-muted-foreground">
            Monatliche Betriebswirtschaftliche Auswertung pro Gesellschaft und Kostenstelle.
          </p>
        </div>
        <div className="ml-auto flex flex-wrap items-end gap-2">
          <div>
            <Label className="text-xs">Gesellschaft</Label>
            <Select value={entityFilter} onValueChange={setEntityFilter}>
              <SelectTrigger className="w-56">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">Alle</SelectItem>
                {entities.map((e) => (
                  <SelectItem key={e} value={e}>
                    {e}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Kostenstelle</Label>
            <Select value={ccFilter} onValueChange={setCcFilter}>
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">Alle</SelectItem>
                {costCenters.map((c) => (
                  <SelectItem key={c} value={c}>
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button onClick={openNew}>Monat erfassen</Button>
        </div>
      </div>

      <Card className="p-0 overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Monat</TableHead>
              <TableHead>Gesellschaft</TableHead>
              <TableHead>Kostenstelle</TableHead>
              <TableHead className="text-right">Umsatz</TableHead>
              <TableHead className="text-right">Wareneinsatz</TableHead>
              <TableHead className="text-right">Personal</TableHead>
              <TableHead className="text-right">Personal %</TableHead>
              <TableHead className="text-right">Sachkosten</TableHead>
              <TableHead className="text-right">Betriebsergebnis</TableHead>
              <TableHead>Quelle</TableHead>
              <TableHead className="text-right">Aktionen</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {listQ.isLoading && (
              <TableRow>
                <TableCell colSpan={11} className="text-center text-muted-foreground py-6">
                  Lade…
                </TableCell>
              </TableRow>
            )}
            {!listQ.isLoading && filtered.length === 0 && (
              <TableRow>
                <TableCell colSpan={11} className="text-center text-muted-foreground py-6">
                  Noch keine BWA-Zeilen erfasst.
                </TableCell>
              </TableRow>
            )}
            {filtered.map((r) => {
              const persQuote =
                r.umsatzCents > 0
                  ? ((r.personalCents / r.umsatzCents) * 100).toLocaleString("de-DE", {
                      minimumFractionDigits: 1,
                      maximumFractionDigits: 1,
                    }) + " %"
                  : "—";
              const beNeg = r.betriebsergebnisCents < 0;
              const detailOpen = !!expanded[r.id];
              const hasDetail =
                r.sachkostenDetail && Object.keys(r.sachkostenDetail).length > 0;
              return (
                <>
                  <TableRow key={r.id}>
                    <TableCell>{fmtMonth(r.month)}</TableCell>
                    <TableCell>{r.entity}</TableCell>
                    <TableCell>{r.costCenter}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {fmtCents(r.umsatzCents)} €
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {fmtCents(r.wareneinsatzCents)} €
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {fmtCents(r.personalCents)} €
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">
                      {persQuote}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {fmtCents(r.sachkostenCents)} €
                    </TableCell>
                    <TableCell
                      className={
                        "text-right tabular-nums font-medium " +
                        (beNeg ? "text-destructive" : "text-emerald-600")
                      }
                    >
                      {fmtCents(r.betriebsergebnisCents)} €
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">{r.source}</Badge>
                    </TableCell>
                    <TableCell className="text-right space-x-2 whitespace-nowrap">
                      {hasDetail && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() =>
                            setExpanded((e) => ({ ...e, [r.id]: !e[r.id] }))
                          }
                        >
                          {detailOpen ? "▲" : "▼"}
                        </Button>
                      )}
                      <Button size="sm" variant="outline" onClick={() => openEdit(r)}>
                        Bearbeiten
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => setDeleteId(r.id)}
                      >
                        Löschen
                      </Button>
                    </TableCell>
                  </TableRow>
                  {detailOpen && hasDetail && (
                    <TableRow key={r.id + "__detail"}>
                      <TableCell colSpan={11} className="bg-muted/40">
                        <div className="text-xs">
                          <div className="font-medium mb-1">Sachkosten-Detail</div>
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-x-4 gap-y-1">
                            {Object.entries(r.sachkostenDetail!).map(([k, v]) => (
                              <div key={k} className="flex justify-between">
                                <span className="text-muted-foreground">{k}</span>
                                <span className="tabular-nums">
                                  {fmtCents(Number(v))} €
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      </TableCell>
                    </TableRow>
                  )}
                </>
              );
            })}
          </TableBody>
        </Table>
      </Card>

      {/* Erfassungs-/Bearbeiten-Dialog */}
      <Dialog open={openDialog} onOpenChange={setOpenDialog}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {form.id ? "BWA-Monat bearbeiten" : "BWA-Monat erfassen"}
            </DialogTitle>
          </DialogHeader>

          <div className="grid grid-cols-2 gap-3">
            <FieldText
              label="Gesellschaft"
              value={form.entity}
              suggestions={entities}
              listId="bwa-entities"
              onChange={(v) => setForm((f) => ({ ...f, entity: v }))}
            />
            <FieldText
              label="Kostenstelle"
              value={form.costCenter}
              suggestions={costCenters}
              listId="bwa-cc"
              onChange={(v) => setForm((f) => ({ ...f, costCenter: v }))}
            />
            <div>
              <Label className="text-xs">Monat</Label>
              <Input
                type="month"
                value={form.monthInput}
                onChange={(e) =>
                  setForm((f) => ({ ...f, monthInput: e.target.value }))
                }
              />
            </div>
            <div />
            <FieldEuro
              label="Umsatz"
              value={form.umsatz}
              onChange={(v) => setForm((f) => ({ ...f, umsatz: v }))}
            />
            <FieldEuro
              label="Sonst. betr. Erträge"
              value={form.sonstErtraege}
              onChange={(v) => setForm((f) => ({ ...f, sonstErtraege: v }))}
            />
            <FieldEuro
              label="Getränke"
              value={form.getraenke}
              onChange={(v) => setForm((f) => ({ ...f, getraenke: v }))}
            />
            <FieldEuro
              label="Speisen im Haus"
              value={form.speisenHaus}
              onChange={(v) => setForm((f) => ({ ...f, speisenHaus: v }))}
            />
            <FieldEuro
              label="Speisen außer Haus"
              value={form.speisenAusserHaus}
              onChange={(v) => setForm((f) => ({ ...f, speisenAusserHaus: v }))}
            />
            <FieldEuro
              label="Sonstige Erlöse"
              value={form.sonstigeErloese}
              onChange={(v) => setForm((f) => ({ ...f, sonstigeErloese: v }))}
            />
            <FieldEuro
              label="Wareneinsatz"
              value={form.wareneinsatz}
              onChange={(v) => setForm((f) => ({ ...f, wareneinsatz: v }))}
            />
            <FieldEuro
              label="Personal"
              value={form.personal}
              onChange={(v) => setForm((f) => ({ ...f, personal: v }))}
            />
            <FieldEuro
              label="Sachkosten"
              value={form.sachkosten}
              onChange={(v) => setForm((f) => ({ ...f, sachkosten: v }))}
            />
            <FieldEuro
              label="Anlage"
              value={form.anlage}
              allowNegative
              onChange={(v) => setForm((f) => ({ ...f, anlage: v }))}
            />
            <FieldEuro
              label="Abschreibung"
              value={form.abschreibung}
              allowNegative
              onChange={(v) => setForm((f) => ({ ...f, abschreibung: v }))}
            />
            <FieldEuro
              label="Betriebsergebnis"
              value={form.betriebsergebnis}
              allowNegative
              onChange={(v) => setForm((f) => ({ ...f, betriebsergebnis: v }))}
            />
          </div>

          {derived && (
            <div className="rounded-md border p-3 text-sm bg-muted/30">
              <div className="font-medium mb-2">Abgeleitete Werte</div>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-x-4 gap-y-1 tabular-nums">
                <Line label="Gesamtleistung" cents={derived.gesamtleistungCents} />
                <Line label="Rohertrag I" cents={derived.rohertrag1Cents} />
                <Line label="Rohertrag II" cents={derived.rohertrag2Cents} />
                <Line label="Ergebnis op. Tätigkeit" cents={derived.ergebnisOpCents} />
                <Line
                  label="Betriebsergebnis (Soll)"
                  cents={derived.betriebsergebnisSollCents}
                />
              </div>
            </div>
          )}

          {validation && !validation.ok && (
            <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive space-y-1">
              {validation.errors.map((e, i) => (
                <div key={i}>{e}</div>
              ))}
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpenDialog(false)}>
              Abbrechen
            </Button>
            <Button disabled={saveDisabled} onClick={() => upsertMut.mutate()}>
              {upsertMut.isPending ? "Speichere…" : "Speichern"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>BWA-Monat löschen?</AlertDialogTitle>
            <AlertDialogDescription>
              Diese Zeile wird endgültig entfernt. Ein Snapshot bleibt im Audit-Log.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Abbrechen</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteId && deleteMut.mutate(deleteId)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Löschen
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function FieldEuro({
  label,
  value,
  onChange,
  allowNegative,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  allowNegative?: boolean;
}) {
  const parsed = parseEuroToCents(value, { emptyAs: 0, allowNegative: !!allowNegative });
  const invalid = value.trim() !== "" && parsed === null;
  return (
    <div>
      <Label className="text-xs">{label} (€)</Label>
      <Input
        inputMode="decimal"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={invalid ? "border-destructive" : ""}
        placeholder="0,00"
      />
    </div>
  );
}

function FieldText({
  label,
  value,
  onChange,
  suggestions,
  listId,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  suggestions: string[];
  listId: string;
}) {
  return (
    <div>
      <Label className="text-xs">{label}</Label>
      <Input
        list={listId}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      <datalist id={listId}>
        {suggestions.map((s) => (
          <option key={s} value={s} />
        ))}
      </datalist>
    </div>
  );
}

function Line({ label, cents }: { label: string; cents: number }) {
  return (
    <div className="flex justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className={cents < 0 ? "text-destructive" : ""}>{fmtCents(cents)} €</span>
    </div>
  );
}