// B3c-1b — Kellner-Abrechnung (mobil).
//
// Reiner UI-Commit auf den B3b/B3c-1a Server-Functions. Keine neue
// Geschäftslogik. Live-Vorschau über das gleiche reine Modul
// `calcWaiterSettlement` (Source-of-Truth bleibt der Server-Snapshot).

import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  getMySettlement,
  submitWaiterSettlement,
  getOrCreateOpenSession,
} from "@/lib/cash/cash.functions";
import { listLocations } from "@/lib/admin/locations.functions";
import { LocationPills } from "@/components/shared/LocationPills";
import { useAuth } from "@/hooks/use-auth";
import { calcWaiterSettlement } from "@/lib/cash/waiter-settlement";
import { SecondWaiterSelect } from "@/components/cash/SecondWaiterSelect";
import { parseEuroToCents as parseEuroToCentsBase } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/zeit/abrechnung")({
  head: () => ({
    meta: [
      { title: "Abrechnung" },
      { name: "description", content: "Kellner-Abrechnung des Geschäftstags" },
    ],
  }),
  component: AbrechnungPage,
});

// Euro-Eingabe → ganze Cents (akzeptiert "12", "12,50", "12.50", "1.234,56").
function parseEuroToCents(value: string): number | null {
  return parseEuroToCentsBase(value, { emptyAs: 0 });
}

function formatCents(cents: number | null | undefined): string {
  const v = (cents ?? 0) / 100;
  return v.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
}

type FormState = {
  posSales: string;
  kassiertBrutto: string;
  cardTotal: string;
  hilfMahl: string;
  openInvoices: string;
  cashHandedIn: string;
  secondWaiterName: string | null;
  additionalWaiters: string[];
};

const EMPTY_FORM: FormState = {
  posSales: "",
  kassiertBrutto: "",
  cardTotal: "",
  hilfMahl: "",
  openInvoices: "",
  cashHandedIn: "",
  secondWaiterName: null,
  additionalWaiters: [],
};

