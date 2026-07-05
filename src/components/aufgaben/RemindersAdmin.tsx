// DP1: Verwaltung der Display-Erinnerungen für einen Standort.
// Manager+Admin dürfen anlegen, bearbeiten, löschen und aktivieren/deaktivieren.

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Trash2, Plus } from "lucide-react";
import { REMINDER_COLORS, type ReminderColor } from "@/lib/display/reminders";
import {
  createDisplayReminder,
  deleteDisplayReminder,
  listDisplayReminders,
  updateDisplayReminder,
} from "@/lib/display/reminders.functions";

const WEEKDAYS = [
  "Montag",
  "Dienstag",
  "Mittwoch",
  "Donnerstag",
  "Freitag",
  "Samstag",
  "Sonntag",
] as const;

const COLOR_LABEL: Record<ReminderColor, string> = {
  grau: "Grau",
  braun: "Braun",
  blau: "Blau",
  gruen: "Grün",
  gelb: "Gelb",
  orange: "Orange",
  rot: "Rot",
  violett: "Violett",
};
const COLOR_SWATCH: Record<ReminderColor, string> = {
  grau: "bg-slate-500",
  braun: "bg-amber-900",
  blau: "bg-blue-600",
  gruen: "bg-emerald-600",
  gelb: "bg-yellow-400",
  orange: "bg-orange-500",
  rot: "bg-red-600",
  violett: "bg-violet-600",
};

type FormState = {
  id: string | null;
  title: string;
  emoji: string;
  color: ReminderColor;
  weekday: number;
  intervalWeeks: 1 | 2;
  anchorDate: string;
  fromTime: string;
  untilTime: string;
  isActive: boolean;
  sortOrder: number;
};

function emptyForm(): FormState {
  return {
    id: null,
    title: "",
    emoji: "",
    color: "grau",
    weekday: 0,
    intervalWeeks: 1,
    anchorDate: "",
    fromTime: "20:00",
    untilTime: "01:00",
    isActive: true,
    sortOrder: 0,
  };
}

