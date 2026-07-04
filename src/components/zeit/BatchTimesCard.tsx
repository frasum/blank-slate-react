// BZ1 — Admin-Card „Schichtzeiten anpassen" auf /admin/zeit-uebersicht.
//
// Portierung aus Legacy-tagesabrechnung (ShiftTimeOverride). Drei Sektionen,
// je eigene Auswahl. Nur für Admins gerendert (Server-Function ist zusätzlich
// admin-gated).

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { ChevronDown, Eye, EyeOff, Pencil, Search } from "lucide-react";
import { listStaff } from "@/lib/admin/staff.functions";
import {
  getBatchTimeSettings,
  runBatchTimes,
  updateBatchTimeSettings,
} from "@/lib/time/batch-times.functions";

type Mode = "override" | "create_weekdays" | "create_daily";

const SECTIONS: { mode: Mode; title: string; description: string; button: string }[] = [
  {
    mode: "override",
    title: "Bestehende Schichten überschreiben",
    description:
      "Setzt bestehende eigene Schichten des Standorts auf die Standardzeiten. Wo keine Schicht existiert, passiert nichts.",
    button: "Überschreiben",
  },
  {
    mode: "create_weekdays",
    title: "Mo–Fr Schichten erzeugen & anpassen",
    description:
      "Erzeugt Mo–Fr Schichten mit den Standardzeiten (Feiertage bekommen die Sonn-/Feiertagszeiten). Bestehende Schichten am selben Standort werden angepasst.",
    button: "Mo–Fr anwenden",
  },
  {
    mode: "create_daily",
    title: "Tägliche Schichten erzeugen (Mo–So)",
    description:
      "Erzeugt für JEDEN Tag der Periode Schichten. Bestehende Schichten am selben Standort werden angepasst.",
    button: "Täglich anwenden",
  },
];

const DEPT_LABEL: Record<string, string> = {
  kitchen: "Küche",
  service: "Service",
  gl: "GL",
};

const HIDDEN_KEY = "coco-batch-hidden";

function loadHidden(): Record<string, string[]> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(HIDDEN_KEY);
    return raw ? (JSON.parse(raw) as Record<string, string[]>) : {};
  } catch {
    return {};
  }
}

function saveHidden(state: Record<string, string[]>): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(HIDDEN_KEY, JSON.stringify(state));
  } catch {
    /* noop */
  }
}