function AbrechnungPage() {
  const qc = useQueryClient();
  const fetchMy = useServerFn(getMySettlement);
  const doSubmit = useServerFn(submitWaiterSettlement);
  const { identity } = useAuth();
  const canOpenSession = identity?.role === "admin" || identity?.role === "manager";
  const fetchLocations = useServerFn(listLocations);
  const callCreateSession = useServerFn(getOrCreateOpenSession);
  const [createLocationId, setCreateLocationId] = useState<string>("");
  const locationsQ = useQuery({
    queryKey: ["admin-locations"],
    queryFn: () => fetchLocations(),
    enabled: canOpenSession,
  });
  const createSessionMut = useMutation({
    mutationFn: () => {
      if (!createLocationId) throw new Error("Bitte einen Standort wählen.");
      return callCreateSession({ data: { locationId: createLocationId } });
    },
    onSuccess: () => {
      toast.success("Session geöffnet.");
      void qc.invalidateQueries({ queryKey: ["cash"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const myQ = useQuery({
    queryKey: ["cash", "my-settlement"],
    queryFn: () => fetchMy(),
  });

  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const parsed = useMemo(() => {
    const posSalesCents = parseEuroToCents(form.posSales);
    // „Abzugebender Betrag" ist optional: leeres Feld → Fallback auf Leistung (POS).
    const kassiertRaw = form.kassiertBrutto.trim();
    const kassiertBruttoCents =
      kassiertRaw === "" ? posSalesCents : parseEuroToCents(form.kassiertBrutto);
    return {
      posSalesCents,
      kassiertBruttoCents,
      cardTotalCents: parseEuroToCents(form.cardTotal),
      hilfMahlCents: parseEuroToCents(form.hilfMahl),
      openInvoicesCents: parseEuroToCents(form.openInvoices),
      cashHandedInCents: parseEuroToCents(form.cashHandedIn),
    };
  }, [form]);

  // Negative Eingabe explizit erkennen, damit eine konkrete Fehlermeldung möglich ist
  // (parseEuroToCents lehnt negative Werte mit `null` ab — sonst nicht von „kein Eurobetrag" unterscheidbar).
  const kassiertBruttoNegative = form.kassiertBrutto.trim().startsWith("-");

  const allValid =
    parsed.posSalesCents !== null &&
    parsed.kassiertBruttoCents !== null &&
    !kassiertBruttoNegative &&
    parsed.cardTotalCents !== null &&
    parsed.hilfMahlCents !== null &&
    parsed.openInvoicesCents !== null &&
    parsed.cashHandedInCents !== null;

  const preview = useMemo(() => {
    if (!allValid || myQ.data == null) return null;
    return calcWaiterSettlement({
      posSalesCents: parsed.posSalesCents!,
      kassiertBruttoCents: parsed.kassiertBruttoCents!,
      cardTotalCents: parsed.cardTotalCents!,
      hilfMahlCents: parsed.hilfMahlCents!,
      openInvoicesCents: parsed.openInvoicesCents!,
      kitchenTipRate: myQ.data.kitchenTipRate,
    });
  }, [allValid, parsed, myQ.data]);

  const submitMut = useMutation({
    mutationFn: () => {
      if (!allValid) throw new Error("Bitte alle Felder als Eurobetrag eintragen.");
      return doSubmit({
        data: {
          posSalesCents: parsed.posSalesCents!,
          kassiertBruttoCents: parsed.kassiertBruttoCents!,
          cardTotalCents: parsed.cardTotalCents!,
          hilfMahlCents: parsed.hilfMahlCents!,
          openInvoicesCents: parsed.openInvoicesCents!,
          cashHandedInCents: parsed.cashHandedInCents!,
          secondWaiterName: form.secondWaiterName,
          additionalWaiters: form.additionalWaiters.filter((n) => n.length > 0),
        },
      });
    },
    onSuccess: (res) => {
      setConfirmOpen(false);
      if (res.noOpenTimeEntry) {
        toast.warning("Abrechnung gespeichert. Kein offener Zeiteintrag — nichts ausgestempelt.");
      } else if (res.idempotent) {
        toast.info("Abrechnung wurde bereits abgegeben (unverändert).");
      } else {
        toast.success("Abrechnung abgegeben & ausgestempelt.");
      }
      setForm(EMPTY_FORM);
      void qc.invalidateQueries({ queryKey: ["cash"] });
      void qc.invalidateQueries({ queryKey: ["time"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (myQ.isLoading || myQ.data == null) {
    return (
      <main className="mx-auto max-w-xl px-4 py-8">
        <div className="text-sm text-muted-foreground">Lade…</div>
      </main>
    );
  }

  const {
    session,
    settlement,
    kitchenTipRate,
    businessDate,
    staffId: myStaffId,
    myPoolShareCents,
  } = myQ.data;
  const myExcludeStaffIds = [myStaffId];

  // Falls noch keine Session offen: read-only Hinweis.
  if (!session) {
    return (
      <main className="mx-auto max-w-xl space-y-6 px-4 py-8">
        <Header showKasseLink={canOpenSession} />
        <Card className="p-6 text-sm">
          Für den Geschäftstag <strong>{businessDate}</strong> ist noch keine Session offen. Bitte
          warte, bis der Manager die Session anlegt, oder frage kurz nach.
        </Card>
        {canOpenSession && (
          <Card className="space-y-3 p-6">
            <div className="text-sm font-medium">Session für heute eröffnen</div>
            {locationsQ.data && locationsQ.data.length > 0 ? (
              <>
                <LocationPills
                  locations={locationsQ.data}
                  value={createLocationId}
                  onChange={setCreateLocationId}
                />
                <Button
                  className="w-full"
                  disabled={!createLocationId || createSessionMut.isPending}
                  onClick={() => createSessionMut.mutate()}
                >
                  {createSessionMut.isPending ? "Wird angelegt…" : "Session anlegen"}
                </Button>
              </>
            ) : (
              <div className="text-sm text-muted-foreground">Lade Standorte…</div>
            )}
          </Card>
        )}
      </main>
    );
  }

  // Bereits abgegeben → read-only Ansicht.
  if (settlement) {
    const locked = settlement.status === "locked" || session.status === "locked";
    const diff = Number(settlement.differenz_cents);
    const pos = Number(settlement.pos_sales_cents);
    const kassiertBrutto = Number(
      (settlement as { kassiert_brutto_cents?: number | string | null }).kassiert_brutto_cents ??
        settlement.pos_sales_cents,
    );
    // Brutto-Trinkgeld INKL. Küchenanteil = abgegebenes Bargeld − Soll-Abgabe (Differenz).
    const grossTipCents = Number(settlement.cash_handed_in_cents) - diff;
    // Quote auf die Leistung (POS); Küche 2 % ist eingerechnet, wird nicht separat ausgewiesen.
    const tipPct = pos > 0 ? (grossTipCents / pos) * 100 : null;
    const sessionLocked = session.status === "locked";
    return (
      <main className="mx-auto max-w-xl space-y-6 px-4 py-8">
        <Header showKasseLink={canOpenSession} />
        <Card className="space-y-4 p-6">
          <div className="flex items-center justify-between">
            <div className="text-sm text-muted-foreground">Geschäftstag {businessDate}</div>
            <Badge variant={locked ? "secondary" : "default"}>{settlement.status}</Badge>
          </div>
          <ReadOnlyRow label="Leistung (POS)" cents={pos} />
          <ReadOnlyRow label="Abzugebender Betrag" cents={kassiertBrutto} />
          <ReadOnlyRow label="EC-/Kartensumme" cents={Number(settlement.card_total_cents)} />
          <ReadOnlyRow label="Hilfsmahlzeiten" cents={Number(settlement.hilf_mahl_cents)} />
          <ReadOnlyRow label="Offene Rechnungen" cents={Number(settlement.open_invoices_cents)} />
          <ReadOnlyRow
            label="Abgegebenes Bargeld"
            cents={Number(settlement.cash_handed_in_cents)}
          />
          <hr className="border-border" />
          <ReadOnlyRow label="Differenz" cents={Number(settlement.differenz_cents)} highlight />
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Meine Trinkgeld-Quote</span>
            <span className="font-mono tabular-nums">
              {tipPct === null ? "–" : `${tipPct.toFixed(1).replace(".", ",")} %`}
            </span>
          </div>
          <div className="mt-2 rounded-md border bg-muted/40 p-3">
            <div className="text-xs text-muted-foreground">Mein Pool-Anteil</div>
            {sessionLocked && myPoolShareCents != null ? (
              <div className="mt-1 text-2xl font-semibold tabular-nums">
                {formatCents(myPoolShareCents)} €
              </div>
            ) : (
              <div className="mt-1 text-sm text-muted-foreground">
                Dein Anteil steht nach Tagesabschluss fest.
              </div>
            )}
          </div>
          {settlement.submitted_at && (
            <div className="pt-2 text-sm text-muted-foreground">
              Abgegeben um {formatTime(settlement.submitted_at)}
              {settlement.auto_clockout_time_entry_id
                ? " — automatisch ausgestempelt."
                : " — kein offener Zeiteintrag, nichts ausgestempelt."}
            </div>
          )}
          {(settlement.second_waiter_name ||
            (Array.isArray(settlement.additional_waiters) &&
              settlement.additional_waiters.length > 0)) && (
            <div className="space-y-1 pt-2 text-sm">
              {settlement.second_waiter_name && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Zweiter Kellner</span>
                  <span>{settlement.second_waiter_name}</span>
                </div>
              )}
              {Array.isArray(settlement.additional_waiters) &&
                settlement.additional_waiters.length > 0 && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Weitere Kellner</span>
                    <span>{(settlement.additional_waiters as string[]).join(", ")}</span>
                  </div>
                )}
            </div>
          )}
        </Card>
        <p className="text-center text-xs text-muted-foreground">
          Änderungen kann nur der Manager über die Korrektur-Funktion eintragen.
        </p>
      </main>
    );
  }

  // Eingabe-Formular.
  return (
    <main className="mx-auto max-w-xl space-y-6 px-4 py-8">
      <Header showKasseLink={canOpenSession} />
      <Card className="space-y-4 p-6">
        <div className="text-sm text-muted-foreground">Geschäftstag {businessDate}</div>
        <EuroField
          id="pos"
          label="Leistung (POS)"
          value={form.posSales}
          onChange={(v) => setForm({ ...form, posSales: v })}
          error={parsed.posSalesCents === null && form.posSales !== ""}
        />
        <EuroField
          id="kassiertBrutto"
          label="Abzugebender Betrag"
          value={form.kassiertBrutto}
          onChange={(v) => setForm({ ...form, kassiertBrutto: v })}
          error={
            (parsed.kassiertBruttoCents === null && form.kassiertBrutto !== "") ||
            kassiertBruttoNegative
          }
          errorMessage={
            kassiertBruttoNegative ? "Der abzugebende Betrag darf nicht negativ sein." : undefined
          }
          hint="Leer lassen, wenn identisch mit Leistung (POS)."
          placeholder="wie Leistung (POS)"
        />
        <EuroField
          id="card"
          label="EC-/Kartensumme"
          value={form.cardTotal}
          onChange={(v) => setForm({ ...form, cardTotal: v })}
          error={parsed.cardTotalCents === null && form.cardTotal !== ""}
        />
        <EuroField
          id="hilf"
          label="Hilfsmahlzeiten"
          value={form.hilfMahl}
          onChange={(v) => setForm({ ...form, hilfMahl: v })}
          error={parsed.hilfMahlCents === null && form.hilfMahl !== ""}
        />
        <EuroField
          id="open"
          label="Offene Rechnungen"
          value={form.openInvoices}
          onChange={(v) => setForm({ ...form, openInvoices: v })}
          error={parsed.openInvoicesCents === null && form.openInvoices !== ""}
        />
        <EuroField
          id="cash"
          label="Abgegebenes Bargeld"
          value={form.cashHandedIn}
          onChange={(v) => setForm({ ...form, cashHandedIn: v })}
          error={parsed.cashHandedInCents === null && form.cashHandedIn !== ""}
        />
        <div className="space-y-2">
          <Label>Zweiter Kellner (optional)</Label>
          <SecondWaiterSelect
            value={form.secondWaiterName}
            onValueChange={(v) => setForm({ ...form, secondWaiterName: v })}
            excludeStaffIds={myExcludeStaffIds}
            excludeNames={form.additionalWaiters}
          />
        </div>
        {form.additionalWaiters.length > 0 && (
          <div className="space-y-2">
            <Label>Weitere Kellner</Label>
            {form.additionalWaiters.map((name, i) => (
              <div key={i} className="flex items-center gap-2">
                <div className="flex-1">
                  <SecondWaiterSelect
                    value={name}
                    onValueChange={(v) => {
                      const next = [...form.additionalWaiters];
                      if (v === null) {
                        next.splice(i, 1);
                      } else {
                        next[i] = v;
                      }
                      setForm({ ...form, additionalWaiters: next });
                    }}
                    excludeStaffIds={myExcludeStaffIds}
                    excludeNames={[
                      form.secondWaiterName ?? "",
                      ...form.additionalWaiters.filter((_, j) => j !== i),
                    ]}
                  />
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() =>
                    setForm({
                      ...form,
                      additionalWaiters: form.additionalWaiters.filter((_, j) => j !== i),
                    })
                  }
                >
                  Entfernen
                </Button>
              </div>
            ))}
          </div>
        )}
        {form.additionalWaiters.length < 3 && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setForm({ ...form, additionalWaiters: [...form.additionalWaiters, ""] })}
          >
            + weiteren Kellner hinzufügen
          </Button>
        )}
        <hr className="border-border" />
        <div className="space-y-1 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Differenz (Vorschau)</span>
            <span className="font-mono tabular-nums">
              {preview ? `${formatCents(preview.differenzCents)} €` : "—"}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">
              Trinkgeld Küche ({(kitchenTipRate * 100).toFixed(2)}%)
            </span>
            <span className="font-mono tabular-nums">
              {preview ? `${formatCents(preview.kitchenTipCents)} €` : "—"}
            </span>
          </div>
          <p className="pt-2 text-xs text-muted-foreground">
            Vorschau — verbindlich ist erst der Server-Snapshot beim Absenden.
          </p>
        </div>
        <Button
          size="lg"
          className="w-full"
          disabled={!allValid || submitMut.isPending}
          onClick={() => setConfirmOpen(true)}
        >
          Abrechnung absenden & ausstempeln
        </Button>
      </Card>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Abrechnung absenden?</DialogTitle>
            <DialogDescription>
              Die ArbZG-Pause wird automatisch auf den offenen Zeiteintrag angewendet. Die
              Abrechnung ist anschließend nicht mehr durch dich änderbar — Korrekturen laufen über
              den Manager.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)}>
              Abbrechen
            </Button>
            <Button disabled={submitMut.isPending} onClick={() => submitMut.mutate()}>
              {submitMut.isPending ? "Wird gesendet…" : "Absenden"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </main>
  );
}

function Header({ showKasseLink = false }: { showKasseLink?: boolean }) {
  return (
    <header className="flex items-center justify-between">
      <h1 className="text-2xl font-semibold tracking-tight">Abrechnung</h1>
      <div className="flex items-center gap-3 text-sm">
        {showKasseLink && (
          <Link to="/admin/kasse" className="text-muted-foreground hover:text-foreground">
            Zur Kassenübersicht
          </Link>
        )}
        <Link to="/zeit" className="text-muted-foreground hover:text-foreground">
          Zur Stempeluhr
        </Link>
      </div>
    </header>
  );
}

function EuroField({
  id,
  label,
  value,
  onChange,
  error,
  hint,
  placeholder,
  errorMessage,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  error: boolean;
  hint?: string;
  placeholder?: string;
  errorMessage?: string;
}) {
  return (
    <div className="space-y-1">
      <Label htmlFor={id}>{label} (€)</Label>
      <Input
        id={id}
        inputMode="decimal"
        placeholder={placeholder ?? "0,00"}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={error}
      />
      {error && (
        <p className="text-xs text-destructive">
          {errorMessage ?? "Bitte einen Eurobetrag eingeben."}
        </p>
      )}
      {!error && hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

function ReadOnlyRow({
  label,
  cents,
  highlight,
}: {
  label: string;
  cents: number;
  highlight?: boolean;
}) {
  return (
    <div className="flex justify-between text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span
        className={`font-mono tabular-nums ${highlight && cents < 0 ? "text-destructive" : ""}`}
      >
        {formatCents(cents)} €
      </span>
    </div>
  );
}
