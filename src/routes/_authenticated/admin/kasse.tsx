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
import { todayIso } from "@/lib/format";
import { KassePageSkeleton } from "@/components/ui/page-skeletons";
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
import { listStaff } from "@/lib/admin/staff.functions";
import { listLocations } from "@/lib/admin/locations.functions";
import {
  addSessionSatellite,
  adminCreateWaiterSettlement,
  correctWaiterSettlement,
  finalizeSession,
  getCashOverview,
  getPreviousOperativeDeficit,
  getOrCreateOpenSession,
  listPaymentTerminals,
  listRevenueChannels,
  lockSession,
  removeSessionSatellite,
  reopenSession,
  setCashLock,
  updateSession,
} from "@/lib/cash/cash.functions";
import { generateDailySummaryPdf } from "@/lib/cash/pdfExport";
import { DateSelector } from "@/components/shared/DateSelector";
import { LocationPills } from "@/components/shared/LocationPills";
import { PdfCanvasPreview } from "@/components/cash/PdfCanvasPreview";
import { parseEuroToCents } from "@/lib/cash/kasse-helpers";
import { SettlementWarningsBanner } from "@/components/cash/SettlementWarningsBanner";
import { SettlementsCard } from "@/components/cash/SettlementsCard";
import { SessionFieldsCard } from "@/components/cash/SessionFieldsCard";
import { TipPoolCard } from "@/components/cash/TipPoolCard";
import { computeTipTotalCents } from "@/lib/cash/tip-pool";
import { fmtCents } from "@/lib/format";
import type jsPDF from "jspdf";

export const Route = createFileRoute("/_authenticated/admin/kasse")({
  head: () => ({ meta: [{ title: "Tagesabrechnung" }] }),
  validateSearch: (search: Record<string, unknown>) => ({
    locationId: typeof search.locationId === "string" ? search.locationId : undefined,
    businessDate: typeof search.businessDate === "string" ? search.businessDate : undefined,
  }),
  component: KassePage,
});

type CorrectState = {
  originalId: string;
  staffName: string;
  partnerStaffId: string;
  posSales: string;
  kassiertBrutto: string;
  cardTotal: string;
  hilfMahl: string;
  openInvoices: string;
  cashHandedIn: string;
  reason: string;
};

type CreateState = {
  staffId: string;
  partnerStaffId: string;
  posSales: string;
  kassiertBrutto: string;
  cardTotal: string;
  hilfMahl: string;
  openInvoices: string;
  cashHandedIn: string;
  reason: string;
};

