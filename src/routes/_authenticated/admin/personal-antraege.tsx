// SP3 — Admin-Review für Stammdaten-Änderungsanträge + Dokumenten-Ampel.
// Reine UI, nutzt ausschließlich vorhandene Server-Functions aus
// `src/lib/profile/profile-admin.functions.ts` sowie die pure Ampel-Funktion
// `documentExpiryStatus`. UI-Gate = admin (Server-Fn erzwingt admin ohnehin).

import { useMemo, useState } from "react";
import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  listOpenChangeRequests,
  decideChangeRequest,
  listAllDocuments,
  getDocumentUrlAdmin,
  verifyDocument,
  deleteDocument,
  type OpenChangeRequest,
  type AdminDocument,
} from "@/lib/profile/profile-admin.functions";
import { listStaff } from "@/lib/admin/staff.functions";
import { DOC_TYPES, type StaffDocumentType } from "@/lib/profile/staff-document-path";
import { documentExpiryStatus, type DocumentExpiryStatus } from "@/lib/profile/document-expiry";

export const Route = createFileRoute("/_authenticated/admin/personal-antraege")({
  beforeLoad: ({ context }) => {
    const role = (context as { identity?: { role?: string } }).identity?.role;
    if (role !== "admin") throw redirect({ to: "/admin" });
  },
  head: () => ({ meta: [{ title: "Personal-Anträge · COCO" }] }),
  component: PersonalAntraegePage,
});

const FIELD_LABEL: Record<string, string> = {
  first_name: "Vorname",
  last_name: "Nachname",
  salutation: "Anrede",
  date_of_birth: "Geburtsdatum",
  place_of_birth: "Geburtsort",
  nationality: "Nationalität",
  bank_name: "Bank",
  iban: "IBAN",
  account_holder: "Kontoinhaber",
  social_security_number: "SV-Nummer",
  tax_id: "Steuer-ID",
  tax_class: "Steuerklasse",
  church_tax_liable: "Kirchensteuerpflichtig",
  konfession: "Konfession",
  children_count: "Anzahl Kinder",
  child_tax_allowances: "Kinderfreibeträge",
  health_insurance: "Krankenkasse",
};

const DOC_TYPE_LABEL: Record<StaffDocumentType, string> = {
  passport: "Pass",
  visa: "Visum",
  work_permit: "Arbeitserlaubnis",
  health_certificate: "Gesundheitszeugnis",
  contract: "Vertrag",
  other: "Sonstiges",
};

function fieldLabel(k: string): string {
  return FIELD_LABEL[k] ?? k;
}

function formatValue(v: string | number | boolean | null): string {
  if (v === null || v === undefined || v === "") return "";
  if (typeof v === "boolean") return v ? "Ja" : "Nein";
  return String(v);
}

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso.length === 10 ? iso + "T00:00:00Z" : iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("de-DE", { year: "numeric", month: "2-digit", day: "2-digit" });
}

