import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
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
  decideLeaveRequest,
  listLeaveRequests,
  type LeaveRequestRow,
} from "@/lib/roster/leave.functions";
import { VacationPlannerSection } from "@/components/urlaub/VacationPlannerSection";
import { AdminSwapsPanel } from "@/components/tausch/AdminSwapsPanel";
import { listPendingSwaps } from "@/lib/roster/swap.functions";

type Filter = "offen" | "genehmigt" | "abgelehnt" | "alle";

export const Route = createFileRoute("/_authenticated/admin/urlaub")({
  head: () => ({ meta: [{ title: "Urlaubsantrag / Schichttausch" }] }),
  component: AdminUrlaubPage,
});

function formatDate(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function statusBadge(status: LeaveRequestRow["status"]) {
  if (status === "offen") return <Badge variant="secondary">offen</Badge>;
  if (status === "genehmigt")
    return <Badge className="bg-emerald-600 text-white hover:bg-emerald-600">genehmigt</Badge>;
  return <Badge variant="destructive">abgelehnt</Badge>;
}

function AdminUrlaubPage() {
  const qc = useQueryClient();
  const fetchList = useServerFn(listLeaveRequests);
  const decideFn = useServerFn(decideLeaveRequest);

  const [filter, setFilter] = useState<Filter>("offen");
  const [rejectId, setRejectId] = useState<string | null>(null);
  const [rejectNote, setRejectNote] = useState("");
  const [busy, setBusy] = useState(false);

  const query = useQuery({
    queryKey: ["admin-leave-requests", filter],
    queryFn: () => fetchList({ data: { status: filter } }),
  });
  const swapsQ = useQuery({
    queryKey: ["admin", "swap-requests"],
    queryFn: () => listPendingSwaps(),
  });
  const pendingSwaps = (swapsQ.data ?? []).filter((r) => r.status === "peer_accepted").length;

  async function handleApprove(id: string) {
    setBusy(true);
    try {
      await decideFn({ data: { id, decision: "genehmigt" } });
      await qc.invalidateQueries({ queryKey: ["admin-leave-requests"] });
      toast.success("Antrag genehmigt — Urlaubstage eingetragen.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleReject() {
    if (!rejectId) return;
    setBusy(true);
    try {
      await decideFn({
        data: { id: rejectId, decision: "abgelehnt", decision_note: rejectNote.trim() },
      });
      setRejectId(null);
      setRejectNote("");
      await qc.invalidateQueries({ queryKey: ["admin-leave-requests"] });
      toast.success("Antrag abgelehnt.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  const rows = query.data ?? [];
  const FILTERS: { key: Filter; label: string }[] = [
    { key: "offen", label: "Offen" },
    { key: "genehmigt", label: "Genehmigt" },
    { key: "abgelehnt", label: "Abgelehnt" },
    { key: "alle", label: "Alle" },
  ];

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Urlaubsanträge & Schichttausch</h1>
        <p className="text-sm text-muted-foreground">
          Offene Urlaubsanträge und Schichttausch-Freigaben an einem Ort.
        </p>
      </header>

      <Tabs defaultValue="urlaub" className="w-full">
        <TabsList>
          <TabsTrigger value="urlaub">Urlaubsanträge</TabsTrigger>
          <TabsTrigger value="tausch">
            Schichttausch
            {pendingSwaps > 0 && (
              <span
                className="ml-1.5 inline-block h-2 w-2 rounded-full bg-destructive align-middle"
                aria-label={`${pendingSwaps} Tauschanfragen warten`}
              />
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="urlaub" className="mt-4 space-y-6">
          <div className="flex flex-wrap gap-2">
            {FILTERS.map((f) => (
              <Button
                key={f.key}
                type="button"
                size="sm"
                variant={filter === f.key ? "default" : "outline"}
                onClick={() => setFilter(f.key)}
              >
                {f.label}
              </Button>
            ))}
          </div>

          {query.isLoading ? (
            <Card className="p-6 text-sm text-muted-foreground">Lade…</Card>
          ) : rows.length === 0 ? (
            <Card className="p-6 text-sm text-muted-foreground">
              Keine Anträge mit diesem Status.
            </Card>
          ) : (
            <Card className="divide-y">
              {rows.map((r) => (
                <div
                  key={r.id}
                  className="flex flex-wrap items-start justify-between gap-3 px-4 py-3"
                >
                  <div className="space-y-1">
                    <div className="text-sm font-medium">
                      {r.staffName ?? "—"}{" "}
                      <span className="text-xs text-muted-foreground">
                        · eingereicht {formatDate(r.createdAt.slice(0, 10))}
                      </span>
                    </div>
                    <div className="text-sm">
                      {formatDate(r.startDate)} – {formatDate(r.endDate)}{" "}
                      <span className="text-xs text-muted-foreground">
                        ({r.days} {r.days === 1 ? "Tag" : "Tage"})
                      </span>
                    </div>
                    <div>{statusBadge(r.status)}</div>
                    {r.reason ? (
                      <div className="text-xs text-muted-foreground">Grund: {r.reason}</div>
                    ) : null}
                    {r.decisionNote ? (
                      <div className="text-xs text-muted-foreground">Notiz: {r.decisionNote}</div>
                    ) : null}
                  </div>
                  {r.status === "offen" ? (
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        size="sm"
                        disabled={busy}
                        onClick={() => handleApprove(r.id)}
                      >
                        Genehmigen
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={busy}
                        onClick={() => {
                          setRejectId(r.id);
                          setRejectNote("");
                        }}
                      >
                        Ablehnen
                      </Button>
                    </div>
                  ) : null}
                </div>
              ))}
            </Card>
          )}

          <Dialog
            open={rejectId !== null}
            onOpenChange={(open) => {
              if (!open) {
                setRejectId(null);
                setRejectNote("");
              }
            }}
          >
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Antrag ablehnen</DialogTitle>
                <DialogDescription>
                  Bitte begründe die Ablehnung (mindestens 3 Zeichen).
                </DialogDescription>
              </DialogHeader>
              <Textarea
                value={rejectNote}
                onChange={(e) => setRejectNote(e.target.value)}
                rows={3}
                maxLength={500}
                placeholder="Begründung"
              />
              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setRejectId(null);
                    setRejectNote("");
                  }}
                >
                  Abbrechen
                </Button>
                <Button
                  type="button"
                  variant="destructive"
                  disabled={busy || rejectNote.trim().length < 3}
                  onClick={handleReject}
                >
                  Ablehnen
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <VacationPlannerSection />
        </TabsContent>

        <TabsContent value="tausch" className="mt-4">
          <AdminSwapsPanel />
        </TabsContent>
      </Tabs>
    </div>
  );
}