export function RemindersAdmin({ locationId }: { locationId: string }) {
  const qc = useQueryClient();
  const key = ["display-reminders", locationId] as const;
  const q = useQuery({
    queryKey: key,
    queryFn: () => listDisplayReminders({ data: { locationId } }),
    enabled: !!locationId,
  });

  const [form, setForm] = useState<FormState>(emptyForm());
  const [showForm, setShowForm] = useState(false);

  const invalidate = () => qc.invalidateQueries({ queryKey: key });

  const createMut = useMutation({
    mutationFn: () =>
      createDisplayReminder({
        data: {
          locationId,
          title: form.title.trim(),
          emoji: form.emoji.trim() || null,
          color: form.color,
          weekday: form.weekday,
          intervalWeeks: form.intervalWeeks,
          anchorDate: form.intervalWeeks === 2 ? form.anchorDate : null,
          fromTime: form.fromTime,
          untilTime: form.untilTime,
          isActive: form.isActive,
          sortOrder: form.sortOrder,
        },
      }),
    onSuccess: () => {
      toast.success("Erinnerung angelegt.");
      setForm(emptyForm());
      setShowForm(false);
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const updateMut = useMutation({
    mutationFn: () => {
      if (!form.id) throw new Error("Kein Eintrag ausgewählt.");
      return updateDisplayReminder({
        data: {
          id: form.id,
          title: form.title.trim(),
          emoji: form.emoji.trim() || null,
          color: form.color,
          weekday: form.weekday,
          intervalWeeks: form.intervalWeeks,
          anchorDate: form.intervalWeeks === 2 ? form.anchorDate : null,
          fromTime: form.fromTime,
          untilTime: form.untilTime,
          isActive: form.isActive,
          sortOrder: form.sortOrder,
        },
      });
    },
    onSuccess: () => {
      toast.success("Erinnerung gespeichert.");
      setForm(emptyForm());
      setShowForm(false);
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => deleteDisplayReminder({ data: { id } }),
    onSuccess: () => {
      toast.success("Erinnerung gelöscht.");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggleActiveMut = useMutation({
    mutationFn: (r: NonNullable<typeof q.data>[number]) =>
      updateDisplayReminder({
        data: {
          id: r.id,
          title: r.title,
          emoji: r.emoji,
          color: r.color,
          weekday: r.weekday,
          intervalWeeks: r.intervalWeeks,
          anchorDate: r.anchorDate,
          fromTime: r.fromTime,
          untilTime: r.untilTime,
          isActive: !r.isActive,
          sortOrder: r.sortOrder,
        },
      }),
    onSuccess: () => invalidate(),
    onError: (e: Error) => toast.error(e.message),
  });

  const startEdit = (r: NonNullable<typeof q.data>[number]) => {
    setForm({
      id: r.id,
      title: r.title,
      emoji: r.emoji ?? "",
      color: r.color,
      weekday: r.weekday,
      intervalWeeks: r.intervalWeeks,
      anchorDate: r.anchorDate ?? "",
      fromTime: r.fromTime,
      untilTime: r.untilTime,
      isActive: r.isActive,
      sortOrder: r.sortOrder,
    });
    setShowForm(true);
  };

  const submit = () => {
    if (!form.title.trim()) {
      toast.error("Titel darf nicht leer sein.");
      return;
    }
    if (form.intervalWeeks === 2 && !form.anchorDate) {
      toast.error("Ankerdatum ist bei 14-tägigem Rhythmus erforderlich.");
      return;
    }
    if (form.id) updateMut.mutate();
    else createMut.mutate();
  };

  const list = q.data ?? [];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Erinnerungen</h2>
          <p className="text-sm text-muted-foreground">
            Wiederkehrende Warnbanner fürs Standort-Display (z. B. Müll, Wäsche).
          </p>
        </div>
        {!showForm && (
          <Button
            size="sm"
            onClick={() => {
              setForm(emptyForm());
              setShowForm(true);
            }}
          >
            <Plus className="mr-1 h-4 w-4" /> Neu
          </Button>
        )}
      </div>

      {showForm && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              {form.id ? "Erinnerung bearbeiten" : "Neue Erinnerung"}
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2">
            <div className="md:col-span-2">
              <Label htmlFor="rem-title">Titel</Label>
              <Input
                id="rem-title"
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                placeholder="z. B. Biotonne rausstellen"
                maxLength={120}
              />
            </div>
            <div>
              <Label>Farbe</Label>
              <Select
                value={form.color}
                onValueChange={(v) => setForm({ ...form, color: v as ReminderColor })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {REMINDER_COLORS.map((c) => (
                    <SelectItem key={c} value={c}>
                      <span className="flex items-center gap-2">
                        <span className={`inline-block h-3 w-3 rounded-full ${COLOR_SWATCH[c]}`} />
                        {COLOR_LABEL[c]}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Wochentag</Label>
              <Select
                value={String(form.weekday)}
                onValueChange={(v) => setForm({ ...form, weekday: Number(v) })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {WEEKDAYS.map((w, i) => (
                    <SelectItem key={w} value={String(i)}>
                      {w}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Rhythmus</Label>
              <Select
                value={String(form.intervalWeeks)}
                onValueChange={(v) =>
                  setForm({ ...form, intervalWeeks: (Number(v) === 2 ? 2 : 1) as 1 | 2 })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">Jede Woche</SelectItem>
                  <SelectItem value="2">Alle 2 Wochen</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {form.intervalWeeks === 2 && (
              <div>
                <Label htmlFor="rem-anchor">
                  Anker (Datum eines Termins, definiert die Parität)
                </Label>
                <Input
                  id="rem-anchor"
                  type="date"
                  value={form.anchorDate}
                  onChange={(e) => setForm({ ...form, anchorDate: e.target.value })}
                />
              </div>
            )}
            <div>
              <Label htmlFor="rem-time">Ab (Uhrzeit)</Label>
              <Input
                id="rem-time"
                type="time"
                value={form.fromTime}
                onChange={(e) => setForm({ ...form, fromTime: e.target.value })}
              />
            </div>
            <div>
              <Label htmlFor="rem-until">Bis (Uhrzeit)</Label>
              <Input
                id="rem-until"
                type="time"
                value={form.untilTime}
                onChange={(e) => setForm({ ...form, untilTime: e.target.value })}
              />
              <p className="mt-1 text-xs text-muted-foreground">
                Über Mitternacht = früher Morgen desselben Geschäftstags, spätestens 03:00.
              </p>
            </div>
            <div>
              <Label htmlFor="rem-order">Sortierung</Label>
              <Input
                id="rem-order"
                type="number"
                min={0}
                value={form.sortOrder}
                onChange={(e) => setForm({ ...form, sortOrder: Number(e.target.value) || 0 })}
              />
            </div>
            <div className="flex items-center gap-3">
              <Switch
                id="rem-active"
                checked={form.isActive}
                onCheckedChange={(v) => setForm({ ...form, isActive: v })}
              />
              <Label htmlFor="rem-active">Aktiv</Label>
            </div>
            <div className="md:col-span-2 flex justify-end gap-2 pt-2">
              <Button
                variant="ghost"
                onClick={() => {
                  setShowForm(false);
                  setForm(emptyForm());
                }}
              >
                Abbrechen
              </Button>
              <Button onClick={submit} disabled={createMut.isPending || updateMut.isPending}>
                {form.id ? "Speichern" : "Anlegen"}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {q.isLoading ? (
        <p className="text-sm text-muted-foreground">Lade …</p>
      ) : list.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Noch keine Erinnerungen für diesen Standort angelegt.
        </p>
      ) : (
        <div className="divide-y rounded-lg border">
          {list.map((r) => {
            const swatch = COLOR_SWATCH[r.color] ?? "bg-slate-500";
            return (
              <div key={r.id} className="flex items-center gap-3 px-3 py-2">
                <span className={`h-4 w-4 shrink-0 rounded-full ${swatch}`} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">
                    {r.emoji && <span className="mr-1">{r.emoji}</span>}
                    {r.title}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {WEEKDAYS[r.weekday]} · {r.fromTime}–{r.untilTime} ·{" "}
                    {r.intervalWeeks === 2
                      ? `alle 2 Wochen (Anker ${r.anchorDate ?? "—"})`
                      : "wöchentlich"}
                  </div>
                </div>
                <Switch
                  checked={r.isActive}
                  onCheckedChange={() => toggleActiveMut.mutate(r)}
                  aria-label="Aktiv"
                />
                <Button size="sm" variant="ghost" onClick={() => startEdit(r)}>
                  Bearbeiten
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    if (confirm(`Erinnerung "${r.title}" löschen?`)) deleteMut.mutate(r.id);
                  }}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