function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("de-DE", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function PersonalAntraegePage() {
  const requestsQ = useQuery({
    queryKey: ["admin", "profile-requests"],
    queryFn: () => listOpenChangeRequests(),
  });
  const docsQ = useQuery({
    queryKey: ["admin", "profile-documents"],
    queryFn: () => listAllDocuments({ data: {} }),
  });
  const pendingRequests = (requestsQ.data ?? []).length;
  const pendingDocuments = (docsQ.data ?? []).filter((d) => d.verifiedAt === null).length;
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Personal-Anträge</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Änderungsanträge der Mitarbeiter freigeben und Dokumenten-Übersicht mit Ablauf-Ampel.
        </p>
      </header>
      <Tabs defaultValue="requests" className="w-full">
        <TabsList>
          <TabsTrigger value="requests">
            Anträge
            {pendingRequests > 0 && (
              <span
                className="ml-1.5 inline-block h-2 w-2 rounded-full bg-destructive align-middle"
                aria-label={`${pendingRequests} offene Anträge`}
              />
            )}
          </TabsTrigger>
          <TabsTrigger value="documents">
            Dokumente
            {pendingDocuments > 0 && (
              <span
                className="ml-1.5 inline-block h-2 w-2 rounded-full bg-destructive align-middle"
                aria-label={`${pendingDocuments} ungeprüfte Dokumente`}
              />
            )}
          </TabsTrigger>
        </TabsList>
        <TabsContent value="requests" className="mt-4">
          <RequestsTab />
        </TabsContent>
        <TabsContent value="documents" className="mt-4">
          <DocumentsTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// =========================================================================
// Anträge
// =========================================================================

function RequestsTab() {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["admin", "profile-requests"],
    queryFn: () => listOpenChangeRequests(),
  });
  const decideFn = useServerFn(decideChangeRequest);

  const [decideOn, setDecideOn] = useState<{
    request: OpenChangeRequest;
    decision: "approved" | "rejected";
  } | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!decideOn) return;
    setBusy(true);
    try {
      await decideFn({
        data: {
          requestId: decideOn.request.id,
          decision: decideOn.decision,
          reviewNote: note.trim() ? note.trim() : undefined,
        },
      });
      toast.success(decideOn.decision === "approved" ? "Antrag freigegeben." : "Antrag abgelehnt.");
      setDecideOn(null);
      setNote("");
      await qc.invalidateQueries({ queryKey: ["admin", "profile-requests"] });
      await qc.invalidateQueries({ queryKey: ["admin", "review-pending-counts"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Aktion fehlgeschlagen.");
    } finally {
      setBusy(false);
    }
  }

  if (q.isLoading) return <p className="text-sm text-muted-foreground">Lade…</p>;
  if (q.isError)
    return (
      <p className="text-sm text-destructive">
        Fehler beim Laden: {q.error instanceof Error ? q.error.message : "Unbekannt"}
      </p>
    );

  const rows = q.data ?? [];
  if (rows.length === 0)
    return <Card className="p-6 text-sm text-muted-foreground">Keine offenen Anträge.</Card>;

  return (
    <>
      <div className="space-y-4">
        {rows.map((r) => (
          <RequestCard
            key={r.id}
            request={r}
            onApprove={() => {
              setDecideOn({ request: r, decision: "approved" });
              setNote("");
            }}
            onReject={() => {
              setDecideOn({ request: r, decision: "rejected" });
              setNote("");
            }}
          />
        ))}
      </div>

      <Dialog
        open={!!decideOn}
        onOpenChange={(o) => {
          if (!o) {
            setDecideOn(null);
            setNote("");
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {decideOn?.decision === "approved" ? "Antrag freigeben" : "Antrag ablehnen"}
            </DialogTitle>
            <DialogDescription>
              Mitarbeiter: {decideOn?.request.staffName}. Anmerkung ist optional
              {decideOn?.decision === "rejected" ? " (bei Ablehnung empfohlen)" : ""}.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="note">Anmerkung</Label>
            <Textarea
              id="note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={3}
              placeholder="Wird dem Mitarbeiter angezeigt."
            />
            <p className="text-xs text-muted-foreground">Wird dem Mitarbeiter angezeigt.</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDecideOn(null)} disabled={busy}>
              Abbrechen
            </Button>
            <Button
              variant={decideOn?.decision === "rejected" ? "destructive" : "default"}
              onClick={submit}
              disabled={busy}
            >
              {busy ? "…" : decideOn?.decision === "approved" ? "Freigeben" : "Ablehnen"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function RequestCard({
  request,
  onApprove,
  onReject,
}: {
  request: OpenChangeRequest;
  onApprove: () => void;
  onReject: () => void;
}) {
  const hasManual = request.changes.some((c) => c.manualOnly);
  return (
    <Card className="space-y-3 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-foreground">{request.staffName}</div>
          <div className="text-xs text-muted-foreground">
            eingereicht {fmtDateTime(request.createdAt)}
          </div>
          {request.note && (
            <p className="mt-2 max-w-2xl text-sm text-foreground">
              <span className="text-xs uppercase tracking-wide text-muted-foreground">
                Anmerkung:
              </span>{" "}
              {request.note}
            </p>
          )}
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={onReject}>
            Ablehnen
          </Button>
          <Button size="sm" onClick={onApprove}>
            Freigeben
          </Button>
        </div>
      </div>

      {hasManual && (
        <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          <p className="font-medium">
            Namensänderung wird NICHT automatisch übernommen — nach Freigabe manuell in der{" "}
            <Link to="/admin/staff" className="underline">
              Mitarbeiterverwaltung
            </Link>{" "}
            pflegen.
          </p>
        </div>
      )}

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-1/3">Feld</TableHead>
            <TableHead>Aktuell</TableHead>
            <TableHead>Beantragt</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {request.changes.map((c) => {
            const currentStr = formatValue(c.current);
            const requestedStr = formatValue(c.requested);
            return (
              <TableRow key={c.field}>
                <TableCell className="font-medium">
                  {fieldLabel(c.field)}
                  {c.manualOnly && (
                    <Badge variant="outline" className="ml-2 text-amber-700">
                      manuell
                    </Badge>
                  )}
                </TableCell>
                <TableCell>
                  {currentStr === "" ? (
                    <span className="text-muted-foreground italic">— noch nicht hinterlegt</span>
                  ) : (
                    currentStr
                  )}
                </TableCell>
                <TableCell className="font-medium text-foreground">{requestedStr}</TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </Card>
  );
}

// =========================================================================
// Dokumente
// =========================================================================

function statusBadge(status: DocumentExpiryStatus) {
  if (status === "expired")
    return <Badge className="bg-red-600 text-white hover:bg-red-600">abgelaufen</Badge>;
  if (status === "expiring")
    return <Badge className="bg-amber-500 text-white hover:bg-amber-500">läuft bald ab</Badge>;
  if (status === "ok")
    return <Badge className="bg-emerald-600 text-white hover:bg-emerald-600">gültig</Badge>;
  return (
    <Badge variant="outline" className="text-muted-foreground">
      kein Datum
    </Badge>
  );
}

function DocumentsTab() {
  const qc = useQueryClient();
  const staffQ = useQuery({ queryKey: ["admin", "staff-list"], queryFn: () => listStaff() });
  const docsQ = useQuery({
    queryKey: ["admin", "profile-documents"],
    queryFn: () => listAllDocuments({ data: {} }),
  });
  const openUrlFn = useServerFn(getDocumentUrlAdmin);
  const verifyFn = useServerFn(verifyDocument);
  const deleteFn = useServerFn(deleteDocument);

  const [staffFilter, setStaffFilter] = useState<string>("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [deleteTarget, setDeleteTarget] = useState<AdminDocument | null>(null);
  const [busy, setBusy] = useState(false);

  const today = useMemo(() => new Date(), []);

  const allDocs = useMemo(() => docsQ.data ?? [], [docsQ.data]);
  const filtered = useMemo(
    () =>
      allDocs.filter(
        (d) =>
          (staffFilter === "all" || d.staffId === staffFilter) &&
          (typeFilter === "all" || d.docType === typeFilter),
      ),
    [allDocs, staffFilter, typeFilter],
  );

  const counts = useMemo(() => {
    let expired = 0;
    let expiring = 0;
    for (const d of allDocs) {
      const s = documentExpiryStatus(d.validUntil, today);
      if (s === "expired") expired += 1;
      if (s === "expiring") expiring += 1;
    }
    return { expired, expiring };
  }, [allDocs, today]);

  const activeStaff = (staffQ.data ?? []).filter((s) => s.isActive);
  const staffWithHealthCert = new Set(
    allDocs.filter((d) => d.docType === "health_certificate").map((d) => d.staffId),
  );
  const missingHealth = activeStaff.filter((s) => !staffWithHealthCert.has(s.id));

  async function openDoc(id: string) {
    try {
      const { url } = await openUrlFn({ data: { documentId: id } });
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Öffnen fehlgeschlagen.");
    }
  }

  async function verify(id: string) {
    setBusy(true);
    try {
      await verifyFn({ data: { documentId: id } });
      toast.success("Dokument als geprüft markiert.");
      await qc.invalidateQueries({ queryKey: ["admin", "profile-documents"] });
      await qc.invalidateQueries({ queryKey: ["admin", "review-pending-counts"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Aktion fehlgeschlagen.");
    } finally {
      setBusy(false);
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    setBusy(true);
    try {
      await deleteFn({ data: { documentId: deleteTarget.id } });
      toast.success("Dokument gelöscht.");
      setDeleteTarget(null);
      await qc.invalidateQueries({ queryKey: ["admin", "profile-documents"] });
      await qc.invalidateQueries({ queryKey: ["admin", "review-pending-counts"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Löschen fehlgeschlagen.");
    } finally {
      setBusy(false);
    }
  }

  if (docsQ.isLoading || staffQ.isLoading)
    return <p className="text-sm text-muted-foreground">Lade…</p>;
  if (docsQ.isError)
    return (
      <p className="text-sm text-destructive">
        Fehler beim Laden: {docsQ.error instanceof Error ? docsQ.error.message : "Unbekannt"}
      </p>
    );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <Badge className="bg-red-600 text-white hover:bg-red-600">
          {counts.expired} abgelaufen
        </Badge>
        <Badge className="bg-amber-500 text-white hover:bg-amber-500">
          {counts.expiring} laufen bald ab
        </Badge>
      </div>

      <div className="flex flex-wrap gap-3">
        <div className="min-w-[220px]">
          <Label className="text-xs">Mitarbeiter</Label>
          <Select value={staffFilter} onValueChange={setStaffFilter}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Alle Mitarbeiter</SelectItem>
              {(staffQ.data ?? []).map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {[s.firstName, s.lastName].filter(Boolean).join(" ") || s.displayName || "—"}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="min-w-[220px]">
          <Label className="text-xs">Dokumenttyp</Label>
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Alle Typen</SelectItem>
              {DOC_TYPES.map((t) => (
                <SelectItem key={t} value={t}>
                  {DOC_TYPE_LABEL[t]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {filtered.length === 0 ? (
        <Card className="p-6 text-sm text-muted-foreground">
          Keine Dokumente für die aktuelle Filterauswahl.
        </Card>
      ) : (
        <Card className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Mitarbeiter</TableHead>
                <TableHead>Typ</TableHead>
                <TableHead>Datei</TableHead>
                <TableHead>Gültig bis</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Aktionen</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((d) => {
                const status = documentExpiryStatus(d.validUntil, today);
                return (
                  <TableRow key={d.id}>
                    <TableCell className="font-medium">{d.staffName}</TableCell>
                    <TableCell>{DOC_TYPE_LABEL[d.docType]}</TableCell>
                    <TableCell className="max-w-[220px] truncate" title={d.originalFilename}>
                      {d.originalFilename}
                    </TableCell>
                    <TableCell>{fmtDate(d.validUntil)}</TableCell>
                    <TableCell>
                      <div className="flex flex-col gap-1">
                        {statusBadge(status)}
                        {d.verifiedAt && (
                          <span className="text-xs text-muted-foreground">
                            geprüft am {fmtDate(d.verifiedAt)}
                          </span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex flex-wrap justify-end gap-2">
                        <Button size="sm" variant="outline" onClick={() => openDoc(d.id)}>
                          Ansehen
                        </Button>
                        {!d.verifiedAt && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => verify(d.id)}
                            disabled={busy}
                          >
                            ✓ Geprüft
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => setDeleteTarget(d)}
                          disabled={busy}
                        >
                          Löschen
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </Card>
      )}

      <section className="space-y-2">
        <h2 className="text-base font-semibold text-foreground">Ohne Gesundheitszeugnis</h2>
        <p className="text-xs text-muted-foreground">
          Aktive Mitarbeiter, für die noch kein Dokument vom Typ „Gesundheitszeugnis" hinterlegt
          ist.
        </p>
        {missingHealth.length === 0 ? (
          <Card className="p-4 text-sm text-emerald-700">
            Alle aktiven Mitarbeiter haben ein Gesundheitszeugnis hinterlegt.
          </Card>
        ) : (
          <Card className="p-4">
            <ul className="space-y-1 text-sm">
              {missingHealth.map((s) => (
                <li key={s.id}>
                  {[s.firstName, s.lastName].filter(Boolean).join(" ") || s.displayName || "—"}
                </li>
              ))}
            </ul>
          </Card>
        )}
      </section>

      <Dialog
        open={!!deleteTarget}
        onOpenChange={(o) => {
          if (!o) setDeleteTarget(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Dokument löschen?</DialogTitle>
            <DialogDescription>
              {deleteTarget
                ? `${DOC_TYPE_LABEL[deleteTarget.docType]} · ${deleteTarget.originalFilename} von ${deleteTarget.staffName}. Diese Aktion kann nicht rückgängig gemacht werden.`
                : ""}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)} disabled={busy}>
              Abbrechen
            </Button>
            <Button variant="destructive" onClick={confirmDelete} disabled={busy}>
              {busy ? "Lösche…" : "Löschen"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
