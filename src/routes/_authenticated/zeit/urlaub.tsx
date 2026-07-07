import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { Plane, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  cancelMyLeaveRequest,
  getMyLeaveRequests,
  requestLeave,
  type LeaveRequestRow,
} from "@/lib/roster/leave.functions";
import { canCancelLeave } from "@/lib/roster/leave-requests";

export const Route = createFileRoute("/_authenticated/zeit/urlaub")({
  head: () => ({
    meta: [
      { title: "Urlaub beantragen" },
      { name: "description", content: "Urlaubsanträge stellen und Status verfolgen" },
    ],
  }),
  component: UrlaubPage,
});

function isoToday(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
}

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

function UrlaubPage() {
  const qc = useQueryClient();
  const fetchList = useServerFn(getMyLeaveRequests);
  const requestFn = useServerFn(requestLeave);
  const cancelFn = useServerFn(cancelMyLeaveRequest);

  const today = isoToday();
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  const query = useQuery({
    queryKey: ["my-leave-requests"],
    queryFn: () => fetchList({}),
  });

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!startDate || !endDate) return;
    setBusy(true);
    try {
      await requestFn({
        data: {
          start_date: startDate,
          end_date: endDate,
          reason: reason.trim() === "" ? undefined : reason.trim(),
        },
      });
      setStartDate("");
      setEndDate("");
      setReason("");
      await qc.invalidateQueries({ queryKey: ["my-leave-requests"] });
      toast.success("Antrag eingereicht.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleCancel(id: string) {
    setBusy(true);
    try {
      await cancelFn({ data: { id } });
      await qc.invalidateQueries({ queryKey: ["my-leave-requests"] });
      toast.success("Antrag zurückgezogen.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  const rows = query.data ?? [];

  return (
    <main className="mx-auto max-w-xl space-y-6 px-4 py-8">
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Plane className="h-6 w-6 text-primary" aria-hidden />
          <h1 className="text-2xl font-semibold tracking-tight">Urlaub beantragen</h1>
        </div>
        <Link to="/zeit" className="text-sm text-muted-foreground hover:text-foreground">
          Zurück
        </Link>
      </header>

      <Card className="space-y-3 p-5">
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="leave-start">Von</Label>
              <Input
                id="leave-start"
                type="date"
                min={today}
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                required
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="leave-end">Bis</Label>
              <Input
                id="leave-end"
                type="date"
                min={startDate || today}
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                required
              />
            </div>
          </div>
          <div className="space-y-1">
            <Label htmlFor="leave-reason">Grund (optional)</Label>
            <Textarea
              id="leave-reason"
              maxLength={500}
              rows={2}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </div>
          <Button type="submit" disabled={busy || !startDate || !endDate} className="w-full">
            Antrag stellen
          </Button>
        </form>
      </Card>

      {query.isLoading ? (
        <Card className="p-6 text-sm text-muted-foreground">Lade…</Card>
      ) : rows.length === 0 ? (
        <Card className="p-6 text-sm text-muted-foreground">Noch keine Anträge gestellt.</Card>
      ) : (
        <Card className="divide-y">
          {rows.map((r) => (
            <div key={r.id} className="flex items-start justify-between gap-3 px-4 py-3">
              <div className="space-y-1">
                <div className="flex items-center gap-2 text-sm font-medium">
                  {formatDate(r.startDate)} – {formatDate(r.endDate)}
                  <span className="text-xs text-muted-foreground">
                    ({r.days} {r.days === 1 ? "Tag" : "Tage"})
                  </span>
                  {r.holidaysSkipped > 0 ? (
                    <span className="text-xs text-muted-foreground">
                      · {r.holidaysSkipped} {r.holidaysSkipped === 1 ? "Feiertag" : "Feiertage"}{" "}
                      nicht gezählt
                    </span>
                  ) : null}
                </div>
                <div>{statusBadge(r.status)}</div>
                {r.reason ? (
                  <div className="text-xs text-muted-foreground">Grund: {r.reason}</div>
                ) : null}
                {r.decisionNote ? (
                  <div className="text-xs text-muted-foreground">Notiz: {r.decisionNote}</div>
                ) : null}
              </div>
              {canCancelLeave(r.status) ? (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  disabled={busy}
                  onClick={() => handleCancel(r.id)}
                  aria-label="Zurückziehen"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              ) : null}
            </div>
          ))}
        </Card>
      )}
    </main>
  );
}