function KassePage() {
  const { identity } = Route.useRouteContext();
  const search = Route.useSearch();
  const isAdmin = identity.role === "admin";
  const qc = useQueryClient();

  const [businessDate, setBusinessDate] = useState<string>(search.businessDate ?? todayIso());
  const [locationId, setLocationId] = useState<string>(search.locationId ?? "");

  const fetchOverview = useServerFn(getCashOverview);
  const fetchPrevDeficit = useServerFn(getPreviousOperativeDeficit);
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
  const callReopen = useServerFn(reopenSession);
  const callCorrect = useServerFn(correctWaiterSettlement);
  const callAdminCreate = useServerFn(adminCreateWaiterSettlement);
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
  const prevDeficitQ = useQuery({
    queryKey: ["cash", "prev-deficit", businessDate, locationId],
    queryFn: () => fetchPrevDeficit({ data: { businessDate, locationId } }),
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
  const writable = sessionStatus === "open" && !underWaterline;
  const correctable =
    (sessionStatus === "open" || sessionStatus === "finalized") && !underWaterline;

  const currentLocation = (locationsQ.data ?? []).find((l) => l.id === locationId);
  const cashBalanceTargetResolvedCents = Number(
    currentLocation?.cashBalanceTargetResolvedCents ?? 200_000,
  );
  const previousDeficitCents = prevDeficitQ.data?.deficitCents ?? 0;
  const previousDeficitSourceDate = prevDeficitQ.data?.sourceDate ?? null;

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
      if (correct.kassiertBrutto.trim().startsWith("-")) {
        throw new Error("Der abzugebende Betrag darf nicht negativ sein.");
      }
      const pos = parseEuroToCents(correct.posSales);
      // „Abzugebender Betrag" optional: leeres Feld → Fallback auf Leistung (POS).
      const kassiert =
        correct.kassiertBrutto.trim() === "" ? pos : parseEuroToCents(correct.kassiertBrutto);
      const card = parseEuroToCents(correct.cardTotal);
      const hilf = parseEuroToCents(correct.hilfMahl);
      const open = parseEuroToCents(correct.openInvoices);
      const cash = parseEuroToCents(correct.cashHandedIn);
      if (
        pos === null ||
        kassiert === null ||
        card === null ||
        hilf === null ||
        open === null ||
        cash === null
      ) {
        throw new Error("Bitte gültige Eurobeträge eintragen.");
      }
      return callCorrect({
        data: {
          originalId: correct.originalId,
          posSalesCents: pos,
          kassiertBruttoCents: kassiert,
          cardTotalCents: card,
          hilfMahlCents: hilf,
          openInvoicesCents: open,
          cashHandedInCents: cash,
          partnerStaffIds: correct.partnerStaffId ? [correct.partnerStaffId] : [],
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

  // -------------------- Manuelle Neuanlage --------------------
  const [createSettlement, setCreateSettlement] = useState<CreateState | null>(null);
  const eligibleStaff = (staffQ.data ?? []).filter(
    (s) => s.isActive && (locationId === "" || s.locationIds.includes(locationId)),
  );
  const createSettlementMut = useMutation({
    mutationFn: () => {
      if (!createSettlement) throw new Error("invalid state");
      if (!sessionId) throw new Error("Keine Session");
      if (!createSettlement.staffId) throw new Error("Bitte einen Kellner wählen.");
      if (createSettlement.kassiertBrutto.trim().startsWith("-")) {
        throw new Error("Der abzugebende Betrag darf nicht negativ sein.");
      }
      const pos = parseEuroToCents(createSettlement.posSales);
      // „Abzugebender Betrag" optional: leeres Feld → Fallback auf Leistung (POS).
      const kassiert =
        createSettlement.kassiertBrutto.trim() === ""
          ? pos
          : parseEuroToCents(createSettlement.kassiertBrutto);
      const card = parseEuroToCents(createSettlement.cardTotal);
      const hilf = parseEuroToCents(createSettlement.hilfMahl);
      const open = parseEuroToCents(createSettlement.openInvoices);
      const cash = parseEuroToCents(createSettlement.cashHandedIn);
      if (
        pos === null ||
        kassiert === null ||
        card === null ||
        hilf === null ||
        open === null ||
        cash === null
      ) {
        throw new Error("Bitte gültige Eurobeträge eintragen.");
      }
      return callAdminCreate({
        data: {
          sessionId,
          staffId: createSettlement.staffId,
          partnerStaffIds: createSettlement.partnerStaffId ? [createSettlement.partnerStaffId] : [],
          posSalesCents: pos,
          kassiertBruttoCents: kassiert,
          cardTotalCents: card,
          hilfMahlCents: hilf,
          openInvoicesCents: open,
          cashHandedInCents: cash,
          reason: createSettlement.reason,
        },
      });
    },
    onSuccess: () => {
      toast.success("Abrechnung angelegt.");
      setCreateSettlement(null);
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

  const reopenMut = useMutation({
    mutationFn: () => {
      if (!sessionId) throw new Error("Keine Session");
      return callReopen({ data: { sessionId } });
    },
    onSuccess: () => {
      toast.success("Session wieder geöffnet.");
      void invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const [reopenConfirm, setReopenConfirm] = useState(false);

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
    doc: jsPDF;
    blob: Blob;
    fileName: string;
  } | null>(null);
  async function handleExportPdf() {
    const ov = ovQ.data;
    if (!ov?.session) {
      toast.error("Keine Session für diesen Tag.");
      return;
    }
    if ((ov.session.guest_count ?? 0) <= 0) {
      toast.error("Bitte zuerst die Gästeanzahl eintragen und speichern.");
      return;
    }
    const channels = (channelsQ.data ?? []).map((c) => ({
      id: c.id,
      label: c.label,
      kind: c.kind,
    }));
    const terminals = (terminalsQ.data ?? []).map((t) => ({
      id: t.id,
      label: t.label,
      isGl: t.isGl,
    }));
    const staffById = new Map((staffQ.data ?? []).map((s) => [s.id, s.displayName]));
    const locationName =
      (locationsQ.data ?? []).find((l) => l.id === locationId)?.name ?? undefined;
    try {
      const out = await generateDailySummaryPdf({
        session: {
          business_date: ov.session.business_date,
          guest_count: ov.session.guest_count,
          cash_actual_cents: ov.session.cash_actual_cents,
          notes: ov.session.notes,
          vectron_daily_total_cents: ov.session.vectron_daily_total_cents,
          vouchers_sold_cents: ov.session.vouchers_sold_cents,
          vouchers_redeemed_cents: ov.session.vouchers_redeemed_cents,
          finedine_vouchers_cents: ov.session.finedine_vouchers_cents,
          einladung_cents: ov.session.einladung_cents,
          sonstige_einnahme_cents: ov.session.sonstige_einnahme_cents,
          vorschuss_cents: ov.session.vorschuss_cents,
        },
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
          submitted_at: s.submitted_at,
          updated_at: (s as { updated_at?: string | null }).updated_at ?? null,
          corrected_from_id: s.corrected_from_id,
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
        cashBalanceTargetCents: cashBalanceTargetResolvedCents,
        previousDeficitCents,
        previousDeficitSourceDate,
      });
      setPdfPreview(out);
    } catch (e) {
      toast.error((e as Error).message);
    }
  }
  function closePdfPreview() {
    setPdfPreview(null);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end gap-4">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Tagesabrechnung</h1>
        <div className="flex items-end gap-3">
          <div className="space-y-1">
            <Label htmlFor="loc">Standort</Label>
            <div id="loc" className="flex h-9 items-center">
              <LocationPills
                locations={locationsQ.data ?? []}
                value={locationId}
                onChange={setLocationId}
              />
            </div>
          </div>
          <div className="space-y-1 text-center">
            <Label htmlFor="bd" className="block text-center">
              Geschäftstag
            </Label>
            <DateSelector date={businessDate} onDateChange={setBusinessDate} />
          </div>
          {underWaterline && <Badge variant="destructive">≤ {lockedThrough} gesperrt</Badge>}
          {ovQ.data?.session && (
            <Button
              variant="outline"
              onClick={handleExportPdf}
              className="gap-2"
              title={
                (ovQ.data.session.guest_count ?? 0) <= 0
                  ? "Gästeanzahl fehlt – bitte zuerst eintragen und speichern"
                  : undefined
              }
            >
              <Download className="h-4 w-4" />
              PDF Export
            </Button>
          )}
        </div>
      </div>

      {ovQ.isLoading && <KassePageSkeleton />}

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
          <SettlementWarningsBanner
            overview={ovQ.data}
            channels={channelsQ.data ?? []}
            terminals={terminalsQ.data ?? []}
          />

          <SettlementsCard
            data={ovQ.data}
            correctable={correctable}
            onCreate={() =>
              setCreateSettlement({
                staffId:
                  (staffQ.data ?? []).find((s) => s.isActive && s.locationIds.includes(locationId))
                    ?.id ?? "",
                partnerStaffId: "",
                posSales: "0.00",
                kassiertBrutto: "0.00",
                cardTotal: "0.00",
                hilfMahl: "0.00",
                openInvoices: "0.00",
                cashHandedIn: "0.00",
                reason: "",
              })
            }
            onCorrect={(row) =>
              setCorrect({
                originalId: row.id,
                staffName: row.staffName,
                partnerStaffId:
                  ((row as { partnerStaffIds?: string[] }).partnerStaffIds ?? [])[0] ??
                  row.partner_staff_id ??
                  "",
                posSales: (Number(row.pos_sales_cents) / 100).toFixed(2),
                kassiertBrutto: (
                  Number(
                    (row as { kassiert_brutto_cents?: number | string | null })
                      .kassiert_brutto_cents ?? row.pos_sales_cents,
                  ) / 100
                ).toFixed(2),
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
            cashBalanceTargetCents={cashBalanceTargetResolvedCents}
            kpiSlot={(() => {
              const sess = ovQ.data.session;
              if (!sess) return null;
              const vectronTotal = Number(sess.vectron_daily_total_cents ?? 0);
              const channelKindById = new Map(
                (channelsQ.data ?? []).map((c) => [c.id, c.kind] as const),
              );
              const deliveryVectron = (ovQ.data.channelAmounts ?? []).reduce(
                (s, c) =>
                  channelKindById.get(c.channelId) === "delivery_vectron" ? s + c.amountCents : s,
                0,
              );
              const inHouseCents = Math.max(0, vectronTotal - deliveryVectron);
              const tipCents = computeTipTotalCents(
                ovQ.data.settlements.map((s) => ({
                  cardTotalCents: Number(s.card_total_cents),
                  cashHandedInCents: Number(s.cash_handed_in_cents),
                  posSalesCents: Number(s.pos_sales_cents),
                  kassiertBruttoCents: Number(
                    (s as { kassiert_brutto_cents?: number | string | null })
                      .kassiert_brutto_cents ?? s.pos_sales_cents,
                  ),
                  openInvoicesCents: Number(s.open_invoices_cents),
                  hilfMahlCents: Number(s.hilf_mahl_cents),
                })),
              );
              const tipPct =
                inHouseCents > 0
                  ? ((tipCents / inHouseCents) * 100).toFixed(1).replace(".", ",")
                  : null;
              const guests = sess.guest_count ?? 0;
              const perGuestCents =
                guests > 0 && inHouseCents > 0 ? Math.round(inHouseCents / guests) : null;
              return (
                <div className="space-y-3">
                  <Card className="p-4">
                    <div className="text-xs uppercase tracking-wide text-muted-foreground">
                      Trinkgeld-Quote
                    </div>
                    <div className="mt-1 font-mono text-2xl font-semibold">
                      {tipPct == null ? "–" : `${tipPct} %`}
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      Pool {fmtCents(tipCents)} / In-House-Umsatz {fmtCents(inHouseCents)}
                    </div>
                  </Card>
                  <Card className="p-4">
                    <div className="text-xs uppercase tracking-wide text-muted-foreground">
                      Ø Umsatz / Gast
                    </div>
                    <div className="mt-1 font-mono text-2xl font-semibold">
                      {perGuestCents == null ? "–" : fmtCents(perGuestCents)}
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      {guests > 0 ? `${guests} Gäste` : "Gästeanzahl fehlt"}
                    </div>
                  </Card>
                </div>
              );
            })()}
            onSave={(data) =>
              callUpdate({ data: { sessionId: sessionId!, ...data } }).then(() => {
                toast.success("Session gespeichert.");
                void invalidate();
              })
            }
            expenses={ovQ.data?.expenses ?? []}
            advances={ovQ.data?.advances ?? []}
            staff={staffQ.data ?? []}
            onAddExpense={(desc, cents) =>
              callAddSat({
                data: {
                  sessionId: sessionId!,
                  kind: "expense",
                  description: desc,
                  amountCents: cents,
                },
              }).then(() => {
                toast.success("Ausgabe hinzugefügt.");
                void invalidate();
              })
            }
            onRemoveExpense={(id) =>
              callRemoveSat({ data: { sessionId: sessionId!, kind: "expense", id } }).then(() => {
                toast.success("Entfernt.");
                void invalidate();
              })
            }
            onAddAdvance={(staffId, cents, note) =>
              callAddSat({
                data: {
                  sessionId: sessionId!,
                  kind: "advance",
                  staffId,
                  amountCents: cents,
                  note,
                },
              }).then(() => {
                toast.success("Vorschuss hinzugefügt.");
                void invalidate();
              })
            }
            onRemoveAdvance={(id) =>
              callRemoveSat({ data: { sessionId: sessionId!, kind: "advance", id } }).then(() => {
                toast.success("Entfernt.");
                void invalidate();
              })
            }
            previousDeficitCents={previousDeficitCents}
            previousDeficitSourceDate={previousDeficitSourceDate}
          />

          <TipPoolCard
            sessionId={sessionId!}
            locationId={locationId}
            hasSettlements={ovQ.data.settlements.length > 0}
            editable={correctable}
            staffList={staffQ.data ?? []}
          />

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
            {isAdmin && sessionStatus === "finalized" && !underWaterline && (
              <Button
                variant="outline"
                disabled={reopenMut.isPending}
                onClick={() => setReopenConfirm(true)}
              >
                Session wieder öffnen
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
            {pdfPreview && <PdfCanvasPreview blob={pdfPreview.blob} />}
          </div>
          <DialogFooter className="gap-2 border-t px-6 py-4">
            <Button variant="outline" onClick={closePdfPreview}>
              <X className="mr-2 h-4 w-4" />
              Schließen
            </Button>
            <Button
              onClick={() => {
                if (!pdfPreview) return;
                pdfPreview.doc.save(pdfPreview.fileName);
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
              <div className="space-y-1">
                <Label>Partner-Kellner (optional)</Label>
                <Select
                  value={correct.partnerStaffId || "none"}
                  onValueChange={(v) =>
                    setCorrect({ ...correct, partnerStaffId: v === "none" ? "" : v })
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Kein Partner" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">— Kein Partner —</SelectItem>
                    {eligibleStaff.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.displayName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {(
                [
                  ["posSales", "Leistung (POS)"],
                  ["kassiertBrutto", "Abzugebender Betrag"],
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
                    placeholder={key === "kassiertBrutto" ? "wie Leistung (POS)" : "0,00"}
                    onChange={(e) => setCorrect({ ...correct, [key]: e.target.value })}
                    aria-invalid={
                      key === "kassiertBrutto" && correct.kassiertBrutto.trim().startsWith("-")
                    }
                  />
                  {key === "kassiertBrutto" && correct.kassiertBrutto.trim().startsWith("-") ? (
                    <p className="text-xs text-destructive">
                      Der abzugebende Betrag darf nicht negativ sein.
                    </p>
                  ) : key === "kassiertBrutto" ? (
                    <p className="text-xs text-muted-foreground">
                      Leer lassen, wenn identisch mit Leistung (POS).
                    </p>
                  ) : null}
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
              disabled={
                !correct ||
                correct.reason.trim().length < 3 ||
                correct.kassiertBrutto.trim().startsWith("-") ||
                correctMut.isPending
              }
              onClick={() => correctMut.mutate()}
            >
              {correctMut.isPending ? "Speichert…" : "Korrektur speichern"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* --- Manuelle Neuanlage-Dialog --- */}
      <Dialog
        open={createSettlement !== null}
        onOpenChange={(o) => !o && setCreateSettlement(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Abrechnung manuell anlegen</DialogTitle>
            <DialogDescription>
              Erfasst eine neue Kellner-Abrechnung als Admin. Kein automatisches Ausstempeln.
              Trinkgeldsatz wird aus den aktuellen Org-Einstellungen übernommen.
            </DialogDescription>
          </DialogHeader>
          {createSettlement && (
            <div className="space-y-3">
              <div className="space-y-1">
                <Label>Kellner *</Label>
                <Select
                  value={createSettlement.staffId}
                  onValueChange={(v) => setCreateSettlement({ ...createSettlement, staffId: v })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Kellner wählen…" />
                  </SelectTrigger>
                  <SelectContent>
                    {eligibleStaff.length === 0 && (
                      <div className="px-3 py-2 text-sm text-muted-foreground">
                        Keine passenden Mitarbeiter.
                      </div>
                    )}
                    {eligibleStaff.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.displayName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Partner-Kellner (optional)</Label>
                <Select
                  value={createSettlement.partnerStaffId || "none"}
                  onValueChange={(v) =>
                    setCreateSettlement({
                      ...createSettlement,
                      partnerStaffId: v === "none" ? "" : v,
                    })
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Kein Partner" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">— Kein Partner —</SelectItem>
                    {eligibleStaff
                      .filter((s) => s.id !== createSettlement.staffId)
                      .map((s) => (
                        <SelectItem key={s.id} value={s.id}>
                          {s.displayName}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
              {(
                [
                  ["posSales", "Leistung (POS)"],
                  ["kassiertBrutto", "Abzugebender Betrag"],
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
                    value={createSettlement[key]}
                    placeholder={key === "kassiertBrutto" ? "wie Leistung (POS)" : "0,00"}
                    onChange={(e) =>
                      setCreateSettlement({ ...createSettlement, [key]: e.target.value })
                    }
                    aria-invalid={
                      key === "kassiertBrutto" &&
                      createSettlement.kassiertBrutto.trim().startsWith("-")
                    }
                  />
                  {key === "kassiertBrutto" &&
                  createSettlement.kassiertBrutto.trim().startsWith("-") ? (
                    <p className="text-xs text-destructive">
                      Der abzugebende Betrag darf nicht negativ sein.
                    </p>
                  ) : key === "kassiertBrutto" ? (
                    <p className="text-xs text-muted-foreground">
                      Leer lassen, wenn identisch mit Leistung (POS).
                    </p>
                  ) : null}
                </div>
              ))}
              <div className="space-y-1">
                <Label>Begründung *</Label>
                <Input
                  placeholder="z. B. Nacherfassung — Kellner war krank"
                  value={createSettlement.reason}
                  onChange={(e) =>
                    setCreateSettlement({ ...createSettlement, reason: e.target.value })
                  }
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateSettlement(null)}>
              Abbrechen
            </Button>
            <Button
              disabled={
                !createSettlement ||
                !createSettlement.staffId ||
                createSettlement.reason.trim().length < 3 ||
                createSettlement.kassiertBrutto.trim().startsWith("-") ||
                createSettlementMut.isPending
              }
              onClick={() => createSettlementMut.mutate()}
            >
              {createSettlementMut.isPending ? "Speichert…" : "Abrechnung anlegen"}
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

      <Dialog open={reopenConfirm} onOpenChange={setReopenConfirm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Session wieder öffnen?</DialogTitle>
            <DialogDescription>
              Setzt den Status von „finalisiert" zurück auf „offen", sodass Kellner-Abrechnungen und
              Satelliten für diesen Geschäftstag erneut bearbeitet werden können. Nur möglich,
              solange die Session nicht gesperrt und nicht unter der Wasserlinie liegt.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReopenConfirm(false)}>
              Abbrechen
            </Button>
            <Button
              disabled={reopenMut.isPending}
              onClick={() =>
                reopenMut.mutate(undefined, { onSuccess: () => setReopenConfirm(false) })
              }
            >
              Wieder öffnen
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
