import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { Heart, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  createDayOffWish,
  deleteDayOffWish,
  getMyDayOffWishes,
} from "@/lib/roster/roster.functions";
import { sortWishesByDate } from "@/lib/roster/day-off-wishes";

export const Route = createFileRoute("/_authenticated/zeit/wuensche")({
  head: () => ({
    meta: [
      { title: "Freie Tage wünschen" },
      { name: "description", content: "Unverbindliche Wunsch-freie-Tage eintragen" },
    ],
  }),
  component: WunschePage,
});

function isoToday(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function formatDate(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString("de-DE", {
    weekday: "long",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function WunschePage() {
  const qc = useQueryClient();
  const fetchWishes = useServerFn(getMyDayOffWishes);
  const createFn = useServerFn(createDayOffWish);
  const deleteFn = useServerFn(deleteDayOffWish);

  const today = isoToday();
  const [wishDate, setWishDate] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  const query = useQuery({
    queryKey: ["my-day-off-wishes"],
    queryFn: () => fetchWishes({}),
  });

  const wishes = useMemo(() => sortWishesByDate(query.data ?? []), [query.data]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!wishDate) return;
    setBusy(true);
    try {
      await createFn({ data: { wishDate, note: note.trim() === "" ? null : note } });
      setWishDate("");
      setNote("");
      await qc.invalidateQueries({ queryKey: ["my-day-off-wishes"] });
      toast.success("Wunsch eingetragen.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete(iso: string) {
    setBusy(true);
    try {
      await deleteFn({ data: { wishDate: iso } });
      await qc.invalidateQueries({ queryKey: ["my-day-off-wishes"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto max-w-xl space-y-6 px-4 py-8">
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Heart className="h-6 w-6 fill-purple-600 text-purple-600" aria-hidden />
          <h1 className="text-2xl font-semibold tracking-tight">Freie Tage wünschen</h1>
        </div>
        <Link to="/zeit" className="text-sm text-muted-foreground hover:text-foreground">
          Zurück
        </Link>
      </header>

      <Card className="space-y-3 p-5">
        <form onSubmit={handleCreate} className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="wish-date">Datum</Label>
            <Input
              id="wish-date"
              type="date"
              min={today}
              value={wishDate}
              onChange={(e) => setWishDate(e.target.value)}
              required
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="wish-note">Notiz</Label>
            <Input
              id="wish-note"
              type="text"
              maxLength={200}
              placeholder="Grund (optional)"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>
          <Button type="submit" disabled={busy || !wishDate} className="w-full">
            Wunsch eintragen
          </Button>
        </form>
      </Card>

      {query.isLoading ? (
        <Card className="p-6 text-sm text-muted-foreground">Lade…</Card>
      ) : wishes.length === 0 ? (
        <Card className="p-6 text-sm text-muted-foreground">
          Noch keine Wunsch-freien Tage eingetragen.
        </Card>
      ) : (
        <Card className="divide-y">
          {wishes.map((w) => (
            <div key={w.wishDate} className="flex items-start justify-between gap-3 px-4 py-3">
              <div className="flex items-start gap-2">
                <Heart className="mt-0.5 h-4 w-4 fill-purple-600 text-purple-600" aria-hidden />
                <div className="space-y-0.5">
                  <div className="text-sm font-medium">{formatDate(w.wishDate)}</div>
                  {w.note ? <div className="text-xs text-muted-foreground">{w.note}</div> : null}
                </div>
              </div>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                disabled={busy}
                onClick={() => handleDelete(w.wishDate)}
                aria-label="Entfernen"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </Card>
      )}
    </main>
  );
}