export function BatchTimesCard({
  locationId,
  periodStart,
  periodEnd,
  periodLabel,
}: {
  locationId: string;
  periodStart: string;
  periodEnd: string;
  periodLabel: string;
}) {
  const qc = useQueryClient();
  const fetchStaff = useServerFn(listStaff);
  const fetchSettings = useServerFn(getBatchTimeSettings);
  const callRun = useServerFn(runBatchTimes);
  const callUpdate = useServerFn(updateBatchTimeSettings);

  const staffQ = useQuery({ queryKey: ["batch-staff"], queryFn: () => fetchStaff() });
  const settingsQ = useQuery({
    queryKey: ["batch-time-settings"],
    queryFn: () => fetchSettings(),
  });

  const [hidden, setHidden] = useState<Record<string, string[]>>(() => loadHidden());
  const [selected, setSelected] = useState<Record<Mode, string[]>>({
    override: [],
    create_weekdays: [],
    create_daily: [],
  });
  const [searchQuery, setSearchQuery] = useState("");
  const [showHidden, setShowHidden] = useState(false);
  const [confirmMode, setConfirmMode] = useState<Mode | null>(null);
  const [editOpen, setEditOpen] = useState(false);

  const staffRows = useMemo(() => {
    const rows = staffQ.data ?? [];
    return rows
      .filter((s) => s.isActive && s.locationIds.includes(locationId))
      .map((s) => {
        const ld = s.locationDepartments.find((d) => d.locationId === locationId);
        const dept = ld?.department ?? s.departments[0] ?? "service";
        const label = `${s.displayName} – ${s.firstName} (${s.displayName}) ${s.lastName} (${DEPT_LABEL[dept] ?? dept})`;
        return { id: s.id, label, dept };
      })
      .sort((a, b) => a.label.localeCompare(b.label, "de"));
  }, [staffQ.data, locationId]);

  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return staffRows;
    return staffRows.filter((r) => r.label.toLowerCase().includes(q));
  }, [staffRows, searchQuery]);

  const runMut = useMutation({
    mutationFn: (vars: { mode: Mode; staffIds: string[] }) =>
      callRun({
        data: {
          locationId,
          periodStart,
          periodEnd,
          mode: vars.mode,
          staffIds: vars.staffIds,
        },
      }),
    onSuccess: (res) => {
      const skipParts: string[] = [];
      if (res.skipped.locked) skipParts.push(`${res.skipped.locked} gesperrt`);
      if (res.skipped.absence) skipParts.push(`${res.skipped.absence} Abwesenheit`);
      if (res.skipped["other-location"])
        skipParts.push(`${res.skipped["other-location"]} Fremd-Standort`);
      if (res.skipped["no-entry"]) skipParts.push(`${res.skipped["no-entry"]} ohne Eintrag`);
      const skipTotal =
        res.skipped.locked +
        res.skipped.absence +
        res.skipped["other-location"] +
        res.skipped["no-entry"];
      const skipSuffix = skipTotal
        ? `, ${skipTotal} übersprungen${skipParts.length ? ` (${skipParts.join(", ")})` : ""}`
        : "";
      toast.success(`${res.updated} angepasst, ${res.created} erzeugt${skipSuffix}`);
      qc.invalidateQueries({ queryKey: ["weekly-entries"] });
      qc.invalidateQueries({ queryKey: ["time-overview"] });
    },
    onError: (e) => toast.error((e as Error).message || "Batch fehlgeschlagen"),
  });

  const updateMut = useMutation({
    mutationFn: (vars: {
      weekdayStart: string;
      weekdayEnd: string;
      sunholStart: string;
      sunholEnd: string;
    }) => callUpdate({ data: vars }),
    onSuccess: () => {
      toast.success("Standardzeiten aktualisiert");
      qc.invalidateQueries({ queryKey: ["batch-time-settings"] });
      setEditOpen(false);
    },
    onError: (e) => toast.error((e as Error).message || "Speichern fehlgeschlagen"),
  });

  const toggleHidden = (mode: Mode, staffId: string) => {
    setHidden((prev) => {
      const arr = prev[mode] ?? [];
      const next = arr.includes(staffId) ? arr.filter((x) => x !== staffId) : [...arr, staffId];
      const state = { ...prev, [mode]: next };
      saveHidden(state);
      return state;
    });
  };

  const toggleSelect = (mode: Mode, staffId: string) => {
    setSelected((prev) => {
      const arr = prev[mode];
      return {
        ...prev,
        [mode]: arr.includes(staffId) ? arr.filter((x) => x !== staffId) : [...arr, staffId],
      };
    });
  };

  const selectAll = (mode: Mode, visibleIds: string[]) => {
    setSelected((prev) => ({
      ...prev,
      [mode]: prev[mode].length === visibleIds.length ? [] : visibleIds,
    }));
  };

  const settings = settingsQ.data;
  const confirmSection = SECTIONS.find((s) => s.mode === confirmMode);

  return (
    <Card className="p-4">
      <Collapsible>
        <CollapsibleTrigger asChild>
          <button
            type="button"
            className="flex w-full items-center justify-between text-left"
          >
            <div>
              <h2 className="text-lg font-semibold">Schichtzeiten anpassen (Admin)</h2>
              <p className="text-sm text-muted-foreground">
                Batch-Werkzeug für Gehalts-/GL-Personal, das nicht stempelt. Standardzeiten:{" "}
                {settings ? (
                  <>
                    Werktags {settings.weekdayStart}–{settings.weekdayEnd}, Sonn-/Feiertag{" "}
                    {settings.sunholStart}–{settings.sunholEnd}
                  </>
                ) : (
                  "—"
                )}
              </p>
            </div>
            <ChevronDown className="h-5 w-5 text-muted-foreground" />
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent className="mt-4 space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-[220px]">
              <Search className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Suche…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-8"
              />
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setShowHidden((v) => !v)}
            >
              {showHidden ? <EyeOff className="mr-1 h-4 w-4" /> : <Eye className="mr-1 h-4 w-4" />}
              {showHidden ? "Ausgeblendete verbergen" : "Ausgeblendete zeigen"}
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={() => setEditOpen(true)}>
              <Pencil className="mr-1 h-4 w-4" />
              Standardzeiten
            </Button>
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            {SECTIONS.map((section) => {
              const hiddenIds = hidden[section.mode] ?? [];
              const visibleRows = filtered.filter(
                (r) => showHidden || !hiddenIds.includes(r.id),
              );
              const visibleIds = visibleRows.map((r) => r.id);
              const sel = selected[section.mode];
              return (
                <div
                  key={section.mode}
                  className="rounded-lg border border-border bg-muted/20 p-3 space-y-2"
                >
                  <div>
                    <h3 className="text-sm font-semibold">{section.title}</h3>
                    <p className="text-xs text-muted-foreground mt-1">{section.description}</p>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <button
                      type="button"
                      className="text-primary underline"
                      onClick={() => selectAll(section.mode, visibleIds)}
                    >
                      {sel.length === visibleIds.length && visibleIds.length > 0
                        ? "Auswahl aufheben"
                        : "Alle auswählen"}
                    </button>
                    <span className="text-muted-foreground">
                      {sel.length}/{visibleRows.length}
                    </span>
                  </div>
                  <div className="max-h-72 overflow-auto rounded border border-border bg-background">
                    {visibleRows.length === 0 ? (
                      <div className="p-3 text-xs text-muted-foreground">Keine Mitarbeiter.</div>
                    ) : (
                      <ul className="divide-y divide-border">
                        {visibleRows.map((r) => {
                          const isHidden = hiddenIds.includes(r.id);
                          const isSelected = sel.includes(r.id);
                          return (
                            <li
                              key={r.id}
                              className={`flex items-center gap-2 px-2 py-1 text-xs ${
                                isHidden ? "opacity-50" : ""
                              }`}
                            >
                              <Checkbox
                                checked={isSelected}
                                onCheckedChange={() => toggleSelect(section.mode, r.id)}
                                disabled={isHidden}
                              />
                              <span className="flex-1 truncate" title={r.label}>
                                {r.label}
                              </span>
                              <button
                                type="button"
                                onClick={() => toggleHidden(section.mode, r.id)}
                                title={isHidden ? "Wieder einblenden" : "Ausblenden"}
                                className="text-muted-foreground hover:text-foreground"
                              >
                                {isHidden ? (
                                  <EyeOff className="h-3.5 w-3.5" />
                                ) : (
                                  <Eye className="h-3.5 w-3.5" />
                                )}
                              </button>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    className="w-full"
                    disabled={sel.length === 0 || runMut.isPending || !locationId}
                    onClick={() => setConfirmMode(section.mode)}
                  >
                    {section.button}
                  </Button>
                </div>
              );
            })}
          </div>
        </CollapsibleContent>
      </Collapsible>

      <AlertDialog
        open={confirmMode !== null}
        onOpenChange={(open) => !open && setConfirmMode(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{confirmSection?.title}</AlertDialogTitle>
            <AlertDialogDescription>
              {confirmMode
                ? `${selected[confirmMode].length} Mitarbeiter × Periode ${periodLabel} — fortfahren?`
                : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Abbrechen</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (!confirmMode) return;
                runMut.mutate({ mode: confirmMode, staffIds: selected[confirmMode] });
                setConfirmMode(null);
              }}
            >
              Fortfahren
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <SettingsDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        initial={settings}
        pending={updateMut.isPending}
        onSave={(v) => updateMut.mutate(v)}
      />
    </Card>
  );
}

function SettingsDialog({
  open,
  onOpenChange,
  initial,
  pending,
  onSave,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  initial:
    | { weekdayStart: string; weekdayEnd: string; sunholStart: string; sunholEnd: string }
    | undefined;
  pending: boolean;
  onSave: (v: {
    weekdayStart: string;
    weekdayEnd: string;
    sunholStart: string;
    sunholEnd: string;
  }) => void;
}) {
  const [wStart, setWStart] = useState("17:00");
  const [wEnd, setWEnd] = useState("01:00");
  const [sStart, setSStart] = useState("15:00");
  const [sEnd, setSEnd] = useState("02:00");

  useEffect(() => {
    if (!open || !initial) return;
    setWStart(initial.weekdayStart);
    setWEnd(initial.weekdayEnd);
    setSStart(initial.sunholStart);
    setSEnd(initial.sunholEnd);
  }, [open, initial]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Standardzeiten bearbeiten</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label>Werktags Beginn</Label>
            <Input type="time" value={wStart} onChange={(e) => setWStart(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>Werktags Ende</Label>
            <Input type="time" value={wEnd} onChange={(e) => setWEnd(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>Sonn-/Feiertag Beginn</Label>
            <Input type="time" value={sStart} onChange={(e) => setSStart(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>Sonn-/Feiertag Ende</Label>
            <Input type="time" value={sEnd} onChange={(e) => setSEnd(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Abbrechen
          </Button>
          <Button
            disabled={pending}
            onClick={() =>
              onSave({
                weekdayStart: wStart,
                weekdayEnd: wEnd,
                sunholStart: sStart,
                sunholEnd: sEnd,
              })
            }
          >
            Speichern
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}