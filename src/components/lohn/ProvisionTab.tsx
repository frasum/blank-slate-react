// P2 — Provisions-Tab (UI-Konsument der P1-Server-Fns).
//
// Verantwortlich für: Kopfzeile mit Perioden-Pool + Live-Parametern,
// Verteilungs-Tabelle (Suche + Sortierung), Tages-Drilldown (dayBreakdown
// → macht die Formel an echten Zahlen nachvollziehbar), Erklärungs-Panel
// mit interpolierten Werten und Einstellungs-Dialog (admin-only).
// Bei „Alle Standorte" bewusst KEIN Merge — Einstellungen und Pools sind
// standort-scoped.

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { ChevronDown, Search, Settings } from "lucide-react";
import { fmtCents, parseEuroToCents } from "@/lib/format";
import {
  getProvisionOverview,
  updateCommissionSettings,
  type ProvisionOverviewResult,
  type ProvisionOverviewRow,
} from "@/lib/lohn/provision.functions";
import type { ProvisionDayBreakdown } from "@/lib/lohn/provision-calc";

function fmtEuro(cents: number): string {
  return `${fmtCents(cents)} €`;
}

function fmtHours(minutes: number): string {
  const abs = Math.max(0, Math.round(minutes));
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  return `${h}:${String(m).padStart(2, "0")}`;
}

