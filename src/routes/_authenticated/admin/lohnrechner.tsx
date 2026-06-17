// Admin-UI für die Brutto/Netto-Vorschau (2c). Zustandslos: ruft nur
// `berechneLohnFuerMitarbeiter` (read-only) und zeigt Zeilen, Person und
// Ergebnis tabellarisch an, damit Frank Zeile für Zeile gegen edlohn vergleichen kann.

import { createFileRoute, redirect } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { listStaff } from "@/lib/admin/staff.functions";
import { berechneLohnFuerMitarbeiter } from "@/lib/lohn/lohn-rechner.functions";
import {
  buildLohnFileName,
  buildLohnXlsx,
  downloadBlob,
} from "@/lib/lohn/lohn-excel-export";
import { FileSpreadsheet } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/lohnrechner")({
  beforeLoad: ({ context }) => {
    const role = (context as { identity?: { role?: string } }).identity?.role;
    if (role !== "admin") throw redirect({ to: "/admin" });
  },
  head: () => ({ meta: [{ title: "Lohnrechner (Vorschau)" }] }),
  component: LohnRechnerPage,
});

type Mode = "simple" | "extended";

function eur(cents: number | undefined | null): string {
  const v = Number(cents ?? 0) / 100;
  return v.toLocaleString("de-DE", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
  });
}

