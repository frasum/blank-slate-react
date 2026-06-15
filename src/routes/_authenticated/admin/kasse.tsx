// B3c-1b — Manager-/Admin-Kassenübersicht.
//
// Reiner UI-Commit auf den B3b/B3c-1a Server-Functions: alle Reads via
// queryOptions + useQuery, alle Writes via useServerFn + useMutation,
// keine optimistic updates auf Geldfeldern.

import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Download, FileText, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { listStaff } from "@/lib/admin/staff.functions";
import { listLocations } from "@/lib/admin/locations.functions";
import {
  addSessionSatellite,
  correctWaiterSettlement,
  finalizeSession,
  getCashOverview,
  getOrCreateOpenSession,
  getTipPoolOverview,
  listPaymentTerminals,
  listRevenueChannels,
  lockSession,
  removeSessionSatellite,
  setCashLock,
  updateSession,
} from "@/lib/cash/cash.functions";
import { generateDailySummaryPdf } from "@/lib/cash/pdfExport";

export const Route = createFileRoute("/_authenticated/admin/kasse")({
  head: () => ({ meta: [{ title: "Kasse" }] }),
  component: KassePage,
});

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function parseEuroToCents(value: string): number | null {
  const t = value.trim().replace(",", ".");
  if (t === "") return 0;
  if (!/^-?\d+(\.\d{0,2})?$/.test(t)) return null;
  const n = Number.parseFloat(t);
  if (!Number.isFinite(n)) return null;
  return Math.round(n * 100);
}