function fmtPct(pct: number): string {
  return pct.toLocaleString("de-DE", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
}

function fmtDDMM(iso: string): string {
  const [, m, d] = iso.split("-");
  return `${d}.${m}.`;
}

type Props = {
  locationId: string;
  locationLabel: string;
  isAllLocations: boolean;
  periodStart: string;
  periodEnd: string;
  isAdmin: boolean;
};

export function ProvisionTab(props: Props) {
  const { locationId, locationLabel, isAllLocations, periodStart, periodEnd, isAdmin } =
    props;

  if (isAllLocations) {
    return (
      <Card className="p-6 text-sm text-muted-foreground">
        Provision wird je Standort berechnet — bitte einen Standort wählen.
      </Card>
    );
  }

  return (
    <ProvisionTabInner
      locationId={locationId}
      locationLabel={locationLabel}
      periodStart={periodStart}
      periodEnd={periodEnd}
      isAdmin={isAdmin}
    />
  );
}

type InnerProps = Omit<Props, "isAllLocations">;

function ProvisionTabInner({
  locationId,
  locationLabel,
  periodStart,
  periodEnd,
  isAdmin,
}: InnerProps) {
  const qc = useQueryClient();
  const fetchOverview = useServerFn(getProvisionOverview);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [search, setSearch] = useState("");

  const overviewQ = useQuery({
    queryKey: ["provision-overview", locationId, periodStart, periodEnd],
    queryFn: () =>
      fetchOverview({ data: { locationId, periodStart, periodEnd } }),
    enabled: Boolean(locationId) && Boolean(periodStart) && Boolean(periodEnd),
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["provision-overview", locationId] });
  };

  const data: ProvisionOverviewResult | undefined = overviewQ.data;

  const enabledData = data && data.enabled ? data : null;
  const searchLower = search.trim().toLowerCase();
  const rowsSorted = useMemo(() => {
    if (!enabledData) return [] as ProvisionOverviewRow[];
    const filtered = searchLower
      ? enabledData.rows.filter((r) => r.displayName.toLowerCase().includes(searchLower))
      : enabledData.rows;
    return [...filtered].sort((a, b) => b.provisionCents - a.provisionCents);
  }, [enabledData, searchLower]);

  if (overviewQ.isLoading) {
    return <Card className="p-6 text-sm text-muted-foreground">Lade Provisions-Daten…</Card>;
  }
  if (overviewQ.isError) {
    return (
      <Card className="p-6 text-sm text-destructive">
        {(overviewQ.error as Error).message || "Fehler beim Laden."}
      </Card>
    );
  }
  if (!data) {
    return <Card className="p-6 text-sm text-muted-foreground">Keine Daten.</Card>;
  }

  if (!data.enabled) {
    return (
      <>
        <Card className="p-6 text-sm text-muted-foreground flex flex-wrap items-center justify-between gap-3">
          <span>Provision ist für {locationLabel || "diesen Standort"} deaktiviert.</span>
          {isAdmin && (
            <Button size="sm" onClick={() => setSettingsOpen(true)}>
              <Settings className="mr-1 h-4 w-4" /> Einstellungen
            </Button>
          )}
        </Card>
        {isAdmin && (
          <SettingsDialog
            open={settingsOpen}
            onOpenChange={setSettingsOpen}
            locationId={locationId}
            locationLabel={locationLabel}
            initialEnabled={false}
            initialMinRevenueCents={0}
            initialPct={0}
            onSaved={invalidate}
          />
        )}
      </>
    );
  }

  const { settings, poolCents, dayBreakdown } = data;

  const rowsSum = rowsSorted.reduce((acc, r) => acc + r.provisionCents, 0);
  const daySum = dayBreakdown.reduce((acc, d) => acc + d.dayPoolCents, 0);

  return (
    <div className="space-y-4">
      {/* Kopfzeile: Pool + Live-Parameter + Zahnrad */}
      <Card className="p-4">
        <div className="flex flex-wrap items-center gap-3">
          <div>
            <div className="text-xs uppercase tracking-wide text-muted-foreground">
              Perioden-Pool
            </div>
            <div className="text-2xl font-semibold tabular-nums">{fmtEuro(poolCents)}</div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge variant="secondary">
              min {fmtEuro(settings.minRevenueCents)} / Kellner·Tag
            </Badge>
            <Badge variant="secondary">{fmtPct(settings.pct)} %</Badge>
          </div>
          {isAdmin && (
            <Button
              size="sm"
              variant="ghost"
              className="ml-auto"
              onClick={() => setSettingsOpen(true)}
              aria-label="Provisions-Einstellungen"
            >
              <Settings className="mr-1 h-4 w-4" /> Einstellungen
            </Button>
          )}
        </div>
      </Card>

      {/* Verteilungs-Tabelle */}
      <Card>
        <div className="p-3 border-b flex flex-wrap items-center gap-2">
          <div className="relative max-w-xs w-full">
            <Search className="pointer-events-none absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Mitarbeiter suchen…"
              className="h-9 pl-8"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="ml-auto text-xs text-muted-foreground">
            Sortierung: Provision absteigend
          </div>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Mitarbeiter</TableHead>
              <TableHead className="text-right">Stunden</TableHead>
              <TableHead className="text-right">Provision</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rowsSorted.length === 0 && (
              <TableRow>
                <TableCell colSpan={3} className="text-center text-muted-foreground py-6">
                  Keine Provisionsempfänger im Zeitraum.
                </TableCell>
              </TableRow>
            )}
            {rowsSorted.map((r: ProvisionOverviewRow) => (
              <TableRow key={r.staffId}>
                <TableCell>{r.displayName}</TableCell>
                <TableCell className="text-right tabular-nums">
                  {fmtHours(r.minutes)}
                </TableCell>
                <TableCell className="text-right tabular-nums font-medium">
                  {fmtEuro(r.provisionCents)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
          {rowsSorted.length > 0 && (
            <TableFooter>
              <TableRow>
                <TableCell colSpan={2} className="text-right">
                  Summe (= Perioden-Pool)
                </TableCell>
                <TableCell className="text-right tabular-nums font-semibold">
                  {fmtEuro(rowsSum)}
                </TableCell>
              </TableRow>
            </TableFooter>
          )}
        </Table>
      </Card>

      {/* Tages-Drilldown */}
      <Collapsible>
        <Card>
          <CollapsibleTrigger asChild>
            <button
              type="button"
              className="flex w-full items-center gap-2 p-3 text-left text-sm font-medium hover:bg-muted/50"
            >
              <ChevronDown className="h-4 w-4 transition-transform data-[state=open]:rotate-180" />
              Berechnung im Detail (pro Geschäftstag)
            </button>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="border-t">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Tag</TableHead>
                    <TableHead className="text-right">Kellner</TableHead>
                    <TableHead className="text-right">Umsatz</TableHead>
                    <TableHead className="text-right">Schwelle</TableHead>
                    <TableHead className="text-right">Über Schwelle</TableHead>
                    <TableHead className="text-right">Tages-Pool</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {dayBreakdown.length === 0 && (
                    <TableRow>
                      <TableCell
                        colSpan={6}
                        className="text-center text-muted-foreground py-6"
                      >
                        Keine Abrechnungen im Zeitraum.
                      </TableCell>
                    </TableRow>
                  )}
                  {dayBreakdown.map((d: ProvisionDayBreakdown) => {
                    const zero = d.dayPoolCents === 0;
                    const over = Math.max(0, d.revenueCents - d.thresholdCents);
                    return (
                      <TableRow
                        key={d.businessDate}
                        className={zero ? "text-muted-foreground" : undefined}
                      >
                        <TableCell className="tabular-nums">
                          {fmtDDMM(d.businessDate)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {d.waiterCount}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {fmtEuro(d.revenueCents)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {fmtEuro(d.thresholdCents)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {d.waiterCount > 0 && d.revenueCents >= d.thresholdCents
                            ? fmtEuro(over)
                            : "—"}
                        </TableCell>
                        <TableCell className="text-right tabular-nums font-medium">
                          {fmtEuro(d.dayPoolCents)}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
                {dayBreakdown.length > 0 && (
                  <TableFooter>
                    <TableRow>
                      <TableCell colSpan={5} className="text-right">
                        Σ Tages-Pools (= Perioden-Pool)
                      </TableCell>
                      <TableCell className="text-right tabular-nums font-semibold">
                        {fmtEuro(daySum)}
                      </TableCell>
                    </TableRow>
                  </TableFooter>
                )}
              </Table>
            </div>
          </CollapsibleContent>
        </Card>
      </Collapsible>

      {/* Erklärungs-Panel */}
      <Collapsible>
        <Card>
          <CollapsibleTrigger asChild>
            <button
              type="button"
              className="flex w-full items-center gap-2 p-3 text-left text-sm font-medium hover:bg-muted/50"
            >
              <ChevronDown className="h-4 w-4 transition-transform data-[state=open]:rotate-180" />
              Wie wird die Provision berechnet?
            </button>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="border-t p-4 text-sm leading-relaxed space-y-3">
              <p>
                <strong>Pro Geschäftstag:</strong> Alle Kellner mit Abrechnung zählen —
                inklusive eingetragener Zweit-/Zusatzkellner; Geschäftsleitung zählt nie
                mit. Der Tagesumsatz ist die Summe der POS-Umsätze dieser Abrechnungen.
                Nur wenn <code>Tagesumsatz ÷ Kellnerzahl ≥ {fmtEuro(settings.minRevenueCents)}</code>,
                entsteht Provision:{" "}
                <strong>
                  Tages-Pool = (Tagesumsatz − {fmtEuro(settings.minRevenueCents)} ×
                  Kellnerzahl) × {fmtPct(settings.pct)} %
                </strong>
                .
              </p>
              <p>
                <strong>Verteilung:</strong> Alle Tages-Pools der Periode werden addiert
                und nach den Service-Stunden der Periode verteilt (aus der Zeiterfassung):{" "}
                <code>Pool ÷ Gesamtstunden × eigene Stunden</code> — centgenau, die Summe
                der Auszahlungen entspricht exakt dem Pool.
              </p>
            </div>
          </CollapsibleContent>
        </Card>
      </Collapsible>

      {isAdmin && (
        <SettingsDialog
          open={settingsOpen}
          onOpenChange={setSettingsOpen}
          locationId={locationId}
          locationLabel={locationLabel}
          initialEnabled={true}
          initialMinRevenueCents={settings.minRevenueCents}
          initialPct={settings.pct}
          onSaved={invalidate}
        />
      )}
    </div>
  );
}

type SettingsDialogProps = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  locationId: string;
  locationLabel: string;
  initialEnabled: boolean;
  initialMinRevenueCents: number;
  initialPct: number;
  onSaved: () => void;
};

function SettingsDialog(props: SettingsDialogProps) {
  const {
    open,
    onOpenChange,
    locationId,
    locationLabel,
    initialEnabled,
    initialMinRevenueCents,
    initialPct,
    onSaved,
  } = props;
  const callUpdate = useServerFn(updateCommissionSettings);

  const [enabled, setEnabled] = useState(initialEnabled);
  const [minStr, setMinStr] = useState(() =>
    initialMinRevenueCents ? (initialMinRevenueCents / 100).toString().replace(".", ",") : "",
  );
  const [pctStr, setPctStr] = useState(() =>
    initialPct ? initialPct.toString().replace(".", ",") : "",
  );
  const [minErr, setMinErr] = useState<string | null>(null);
  const [pctErr, setPctErr] = useState<string | null>(null);

  // Reset Formularwerte, wenn der Dialog frisch geöffnet wird.
  useEffect(() => {
    if (!open) return;
    setEnabled(initialEnabled);
    setMinStr(
      initialMinRevenueCents
        ? (initialMinRevenueCents / 100).toString().replace(".", ",")
        : "",
    );
    setPctStr(initialPct ? initialPct.toString().replace(".", ",") : "");
    setMinErr(null);
    setPctErr(null);
  }, [open, initialEnabled, initialMinRevenueCents, initialPct]);

  const saveMut = useMutation({
    mutationFn: (input: {
      locationId: string;
      enabled: boolean;
      minRevenueCents: number;
      pct: number;
    }) => callUpdate({ data: input }),
    onSuccess: () => {
      toast.success("Einstellungen gespeichert.");
      onSaved();
      onOpenChange(false);
    },
    onError: (e: unknown) => {
      toast.error((e as Error).message || "Speichern fehlgeschlagen.");
    },
  });

  const handleSave = () => {
    setMinErr(null);
    setPctErr(null);
    const minCents = parseEuroToCents(minStr, { emptyAs: 0 });
    if (minCents === null || minCents < 0) {
      setMinErr("Ungültiger Betrag (z. B. 1.200,00).");
      return;
    }
    const pctNormalized = pctStr.trim().replace(",", ".");
    const pct = pctNormalized === "" ? 0 : Number.parseFloat(pctNormalized);
    if (!Number.isFinite(pct) || pct < 0 || pct > 100) {
      setPctErr("0–100, max. 2 Dezimalen.");
      return;
    }
    if (Math.round(pct * 100) !== pct * 100) {
      setPctErr("Maximal 2 Dezimalen.");
      return;
    }
    saveMut.mutate({ locationId, enabled, minRevenueCents: minCents, pct });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Provisions-Einstellungen</DialogTitle>
          <DialogDescription>
            Standort: <strong>{locationLabel || "—"}</strong>. Änderungen werden
            protokolliert.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="flex items-center justify-between gap-3">
            <Label htmlFor="prov-enabled" className="cursor-pointer">
              Provision aktiv
            </Label>
            <Switch id="prov-enabled" checked={enabled} onCheckedChange={setEnabled} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="prov-min">Mindestumsatz je Kellner und Tag (€)</Label>
            <Input
              id="prov-min"
              inputMode="decimal"
              placeholder="z. B. 1.200,00"
              value={minStr}
              onChange={(e) => setMinStr(e.target.value)}
            />
            {minErr && <p className="text-xs text-destructive">{minErr}</p>}
          </div>
          <div className="space-y-1">
            <Label htmlFor="prov-pct">Provisionssatz (%)</Label>
            <Input
              id="prov-pct"
              inputMode="decimal"
              placeholder="z. B. 5"
              value={pctStr}
              onChange={(e) => setPctStr(e.target.value)}
            />
            {pctErr && <p className="text-xs text-destructive">{pctErr}</p>}
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={saveMut.isPending}>
            Abbrechen
          </Button>
          <Button onClick={handleSave} disabled={saveMut.isPending}>
            {saveMut.isPending ? "Speichere…" : "Speichern"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}