function hrs(h: number | undefined | null): string {
  return (Number(h ?? 0)).toLocaleString("de-DE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function defaultFromTo(): { from: string; to: string } {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  const first = new Date(Date.UTC(y, m, 1));
  const last = new Date(Date.UTC(y, m + 1, 0));
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  return { from: iso(first), to: iso(last) };
}

function LohnRechnerPage() {
  const staffQ = useQuery({ queryKey: ["admin-staff-list"], queryFn: () => listStaff() });

  const def = useMemo(defaultFromTo, []);
  const [staffId, setStaffId] = useState<string>("");
  const [fromDate, setFromDate] = useState<string>(def.from);
  const [toDate, setToDate] = useState<string>(def.to);
  const [mode, setMode] = useState<Mode>("simple");

  const callFn = useServerFn(berechneLohnFuerMitarbeiter);
  const mut = useMutation({
    mutationFn: () =>
      callFn({ data: { staffId, fromDate, toDate, mode, zusatzZeilen: [] } }),
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Berechnung fehlgeschlagen."),
  });

  const canRun =
    !!staffId && /^\d{4}-\d{2}-\d{2}$/.test(fromDate) && /^\d{4}-\d{2}-\d{2}$/.test(toDate);

  const result = mut.data;

  const selectedStaffLabel = useMemo(() => {
    const s = (staffQ.data ?? []).find((x) => x.id === staffId);
    if (!s) return staffId;
    return s.displayName || `${s.firstName ?? ""} ${s.lastName ?? ""}`.trim() || s.id;
  }, [staffQ.data, staffId]);

  async function handleExport() {
    if (!result) return;
    try {
      const blob = await buildLohnXlsx({
        staffLabel: selectedStaffLabel,
        fromDate,
        toDate,
        mode: result.mode,
        totalHours: result.totalHours,
        hourlyRateCents: result.hourlyRateCents,
        entryCount: result.entryCount,
        zuschlagCents: result.zuschlagCents,
        buckets: result.buckets,
        person: result.person,
        zeilen: result.zeilen,
        ergebnis: result.ergebnis,
      });
      downloadBlob(blob, buildLohnFileName(selectedStaffLabel, fromDate, toDate));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Excel-Export fehlgeschlagen.");
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          Lohnrechner (Vorschau)
        </h1>
        <p className="text-sm text-muted-foreground">
          Zustandslose Vorschau-Rechnung — liest nur, schreibt nichts. Vergleich Zeile für Zeile
          gegen edlohn.
        </p>
      </div>

      <Card className="space-y-4 p-4">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-1.5">
            <Label htmlFor="staff">Mitarbeiter</Label>
            <Select value={staffId} onValueChange={setStaffId}>
              <SelectTrigger id="staff">
                <SelectValue placeholder="Auswählen…" />
              </SelectTrigger>
              <SelectContent>
                {(staffQ.data ?? [])
                  .slice()
                  .sort((a, b) => (a.displayName ?? "").localeCompare(b.displayName ?? ""))
                  .map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.displayName || `${s.firstName ?? ""} ${s.lastName ?? ""}`.trim() || s.id}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="from">Von</Label>
            <Input
              id="from"
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="to">Bis</Label>
            <Input
              id="to"
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="mode">SFN-Modus</Label>
            <Select value={mode} onValueChange={(v) => setMode(v as Mode)}>
              <SelectTrigger id="mode">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="simple">simple</SelectItem>
                <SelectItem value="extended">extended</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="flex justify-end">
          <Button disabled={!canRun || mut.isPending} onClick={() => mut.mutate()}>
            {mut.isPending ? "Rechne…" : "Berechnen"}
          </Button>
        </div>
      </Card>

      {mut.isError && (
        <Card className="p-4 text-sm text-destructive">
          {(mut.error as Error)?.message ?? "Fehler bei der Berechnung."}
        </Card>
      )}

      {result && (
        <div className="space-y-6">
          <div className="flex justify-end">
            <Button variant="outline" onClick={handleExport}>
              <FileSpreadsheet className="mr-2 h-4 w-4" />
              Excel exportieren
            </Button>
          </div>
          <Card className="p-4">
            <h2 className="mb-3 text-base font-semibold">Periode</h2>
            <div className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2 lg:grid-cols-4">
              <KV k="Stunden gesamt" v={hrs(result.totalHours)} />
              <KV k="Stundensatz" v={eur(result.hourlyRateCents)} />
              <KV k="Einträge" v={String(result.entryCount)} />
              <KV k="SFN-Modus" v={result.mode} />
              <KV k="Zeitlohn (Stunden × Satz)" v={eur(Math.round(result.totalHours * result.hourlyRateCents))} />
              <KV k="SFN-Zuschläge" v={eur(result.zuschlagCents)} />
            </div>
          </Card>

          <Card className="p-4">
            <h2 className="mb-3 text-base font-semibold">SFN-Töpfe (Stunden)</h2>
            <div className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2 lg:grid-cols-3">
              <KV k="Nacht 25 %" v={hrs(result.buckets.night25Hours)} />
              <KV k="Nacht 40 %" v={hrs(result.buckets.night40Hours)} />
              <KV k="Sonntag" v={hrs(result.buckets.sundayHours)} />
              <KV k="Feiertag" v={hrs(result.buckets.holidayHours)} />
              <KV k="Feiertag 150 % (1.5., 25./26.12.)" v={hrs(result.buckets.holiday150Hours)} />
            </div>
          </Card>

          <Card className="p-4">
            <h2 className="mb-3 text-base font-semibold">Personenparameter</h2>
            <div className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2 lg:grid-cols-3">
              <KV k="Steuerklasse" v={String(result.person.steuerklasse)} />
              <KV k="Kinderfreibeträge (ZKF)" v={String(result.person.zkf)} />
              <KV k="KV-Zusatzbeitrag (%)" v={String(result.person.kvzProzent)} />
              <KV k="Kirchensteuer (BY)" v={result.person.kirchensteuerBayern ? "ja" : "nein"} />
              <KV k="Anzahl Kinder" v={String(result.person.kinderzahl)} />
              <KV k="Elterneigenschaft" v={result.person.elterneigenschaft ? "ja" : "nein"} />
              <KV k="PV-Kinderlosen-Zuschlag" v={result.person.pvKinderlosZuschlag ? "ja" : "nein"} />
              <KV k="Beschäftigung" v={result.person.beschaeftigung} />
            </div>
          </Card>

          <Card className="p-4">
            <h2 className="mb-3 text-base font-semibold">Entgeltzeilen</h2>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Kategorie</TableHead>
                  <TableHead>Bezeichnung</TableHead>
                  <TableHead className="text-right">Stunden</TableHead>
                  <TableHead className="text-right">Satz</TableHead>
                  <TableHead className="text-right">Betrag</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {result.zeilen.map((z, i) => (
                  <TableRow key={i}>
                    <TableCell className="font-mono text-xs">{z.kategorie}</TableCell>
                    <TableCell>{z.bezeichnung ?? "—"}</TableCell>
                    <TableCell className="text-right">{z.stunden != null ? hrs(z.stunden) : "—"}</TableCell>
                    <TableCell className="text-right">{z.satzCent != null ? eur(z.satzCent) : "—"}</TableCell>
                    <TableCell className="text-right">{eur(z.betragCent)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>

          <Card className="p-4">
            <h2 className="mb-3 text-base font-semibold">Ergebnis</h2>
            <div className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2 lg:grid-cols-3">
              <KV k="Gesamtbrutto" v={eur(result.ergebnis.gesamtbruttoCent)} />
              <KV k="St-/SV-Brutto" v={eur(result.ergebnis.stSvBruttoCent)} />
              <KV k="Lohnsteuer" v={eur(result.ergebnis.lstCent)} />
              <KV k="Soli" v={eur(result.ergebnis.soliCent)} />
              <KV k="Kirchensteuer" v={eur(result.ergebnis.kistCent)} />
              <KV k="KV (AN)" v={eur(result.ergebnis.kvCent)} />
              <KV k="RV (AN)" v={eur(result.ergebnis.rvCent)} />
              <KV k="AV (AN)" v={eur(result.ergebnis.avCent)} />
              <KV k="PV (AN)" v={eur(result.ergebnis.pvCent)} />
              <KV k="Gesamtnetto" v={eur(result.ergebnis.gesamtnettoCent)} strong />
              <KV k="Auszahlung" v={eur(result.ergebnis.auszahlungCent)} strong />
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}

function KV({ k, v, strong }: { k: string; v: string; strong?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-border/40 py-1 last:border-b-0">
      <span className="text-muted-foreground">{k}</span>
      <span className={"tabular-nums " + (strong ? "font-semibold text-foreground" : "")}>{v}</span>
    </div>
  );
}