function fmtCents(c: number | null | undefined): string {
  const v = (c ?? 0) / 100;
  return v.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtTime(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
}

type CorrectState = {
  originalId: string;
  staffName: string;
  posSales: string;
  cardTotal: string;
  hilfMahl: string;
  openInvoices: string;
  cashHandedIn: string;
  reason: string;
};

function KassePage() {
  const { identity } = Route.useRouteContext();
  const isAdmin = identity.role === "admin";
  const qc = useQueryClient();

  const [businessDate, setBusinessDate] = useState<string>(todayIso());
  const [locationId, setLocationId] = useState<string>("");

  const fetchOverview = useServerFn(getCashOverview);
  const fetchChannels = useServerFn(listRevenueChannels);
  const fetchTerminals = useServerFn(listPaymentTerminals);
  const fetchStaff = useServerFn(listStaff);
  const fetchLocations = useServerFn(listLocations);
  const callCreateSession = useServerFn(getOrCreateOpenSession);
  const callUpdate = useServerFn(updateSession);
  const callAddSat = useServerFn(addSessionSatellite);
  const callRemoveSat = useServerFn(removeSessionSatellite);
  const callFinalize = useServerFn(finalizeSession);
  const callLock = useServerFn(lockSession);
  const callCorrect = useServerFn(correctWaiterSettlement);
  const callCashLock = useServerFn(setCashLock);

  const locationsQ = useQuery({
    queryKey: ["admin-locations"],
    queryFn: () => fetchLocations(),
  });

  useEffect(() => {
    if (!locationId && locationsQ.data && locationsQ.data.length > 0) {
      setLocationId(locationsQ.data[0].id);
    }
  }, [locationId, locationsQ.data]);

  const ovQ = useQuery({
    queryKey: ["cash", "overview", businessDate, locationId],
    queryFn: () => fetchOverview({ data: { businessDate, locationId } }),
    enabled: locationId !== "",
  });
  const channelsQ = useQuery({
    queryKey: ["cash", "channels", locationId],
    queryFn: () => fetchChannels({ data: { locationId } }),
    enabled: locationId !== "",
  });
  const terminalsQ = useQuery({
    queryKey: ["cash", "terminals", locationId],
    queryFn: () => fetchTerminals({ data: { locationId } }),
    enabled: locationId !== "",
  });
  const staffQ = useQuery({ queryKey: ["admin-staff"], queryFn: () => fetchStaff() });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["cash"] });

  const sessionId = ovQ.data?.session?.id ?? null;
  const sessionStatus = ovQ.data?.session?.status ?? null;
  const lockedThrough = ovQ.data?.cashLockedThroughDate ?? null;
  const underWaterline = lockedThrough !== null && businessDate <= lockedThrough;
  const isLocked = sessionStatus === "locked" || underWaterline;
  const isFinalized = sessionStatus === "finalized";
  const writable = sessionStatus === "open" && !underWaterline;
  const correctable =
    (sessionStatus === "open" || sessionStatus === "finalized") && !underWaterline;

  // -------------------- Session anlegen --------------------
  const createSessionMut = useMutation({
    mutationFn: () => {
      if (!locationId) throw new Error("Bitte einen Standort wählen.");
      return callCreateSession({ data: { businessDate, locationId } });
    },
    onSuccess: () => {
      toast.success("Session geöffnet.");
      void invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // -------------------- Korrektur --------------------
  const [correct, setCorrect] = useState<CorrectState | null>(null);
  const correctMut = useMutation({
    mutationFn: () => {
      if (!correct) throw new Error("invalid state");
      const pos = parseEuroToCents(correct.posSales);
      const card = parseEuroToCents(correct.cardTotal);
      const hilf = parseEuroToCents(correct.hilfMahl);
      const open = parseEuroToCents(correct.openInvoices);
      const cash = parseEuroToCents(correct.cashHandedIn);
      if (pos === null || card === null || hilf === null || open === null || cash === null) {
        throw new Error("Bitte gültige Eurobeträge eintragen.");
      }
      return callCorrect({
        data: {
          originalId: correct.originalId,
          posSalesCents: pos,
          cardTotalCents: card,
          hilfMahlCents: hilf,
          openInvoicesCents: open,
          cashHandedInCents: cash,
          reason: correct.reason,
        },
      });
    },
    onSuccess: () => {
      toast.success("Korrektur eingetragen.");
      setCorrect(null);
      void invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // -------------------- Footer-Aktionen --------------------
  const finalizeMut = useMutation({
    mutationFn: () => {
      if (!sessionId) throw new Error("Keine Session");
      return callFinalize({ data: { sessionId } });
    },
    onSuccess: () => {
      toast.success("Tag finalisiert.");
      void invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const [finalizeConfirm, setFinalizeConfirm] = useState(false);

  const lockMut = useMutation({
    mutationFn: () => {
      if (!sessionId) throw new Error("Keine Session");
      return callLock({ data: { sessionId } });
    },
    onSuccess: () => {
      toast.success("Session gesperrt.");
      void invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const [lockConfirm, setLockConfirm] = useState(false);

  // -------------------- Wasserlinie (Admin) --------------------
  const [cashLockDate, setCashLockDate] = useState<string>("");
  const [cashLockReason, setCashLockReason] = useState<string>("");
  const cashLockMut = useMutation({
    mutationFn: () =>
      callCashLock({ data: { locationId, throughDate: cashLockDate, reason: cashLockReason } }),
    onSuccess: () => {
      toast.success("Wasserlinie verschoben.");
      setCashLockReason("");
      void invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // -------------------- PDF Export --------------------
  const [pdfPreview, setPdfPreview] = useState<{
    blobUrl: string;
    blob: Blob;
    fileName: string;
  } | null>(null);
  function handleExportPdf() {
    const ov = ovQ.data;
    if (!ov?.session) {
      toast.error("Keine Session für diesen Tag.");
      return;
    }
    const channels = (channelsQ.data ?? []).map((c) => ({ id: c.id, label: c.label }));
    const terminals = (terminalsQ.data ?? []).map((t) => ({ id: t.id, label: t.label }));
    const staffById = new Map((staffQ.data ?? []).map((s) => [s.id, s.displayName]));
    const locationName =
      (locationsQ.data ?? []).find((l) => l.id === locationId)?.name ?? undefined;
    try {
      const out = generateDailySummaryPdf({
        session: ov.session as unknown as Parameters<typeof generateDailySummaryPdf>[0]["session"],
        locationName,
        channels,
        channelAmounts: ov.channelAmounts,
        terminals,
        terminalAmounts: ov.terminalAmounts,
        settlements: ov.settlements.map((s) => ({
          staffName: s.staffName,
          status: s.status as string,
          pos_sales_cents: Number(s.pos_sales_cents),
          card_total_cents: Number(s.card_total_cents),
          hilf_mahl_cents: Number(s.hilf_mahl_cents),
          open_invoices_cents: Number(s.open_invoices_cents),
          cash_handed_in_cents: Number(s.cash_handed_in_cents),
          differenz_cents: Number(s.differenz_cents),
          kitchen_tip_cents: Number(s.kitchen_tip_cents),
        })),
        expenses: ov.expenses.map((e) => ({
          description: e.description,
          amountCents: e.amountCents,
        })),
        advances: ov.advances.map((a) => ({
          staffName: staffById.get(a.staffId) ?? a.staffId.slice(0, 8),
          amountCents: a.amountCents,
          note: a.note,
        })),
      });
      setPdfPreview(out);
    } catch (e) {
      toast.error((e as Error).message);
    }
  }
  function closePdfPreview() {
    if (pdfPreview) URL.revokeObjectURL(pdfPreview.blobUrl);
    setPdfPreview(null);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Kasse</h1>
          <p className="text-sm text-muted-foreground">
            Tagesübersicht, Kellnerabrechnungen, Session-Felder und Satelliten.
          </p>
        </div>
        <div className="flex items-end gap-3">
          <div className="space-y-1">
            <Label htmlFor="loc">Standort</Label>
            <Select
              value={locationId}
              onValueChange={setLocationId}
              disabled={!locationsQ.data || locationsQ.data.length === 0}
            >
              <SelectTrigger id="loc" className="min-w-[10rem]">
                <SelectValue placeholder="Standort wählen" />
              </SelectTrigger>
              <SelectContent>
                {(locationsQ.data ?? []).map((l) => (
                  <SelectItem key={l.id} value={l.id}>
                    {l.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="bd">Geschäftstag</Label>
            <Input
              id="bd"
              type="date"
              value={businessDate}
              onChange={(e) => setBusinessDate(e.target.value)}
            />
          </div>
          {sessionStatus && (
            <Badge variant={isLocked ? "secondary" : isFinalized ? "outline" : "default"}>
              {sessionStatus}
            </Badge>
          )}
          {underWaterline && <Badge variant="destructive">≤ {lockedThrough} gesperrt</Badge>}
          {ovQ.data?.session && (
            <Button variant="outline" onClick={handleExportPdf} className="gap-2">
              <Download className="h-4 w-4" />
              PDF Export
            </Button>
          )}
        </div>
      </div>

      {ovQ.isLoading && <Card className="p-6 text-sm text-muted-foreground">Lade…</Card>}

      {!ovQ.isLoading && !ovQ.data?.session && (
        <Card className="space-y-3 p-6">
          <div className="text-sm">
            Für <strong>{businessDate}</strong> existiert noch keine Session.
          </div>
          <Button disabled={createSessionMut.isPending} onClick={() => createSessionMut.mutate()}>
            {createSessionMut.isPending ? "Wird angelegt…" : "Session anlegen"}
          </Button>
        </Card>
      )}

      {ovQ.data?.session && (
        <>
          <SettlementsCard
            data={ovQ.data}
            correctable={correctable}
            onCorrect={(row) =>
              setCorrect({
                originalId: row.id,
                staffName: row.staffName,
                posSales: (Number(row.pos_sales_cents) / 100).toFixed(2),
                cardTotal: (Number(row.card_total_cents) / 100).toFixed(2),
                hilfMahl: (Number(row.hilf_mahl_cents) / 100).toFixed(2),
                openInvoices: (Number(row.open_invoices_cents) / 100).toFixed(2),
                cashHandedIn: (Number(row.cash_handed_in_cents) / 100).toFixed(2),
                reason: "",
              })
            }
          />

          <SessionFieldsCard
            sessionId={sessionId!}
            overview={ovQ.data}
            channels={channelsQ.data ?? []}
            terminals={terminalsQ.data ?? []}
            writable={writable}
            onSave={(data) =>
              callUpdate({ data: { sessionId: sessionId!, ...data } }).then(() => {
                toast.success("Session gespeichert.");
                void invalidate();
              })
            }
          />

          <SatellitesCard
            sessionId={sessionId!}
            overview={ovQ.data}
            staff={staffQ.data ?? []}
            writable={writable}
            onAdd={(payload) =>
              callAddSat({ data: payload }).then(() => {
                toast.success("Eintrag hinzugefügt.");
                void invalidate();
              })
            }
            onRemove={(args) =>
              callRemoveSat({ data: args }).then(() => {
                toast.success("Eintrag entfernt.");
                void invalidate();
              })
            }
          />

          <TipPoolCard sessionId={sessionId!} hasSettlements={ovQ.data.settlements.length > 0} />

          <Card className="flex flex-wrap gap-3 p-4">
            <Button
              disabled={!writable || finalizeMut.isPending}
              onClick={() => setFinalizeConfirm(true)}
            >
              Tag finalisieren
            </Button>
            {isAdmin && (
              <Button
                variant="destructive"
                disabled={isLocked || lockMut.isPending}
                onClick={() => setLockConfirm(true)}
              >
                Session sperren
              </Button>
            )}
          </Card>
        </>
      )}

      {isAdmin && (
        <Card className="space-y-3 p-4">
          <div className="font-medium">Kasse-Wasserlinie verschieben (nur Admin)</div>
          <p className="text-sm text-muted-foreground">
            Alle Geschäftstage ≤ dem gewählten Datum werden für Kassen-Schreibzugriffe gesperrt. Nur
            vorwärts. Aktueller Stand: {lockedThrough ?? "keine Sperre"}.
          </p>
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1">
              <Label htmlFor="cl">Gesperrt bis (inklusive)</Label>
              <Input
                id="cl"
                type="date"
                min={lockedThrough ?? undefined}
                value={cashLockDate}
                onChange={(e) => setCashLockDate(e.target.value)}
              />
            </div>
            <div className="min-w-[16rem] flex-1 space-y-1">
              <Label htmlFor="clr">Begründung *</Label>
              <Input
                id="clr"
                placeholder="z. B. Monatsabschluss Mai"
                value={cashLockReason}
                onChange={(e) => setCashLockReason(e.target.value)}
              />
            </div>
            <Button
              disabled={
                cashLockDate === "" || cashLockReason.trim().length < 3 || cashLockMut.isPending
              }
              onClick={() => cashLockMut.mutate()}
            >
              {cashLockMut.isPending ? "Wird gespeichert…" : "Wasserlinie setzen"}
            </Button>
          </div>
        </Card>
      )}

      {/* --- PDF-Vorschau --- */}
      <Dialog open={pdfPreview !== null} onOpenChange={(o) => !o && closePdfPreview()}>
        <DialogContent className="flex h-[85vh] max-w-5xl flex-col p-0">
          <DialogHeader className="border-b px-6 py-4">
            <DialogTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              {pdfPreview?.fileName ?? "PDF Vorschau"}
            </DialogTitle>
          </DialogHeader>
          <div className="min-h-0 flex-1 p-2">
            {pdfPreview && (
              <iframe
                title="Tagesabrechnung PDF Vorschau"
                src={pdfPreview.blobUrl}
                className="h-full w-full rounded border"
              />
            )}
          </div>
          <DialogFooter className="gap-2 border-t px-6 py-4">
            <Button variant="outline" onClick={closePdfPreview}>
              <X className="mr-2 h-4 w-4" />
              Schließen
            </Button>
            <Button
              onClick={() => {
                if (!pdfPreview) return;
                const a = document.createElement("a");
                a.href = pdfPreview.blobUrl;
                a.download = pdfPreview.fileName;
                document.body.appendChild(a);
                a.click();
                a.remove();
              }}
            >
              <Download className="mr-2 h-4 w-4" />
              Herunterladen
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* --- Korrektur-Dialog --- */}
      <Dialog open={correct !== null} onOpenChange={(o) => !o && setCorrect(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Abrechnung korrigieren</DialogTitle>
            <DialogDescription>
              {correct?.staffName}. Erzeugt eine neue Settlement-Zeile; das Original wird als
              <code className="mx-1 rounded bg-muted px-1">superseded</code>
              markiert. Trinkgeldsatz wird vom Original übernommen.
            </DialogDescription>
          </DialogHeader>
          {correct && (
            <div className="space-y-3">
              {(
                [
                  ["posSales", "Kassenbon (POS)"],
                  ["cardTotal", "EC-/Kartensumme"],
                  ["hilfMahl", "Hilfsmahlzeiten"],
                  ["openInvoices", "Offene Rechnungen"],
                  ["cashHandedIn", "Abgegebenes Bargeld"],
                ] as const
              ).map(([key, label]) => (
                <div key={key} className="space-y-1">
                  <Label>{label} (€)</Label>
                  <Input
                    inputMode="decimal"
                    value={correct[key]}
                    onChange={(e) => setCorrect({ ...correct, [key]: e.target.value })}
                  />
                </div>
              ))}
              <div className="space-y-1">
                <Label>Begründung *</Label>
                <Input
                  placeholder="z. B. Kellner hat sich um eine Stelle vertippt"
                  value={correct.reason}
                  onChange={(e) => setCorrect({ ...correct, reason: e.target.value })}
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setCorrect(null)}>
              Abbrechen
            </Button>
            <Button
              disabled={!correct || correct.reason.trim().length < 3 || correctMut.isPending}
              onClick={() => correctMut.mutate()}
            >
              {correctMut.isPending ? "Speichert…" : "Korrektur speichern"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* --- Finalize/Lock-Confirms --- */}
      <Dialog open={finalizeConfirm} onOpenChange={setFinalizeConfirm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Tag finalisieren?</DialogTitle>
            <DialogDescription>
              Sperrt das Erfassen weiterer Kellner-Abrechnungen und Satelliten. Korrekturen durch
              Manager bleiben möglich, bis ein Admin die Session sperrt.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFinalizeConfirm(false)}>
              Abbrechen
            </Button>
            <Button
              disabled={finalizeMut.isPending}
              onClick={() =>
                finalizeMut.mutate(undefined, { onSuccess: () => setFinalizeConfirm(false) })
              }
            >
              Finalisieren
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={lockConfirm} onOpenChange={setLockConfirm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Session sperren?</DialogTitle>
            <DialogDescription>
              Unumkehrbar. Korrekturen für diesen Geschäftstag sind danach nicht mehr möglich.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setLockConfirm(false)}>
              Abbrechen
            </Button>
            <Button
              variant="destructive"
              disabled={lockMut.isPending}
              onClick={() => lockMut.mutate(undefined, { onSuccess: () => setLockConfirm(false) })}
            >
              Sperren
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// =========================================================================
// Settlements-Liste
// =========================================================================

type Overview = Awaited<ReturnType<typeof getCashOverview>>;

type SettlementRow = Overview["settlements"][number];

function SettlementsCard({
  data,
  correctable,
  onCorrect,
}: {
  data: Overview;
  correctable: boolean;
  onCorrect: (row: SettlementRow) => void;
}) {
  const rows = data.settlements;
  return (
    <Card>
      <div className="border-b px-4 py-3 text-sm font-medium">Kellner-Abrechnungen</div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Kellner</TableHead>
            <TableHead className="text-right">POS</TableHead>
            <TableHead className="text-right">Karte</TableHead>
            <TableHead className="text-right">Hilf</TableHead>
            <TableHead className="text-right">Offen</TableHead>
            <TableHead className="text-right">Bargeld</TableHead>
            <TableHead className="text-right">Differenz</TableHead>
            <TableHead className="text-right">Tip</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-right">Aktion</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.length === 0 && (
            <TableRow>
              <TableCell colSpan={10} className="text-center text-muted-foreground">
                Noch keine Abrechnungen.
              </TableCell>
            </TableRow>
          )}
          {rows.map((r) => {
            const superseded = r.status === "superseded";
            return (
              <TableRow key={r.id} className={superseded ? "opacity-50" : ""}>
                <TableCell>{r.staffName}</TableCell>
                <TableCell className="text-right font-mono">
                  {fmtCents(Number(r.pos_sales_cents))}
                </TableCell>
                <TableCell className="text-right font-mono">
                  {fmtCents(Number(r.card_total_cents))}
                </TableCell>
                <TableCell className="text-right font-mono">
                  {fmtCents(Number(r.hilf_mahl_cents))}
                </TableCell>
                <TableCell className="text-right font-mono">
                  {fmtCents(Number(r.open_invoices_cents))}
                </TableCell>
                <TableCell className="text-right font-mono">
                  {fmtCents(Number(r.cash_handed_in_cents))}
                </TableCell>
                <TableCell
                  className={`text-right font-mono ${Number(r.differenz_cents) < 0 ? "text-destructive" : ""}`}
                >
                  {fmtCents(Number(r.differenz_cents))}
                </TableCell>
                <TableCell className="text-right font-mono">
                  {fmtCents(Number(r.kitchen_tip_cents))}
                </TableCell>
                <TableCell>
                  <Badge variant={superseded ? "outline" : "default"}>{r.status}</Badge>
                </TableCell>
                <TableCell className="text-right">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={!correctable || superseded}
                    onClick={() => onCorrect(r)}
                  >
                    Korrektur
                  </Button>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </Card>
  );
}

// =========================================================================
// Session-Felder (Kanäle, Terminals, Gutscheine, Sonstiges)
// =========================================================================

type UpdatePayload = {
  channelAmounts: { channelId: string; amountCents: number }[];
  terminalAmounts: { terminalId: string; amountCents: number }[];
  vouchersSoldCents: number;
  vouchersRedeemedCents: number;
  finedineVouchersCents: number;
  opentabsDeductionCents: number;
  vorschussCents: number;
  einladungCents: number;
  sonstigeEinnahmeCents: number;
  vectronDailyTotalCents: number;
  cashActualCents: number | null;
  guestCount: number;
  notes: string | null;
};

function SessionFieldsCard({
  overview,
  channels,
  terminals,
  writable,
  onSave,
}: {
  sessionId: string;
  overview: Overview;
  channels: { id: string; label: string; isActive: boolean }[];
  terminals: { id: string; label: string; isActive: boolean }[];
  writable: boolean;
  onSave: (data: UpdatePayload) => Promise<unknown>;
}) {
  type Row = { id: string; euro: string };
  const initialChannels: Row[] = channels.map((c) => {
    const found = overview.channelAmounts.find((a) => a.channelId === c.id);
    return { id: c.id, euro: ((found?.amountCents ?? 0) / 100).toFixed(2) };
  });
  const initialTerminals: Row[] = terminals.map((t) => {
    const found = overview.terminalAmounts.find((a) => a.terminalId === t.id);
    return { id: t.id, euro: ((found?.amountCents ?? 0) / 100).toFixed(2) };
  });

  const sess = overview.session!;
  type Misc = {
    vouchersSold: string;
    vouchersRedeemed: string;
    finedineVouchers: string;
    opentabs: string;
    vorschuss: string;
    einladung: string;
    sonstige: string;
    vectron: string;
    cashActual: string;
    guestCount: string;
    notes: string;
  };
  const initialMisc: Misc = {
    vouchersSold: (Number(sess.vouchers_sold_cents ?? 0) / 100).toFixed(2),
    vouchersRedeemed: (Number(sess.vouchers_redeemed_cents ?? 0) / 100).toFixed(2),
    finedineVouchers: (Number(sess.finedine_vouchers_cents ?? 0) / 100).toFixed(2),
    opentabs: (Number(sess.opentabs_deduction_cents ?? 0) / 100).toFixed(2),
    vorschuss: (Number(sess.vorschuss_cents ?? 0) / 100).toFixed(2),
    einladung: (Number(sess.einladung_cents ?? 0) / 100).toFixed(2),
    sonstige: (Number(sess.sonstige_einnahme_cents ?? 0) / 100).toFixed(2),
    vectron: (Number(sess.vectron_daily_total_cents ?? 0) / 100).toFixed(2),
    cashActual:
      sess.cash_actual_cents === null || sess.cash_actual_cents === undefined
        ? ""
        : (Number(sess.cash_actual_cents) / 100).toFixed(2),
    guestCount: String((sess as { guest_count?: number | null }).guest_count ?? 0),
    notes: sess.notes ?? "",
  };

  const [chRows, setChRows] = useState<Row[]>(initialChannels);
  const [tmRows, setTmRows] = useState<Row[]>(initialTerminals);
  const [misc, setMisc] = useState<Misc>(initialMisc);
  const [saving, setSaving] = useState(false);

  // Wenn neue Reads kommen, lokale State zurücksetzen.
  useEffect(() => {
    setChRows(initialChannels);
    setTmRows(initialTerminals);
    setMisc(initialMisc);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [overview]);

  function build(): UpdatePayload | null {
    const chAmts: { channelId: string; amountCents: number }[] = [];
    for (const r of chRows) {
      const c = parseEuroToCents(r.euro);
      if (c === null) return null;
      if (c !== 0) chAmts.push({ channelId: r.id, amountCents: c });
    }
    const tmAmts: { terminalId: string; amountCents: number }[] = [];
    for (const r of tmRows) {
      const c = parseEuroToCents(r.euro);
      if (c === null) return null;
      if (c !== 0) tmAmts.push({ terminalId: r.id, amountCents: c });
    }
    const vs = parseEuroToCents(misc.vouchersSold);
    const vr = parseEuroToCents(misc.vouchersRedeemed);
    const fv = parseEuroToCents(misc.finedineVouchers);
    const ot = parseEuroToCents(misc.opentabs);
    const vo = parseEuroToCents(misc.vorschuss);
    const ei = parseEuroToCents(misc.einladung);
    const so = parseEuroToCents(misc.sonstige);
    const ve = parseEuroToCents(misc.vectron);
    const caRaw = misc.cashActual.trim();
    const caParsed = caRaw === "" ? null : parseEuroToCents(caRaw);
    const gcRaw = misc.guestCount.trim();
    const gcParsed = gcRaw === "" ? 0 : Number.parseInt(gcRaw, 10);
    if (
      vs === null ||
      vr === null ||
      fv === null ||
      ot === null ||
      vo === null ||
      ei === null ||
      so === null ||
      ve === null ||
      (caRaw !== "" && caParsed === null) ||
      !Number.isFinite(gcParsed) ||
      gcParsed < 0
    )
      return null;
    return {
      channelAmounts: chAmts,
      terminalAmounts: tmAmts,
      vouchersSoldCents: vs,
      vouchersRedeemedCents: vr,
      finedineVouchersCents: fv,
      opentabsDeductionCents: ot,
      vorschussCents: vo,
      einladungCents: ei,
      sonstigeEinnahmeCents: so,
      vectronDailyTotalCents: ve,
      cashActualCents: caParsed,
      guestCount: gcParsed,
      notes: misc.notes.trim() === "" ? null : misc.notes,
    };
  }

  async function handleSave() {
    const payload = build();
    if (!payload) {
      toast.error("Bitte alle Beträge als Euro eingeben.");
      return;
    }
    setSaving(true);
    try {
      await onSave(payload);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  const channelById = Object.fromEntries(channels.map((c) => [c.id, c]));
  const terminalById = Object.fromEntries(terminals.map((t) => [t.id, t]));

  return (
    <Card className="space-y-4 p-4">
      <div className="text-sm font-medium">Session-Felder</div>

      <Section title="Gäste & Gutscheine">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="space-y-1">
            <Label htmlFor="sess-guest-count">Gästezahl</Label>
            <Input
              id="sess-guest-count"
              type="number"
              min={0}
              step={1}
              inputMode="numeric"
              disabled={!writable}
              value={misc.guestCount}
              onChange={(e) => setMisc({ ...misc, guestCount: e.target.value })}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="sess-vouchers-sold">Gutscheine verkauft (€)</Label>
            <Input
              id="sess-vouchers-sold"
              inputMode="decimal"
              disabled={!writable}
              value={misc.vouchersSold}
              onChange={(e) => setMisc({ ...misc, vouchersSold: e.target.value })}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="sess-vouchers-redeemed">Gutscheine eingelöst (€)</Label>
            <Input
              id="sess-vouchers-redeemed"
              inputMode="decimal"
              disabled={!writable}
              value={misc.vouchersRedeemed}
              onChange={(e) => setMisc({ ...misc, vouchersRedeemed: e.target.value })}
            />
          </div>
        </div>
      </Section>

      <Section title="Kanäle">
        {chRows.length === 0 && (
          <p className="text-xs text-muted-foreground">Keine Kanäle konfiguriert.</p>
        )}
        {chRows.map((r, idx) => (
          <EuroRow
            key={r.id}
            label={`${channelById[r.id]?.label ?? r.id}${channelById[r.id]?.isActive === false ? " (inaktiv)" : ""}`}
            value={r.euro}
            disabled={!writable}
            onChange={(v) => {
              const next = [...chRows];
              next[idx] = { ...r, euro: v };
              setChRows(next);
            }}
          />
        ))}
      </Section>

      <Section title="Terminals">
        {tmRows.length === 0 && (
          <p className="text-xs text-muted-foreground">Keine Terminals konfiguriert.</p>
        )}
        {tmRows.map((r, idx) => (
          <EuroRow
            key={r.id}
            label={`${terminalById[r.id]?.label ?? r.id}${terminalById[r.id]?.isActive === false ? " (inaktiv)" : ""}`}
            value={r.euro}
            disabled={!writable}
            onChange={(v) => {
              const next = [...tmRows];
              next[idx] = { ...r, euro: v };
              setTmRows(next);
            }}
          />
        ))}
      </Section>

      <Section title="Sonstiges">
        <EuroRow
          label="Finedine-Gutscheine"
          value={misc.finedineVouchers}
          disabled={!writable}
          onChange={(v) => setMisc({ ...misc, finedineVouchers: v })}
        />
        {/* "Open Tabs (Abzug)" UI ausgeblendet; Wert wird weiterhin als 0 an updateSession übergeben. */}
        <EuroRow
          label="Vorschuss (Abzug)"
          value={misc.vorschuss}
          disabled={!writable}
          onChange={(v) => setMisc({ ...misc, vorschuss: v })}
        />
        <EuroRow
          label="Einladung (Abzug)"
          value={misc.einladung}
          disabled={!writable}
          onChange={(v) => setMisc({ ...misc, einladung: v })}
        />
        <EuroRow
          label="Sonstige Einnahme"
          value={misc.sonstige}
          disabled={!writable}
          onChange={(v) => setMisc({ ...misc, sonstige: v })}
        />
        <div className="space-y-1">
          <Label>Notiz</Label>
          <Textarea
            disabled={!writable}
            value={misc.notes}
            onChange={(e) => setMisc({ ...misc, notes: e.target.value })}
            rows={2}
            maxLength={2000}
          />
        </div>
      </Section>

      <Section title="Kontrolle">
        <EuroRow
          label="Vectron Tagesumsatz (Kontrolle)"
          value={misc.vectron}
          disabled={!writable}
          onChange={(v) => setMisc({ ...misc, vectron: v })}
        />
        <EuroRow
          label="Kassenbestand nach Abschluss"
          value={misc.cashActual}
          disabled={!writable}
          onChange={(v) => setMisc({ ...misc, cashActual: v })}
        />
        <CashActualHint value={misc.cashActual} />
      </Section>

      <div className="flex justify-end">
        <Button disabled={!writable || saving} onClick={handleSave}>
          {saving ? "Speichert…" : "Session speichern"}
        </Button>
      </div>
      {!writable && (
        <p className="text-xs text-muted-foreground">
          Schreibgeschützt (Session ist {sess.status}
          {sess.status !== "locked" && overview.cashLockedThroughDate
            ? ` und/oder unter Wasserlinie ≤ ${overview.cashLockedThroughDate}`
            : ""}
          ).
        </p>
      )}
    </Card>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2 rounded-md border border-border/60 p-3">
      <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {title}
      </div>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

const CASH_TARGET_CENTS = 200_000; // 2.000 € — UI-Hinweis (Quelle ist organizations.cash_balance_target_cents)

function CashActualHint({ value }: { value: string }) {
  const trimmed = value.trim();
  if (trimmed === "") {
    return (
      <p className="pl-1 text-xs text-muted-foreground">
        Soll: {fmtCents(CASH_TARGET_CENTS)} € — Kassenbestand noch nicht erfasst.
      </p>
    );
  }
  const cents = parseEuroToCents(trimmed);
  if (cents === null) {
    return <p className="pl-1 text-xs text-destructive">Bitte gültigen Eurobetrag eintragen.</p>;
  }
  const diff = cents - CASH_TARGET_CENTS;
  if (diff === 0) {
    return (
      <p className="pl-1 text-xs text-emerald-600">
        Soll: {fmtCents(CASH_TARGET_CENTS)} € — Kassenbestand stimmt ✓
      </p>
    );
  }
  if (diff > 0) {
    return (
      <p className="pl-1 text-xs text-emerald-600">
        Soll: {fmtCents(CASH_TARGET_CENTS)} € — Entnahme in Tresor: {fmtCents(diff)} €
      </p>
    );
  }
  return (
    <p className="pl-1 text-xs text-destructive">
      Soll: {fmtCents(CASH_TARGET_CENTS)} € — Fehlbetrag: {fmtCents(-diff)} €
    </p>
  );
}

function EuroRow({
  label,
  value,
  onChange,
  disabled,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-center gap-3">
      <Label className="min-w-[14rem] flex-1 text-sm">{label}</Label>
      <Input
        className="w-32 text-right font-mono"
        inputMode="decimal"
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
      />
      <span className="text-sm text-muted-foreground">€</span>
    </div>
  );
}

// =========================================================================
// Satelliten (Add + Liste + Remove)
// =========================================================================

type SatKind = "expense" | "advance" | "card_transaction" | "bank_deposit" | "register_transfer";

function SatellitesCard({
  sessionId,
  overview,
  staff,
  writable,
  onAdd,
  onRemove,
}: {
  sessionId: string;
  overview: Overview;
  staff: { id: string; displayName: string }[];
  writable: boolean;
  onAdd: (
    payload:
      | { sessionId: string; kind: "expense"; description: string; amountCents: number }
      | {
          sessionId: string;
          kind: "advance";
          staffId: string;
          amountCents: number;
          note: string | null;
        }
      | {
          sessionId: string;
          kind: "card_transaction";
          amountCents: number;
          note: string | null;
        }
      | {
          sessionId: string;
          kind: "bank_deposit";
          amountCents: number;
          reference: string | null;
        }
      | {
          sessionId: string;
          kind: "register_transfer";
          direction: "to_restaurant" | "from_restaurant";
          amountCents: number;
          note: string | null;
        },
  ) => Promise<unknown>;
  onRemove: (args: { sessionId: string; kind: SatKind; id: string }) => Promise<unknown>;
}) {
  const staffName = (id: string) => staff.find((s) => s.id === id)?.displayName ?? id.slice(0, 8);

  return (
    <Card className="space-y-4 p-4">
      <div className="text-sm font-medium">Satelliten</div>

      <SatList
        title="Ausgaben"
        items={overview.expenses.map((e) => ({
          id: e.id,
          left: e.description ?? "—",
          cents: e.amountCents,
        }))}
        writable={writable}
        onRemove={(id) => onRemove({ sessionId, kind: "expense", id })}
      />
      <ExpenseForm
        writable={writable}
        onAdd={(description, cents) =>
          onAdd({ sessionId, kind: "expense", description, amountCents: cents })
        }
      />

      <SatList
        title="Vorschüsse"
        items={overview.advances.map((a) => ({
          id: a.id,
          left: `${staffName(a.staffId)}${a.note ? ` · ${a.note}` : ""}`,
          cents: a.amountCents,
        }))}
        writable={writable}
        onRemove={(id) => onRemove({ sessionId, kind: "advance", id })}
      />
      <AdvanceForm
        writable={writable}
        staff={staff}
        onAdd={(staffId, cents, note) =>
          onAdd({ sessionId, kind: "advance", staffId, amountCents: cents, note })
        }
      />

      <SatList
        title="Kartenumsätze"
        items={overview.cardTransactions.map((c) => ({
          id: c.id,
          left: c.note ?? "—",
          cents: c.amountCents,
        }))}
        writable={writable}
        onRemove={(id) => onRemove({ sessionId, kind: "card_transaction", id })}
      />
      <NoteAmountForm
        placeholder="Notiz (optional)"
        writable={writable}
        onAdd={(note, cents) =>
          onAdd({ sessionId, kind: "card_transaction", amountCents: cents, note })
        }
      />

      <SatList
        title="Einzahlungen Bank"
        items={overview.bankDeposits.map((b) => ({
          id: b.id,
          left: b.reference ?? "—",
          cents: b.amountCents,
        }))}
        writable={writable}
        onRemove={(id) => onRemove({ sessionId, kind: "bank_deposit", id })}
      />
      <NoteAmountForm
        placeholder="Referenz (optional)"
        writable={writable}
        onAdd={(reference, cents) =>
          onAdd({ sessionId, kind: "bank_deposit", amountCents: cents, reference })
        }
      />

      <SatList
        title="Transfers Kasse ↔ Restaurant"
        items={overview.registerTransfers.map((t) => ({
          id: t.id,
          left: `${t.direction === "to_restaurant" ? "→ Restaurant" : "← Restaurant"}${t.note ? ` · ${t.note}` : ""}`,
          cents: t.amountCents,
        }))}
        writable={writable}
        onRemove={(id) => onRemove({ sessionId, kind: "register_transfer", id })}
      />
      <TransferForm
        writable={writable}
        onAdd={(direction, cents, note) =>
          onAdd({ sessionId, kind: "register_transfer", direction, amountCents: cents, note })
        }
      />
    </Card>
  );
}

function SatList({
  title,
  items,
  writable,
  onRemove,
}: {
  title: string;
  items: { id: string; left: string; cents: number }[];
  writable: boolean;
  onRemove: (id: string) => Promise<unknown>;
}) {
  return (
    <Section title={title}>
      {items.length === 0 ? (
        <p className="text-xs text-muted-foreground">Keine Einträge.</p>
      ) : (
        <ul className="space-y-1 text-sm">
          {items.map((it) => (
            <li key={it.id} className="flex items-center justify-between gap-2">
              <span className="flex-1 truncate">{it.left}</span>
              <span className="font-mono tabular-nums">{fmtCents(it.cents)} €</span>
              <Button
                size="sm"
                variant="ghost"
                disabled={!writable}
                onClick={() => void onRemove(it.id)}
              >
                Löschen
              </Button>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

function ExpenseForm({
  writable,
  onAdd,
}: {
  writable: boolean;
  onAdd: (description: string, cents: number) => Promise<unknown>;
}) {
  const [desc, setDesc] = useState("");
  const [amount, setAmount] = useState("");
  const [pending, setPending] = useState(false);
  const cents = parseEuroToCents(amount);
  return (
    <div className="flex flex-wrap items-end gap-2">
      <Input
        className="min-w-[12rem] flex-1"
        placeholder="Beschreibung"
        value={desc}
        onChange={(e) => setDesc(e.target.value)}
        disabled={!writable}
      />
      <Input
        className="w-28 text-right font-mono"
        inputMode="decimal"
        placeholder="€"
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
        disabled={!writable}
      />
      <Button
        size="sm"
        disabled={!writable || desc.trim() === "" || cents === null || cents <= 0 || pending}
        onClick={async () => {
          setPending(true);
          try {
            await onAdd(desc.trim(), cents!);
            setDesc("");
            setAmount("");
          } finally {
            setPending(false);
          }
        }}
      >
        Ausgabe hinzufügen
      </Button>
    </div>
  );
}

function AdvanceForm({
  writable,
  staff,
  onAdd,
}: {
  writable: boolean;
  staff: { id: string; displayName: string }[];
  onAdd: (staffId: string, cents: number, note: string | null) => Promise<unknown>;
}) {
  const [staffId, setStaffId] = useState<string>(staff[0]?.id ?? "");
  useEffect(() => {
    if (!staffId && staff[0]) setStaffId(staff[0].id);
  }, [staff, staffId]);
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [pending, setPending] = useState(false);
  const cents = parseEuroToCents(amount);
  return (
    <div className="flex flex-wrap items-end gap-2">
      <select
        className="min-w-[10rem] rounded-md border border-input bg-background px-3 py-2 text-sm disabled:opacity-50"
        value={staffId}
        onChange={(e) => setStaffId(e.target.value)}
        disabled={!writable}
      >
        {staff.map((s) => (
          <option key={s.id} value={s.id}>
            {s.displayName}
          </option>
        ))}
      </select>
      <Input
        className="min-w-[10rem] flex-1"
        placeholder="Notiz (optional)"
        value={note}
        onChange={(e) => setNote(e.target.value)}
        disabled={!writable}
      />
      <Input
        className="w-28 text-right font-mono"
        inputMode="decimal"
        placeholder="€"
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
        disabled={!writable}
      />
      <Button
        size="sm"
        disabled={!writable || !staffId || cents === null || cents <= 0 || pending}
        onClick={async () => {
          setPending(true);
          try {
            await onAdd(staffId, cents!, note.trim() === "" ? null : note.trim());
            setAmount("");
            setNote("");
          } finally {
            setPending(false);
          }
        }}
      >
        Vorschuss hinzufügen
      </Button>
    </div>
  );
}

function NoteAmountForm({
  writable,
  placeholder,
  onAdd,
}: {
  writable: boolean;
  placeholder: string;
  onAdd: (note: string | null, cents: number) => Promise<unknown>;
}) {
  const [note, setNote] = useState("");
  const [amount, setAmount] = useState("");
  const [pending, setPending] = useState(false);
  const cents = parseEuroToCents(amount);
  return (
    <div className="flex flex-wrap items-end gap-2">
      <Input
        className="min-w-[12rem] flex-1"
        placeholder={placeholder}
        value={note}
        onChange={(e) => setNote(e.target.value)}
        disabled={!writable}
      />
      <Input
        className="w-28 text-right font-mono"
        inputMode="decimal"
        placeholder="€"
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
        disabled={!writable}
      />
      <Button
        size="sm"
        disabled={!writable || cents === null || cents <= 0 || pending}
        onClick={async () => {
          setPending(true);
          try {
            await onAdd(note.trim() === "" ? null : note.trim(), cents!);
            setAmount("");
            setNote("");
          } finally {
            setPending(false);
          }
        }}
      >
        Hinzufügen
      </Button>
    </div>
  );
}

function TransferForm({
  writable,
  onAdd,
}: {
  writable: boolean;
  onAdd: (
    direction: "to_restaurant" | "from_restaurant",
    cents: number,
    note: string | null,
  ) => Promise<unknown>;
}) {
  const [direction, setDirection] = useState<"to_restaurant" | "from_restaurant">("to_restaurant");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [pending, setPending] = useState(false);
  const cents = parseEuroToCents(amount);
  return (
    <div className="flex flex-wrap items-end gap-2">
      <select
        className="rounded-md border border-input bg-background px-3 py-2 text-sm disabled:opacity-50"
        value={direction}
        onChange={(e) => setDirection(e.target.value as "to_restaurant" | "from_restaurant")}
        disabled={!writable}
      >
        <option value="to_restaurant">→ Restaurant</option>
        <option value="from_restaurant">← Restaurant</option>
      </select>
      <Input
        className="min-w-[10rem] flex-1"
        placeholder="Notiz (optional)"
        value={note}
        onChange={(e) => setNote(e.target.value)}
        disabled={!writable}
      />
      <Input
        className="w-28 text-right font-mono"
        inputMode="decimal"
        placeholder="€"
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
        disabled={!writable}
      />
      <Button
        size="sm"
        disabled={!writable || cents === null || cents <= 0 || pending}
        onClick={async () => {
          setPending(true);
          try {
            await onAdd(direction, cents!, note.trim() === "" ? null : note.trim());
            setAmount("");
            setNote("");
          } finally {
            setPending(false);
          }
        }}
      >
        Transfer hinzufügen
      </Button>
    </div>
  );
}

// fmtTime ist exportiert für künftige Verwendung — TS würde sonst meckern.
void fmtTime;

// =========================================================================
// B4 — Trinkgeld-Pool
// =========================================================================

function TipPoolCard({
  sessionId,
  hasSettlements,
}: {
  sessionId: string;
  hasSettlements: boolean;
}) {
  const fetchPool = useServerFn(getTipPoolOverview);
  const poolQ = useQuery({
    queryKey: ["cash", "tip-pool", sessionId],
    queryFn: () => fetchPool({ data: { sessionId } }),
    enabled: hasSettlements,
  });

  if (!hasSettlements) return null;
  if (poolQ.isLoading) {
    return <Card className="p-4 text-sm text-muted-foreground">Lade Trinkgeld-Pool…</Card>;
  }
  if (poolQ.error || !poolQ.data) {
    return (
      <Card className="p-4 text-sm text-destructive">
        Trinkgeld-Pool konnte nicht geladen werden.
      </Card>
    );
  }
  const data = poolQ.data;
  const kitchen = data.shares.filter((s) => s.department === "kitchen");
  const service = data.shares.filter((s) => s.department === "service");

  const renderTable = (
    title: string,
    rows: typeof data.shares,
    poolCents: number,
    remainder: number,
  ) => (
    <Card className="flex-1">
      <div className="border-b px-4 py-3 text-sm font-medium">{title}</div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Mitarbeiter</TableHead>
            <TableHead>Abt.</TableHead>
            <TableHead className="text-right">Stunden</TableHead>
            <TableHead className="text-right">Anteil</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.length === 0 && (
            <TableRow>
              <TableCell colSpan={4} className="text-center text-muted-foreground">
                Keine teilnehmenden Mitarbeiter.
              </TableCell>
            </TableRow>
          )}
          {rows.map((r) => (
            <TableRow key={r.staffId}>
              <TableCell>{data.staffNames[r.staffId] ?? r.staffId}</TableCell>
              <TableCell>{r.department}</TableCell>
              <TableCell className="text-right font-mono">
                {r.hoursWorked.toFixed(2).replace(".", ",")}
              </TableCell>
              <TableCell className="text-right font-mono">{fmtCents(r.shareCents)}</TableCell>
            </TableRow>
          ))}
          <TableRow className="border-t font-medium">
            <TableCell colSpan={2}>Pool gesamt</TableCell>
            <TableCell className="text-right font-mono">{fmtCents(poolCents)}</TableCell>
            <TableCell className="text-right font-mono text-muted-foreground">
              Rest: {fmtCents(remainder)}
            </TableCell>
          </TableRow>
        </TableBody>
      </Table>
    </Card>
  );

  return (
    <div className="space-y-2">
      <div className="text-sm font-medium">Trinkgeld-Pool</div>
      <div className="flex flex-col gap-4 md:flex-row">
        {renderTable("Küchen-Pool", kitchen, data.kitchenPoolCents, data.kitchenRemainder)}
        {renderTable("Service-Pool", service, data.servicePoolCents, data.serviceRemainder)}
      </div>
    </div>
  );
}
