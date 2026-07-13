// G1a Scheibe 2 — 1:1 aus src/routes/_authenticated/admin/zeit-uebersicht.tsx
// extrahiert. Verhaltensgleich; Props-Verträge unverändert.

import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { ZeitSkeleton } from "@/components/ui/page-skeletons";
import {
  fmtDDMM,
  nextPeriodFromLast,
  periodDefaultEnd,
  periodDefaultStart,
  periodLabelForEnd,
} from "@/lib/time/zeit-uebersicht-core";

export type Period = {
  id: string;
  label: string;
  startDate: string;
  endDate: string;
  status: "open" | "locked";
};

export function PeriodsPanel({
  periods,
  isAdmin,
  isLoading,
  onCreate,
  onToggleLock,
  onDelete,
  pending,
}: {
  periods: Period[];
  isAdmin: boolean;
  isLoading: boolean;
  onCreate: (vars: { label: string; startDate: string; endDate: string }) => void;
  onToggleLock: (id: string) => void;
  onDelete: (id: string) => void;
  pending: boolean;
}) {
  const [label, setLabel] = useState<string>(periodLabelForEnd(periodDefaultEnd()));
  const [startDate, setStartDate] = useState<string>(periodDefaultStart());
  const [endDate, setEndDate] = useState<string>(periodDefaultEnd());

  const hasAny = periods.length > 0;
  const latestEnd = hasAny ? periods[0].endDate : null;

  return (
    <div className="space-y-4">
      {isAdmin && (
        <Card className="p-4 space-y-3">
          <div className="text-sm font-medium">Neue Periode anlegen</div>
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1">
              <Label htmlFor="p-label">Label</Label>
              <Input
                id="p-label"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                className="w-40"
                placeholder="z. B. Juli 2026"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="p-from">Von</Label>
              <Input
                id="p-from"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="p-to">Bis</Label>
              <Input
                id="p-to"
                type="date"
                value={endDate}
                onChange={(e) => {
                  setEndDate(e.target.value);
                  setLabel(periodLabelForEnd(e.target.value));
                }}
              />
            </div>
            <Button
              disabled={pending || !label.trim()}
              onClick={() => onCreate({ label: label.trim(), startDate, endDate })}
            >
              Anlegen
            </Button>
            {hasAny && latestEnd && (
              <Button
                variant="outline"
                disabled={pending}
                onClick={() => {
                  const np = nextPeriodFromLast(latestEnd);
                  onCreate(np);
                }}
              >
                Nächste Periode
              </Button>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            Perioden laufen vom 26. bis zum 25. des Folgemonats. Das Label bezieht sich auf den
            Monat des Enddatums.
          </p>
        </Card>
      )}

      {isLoading ? (
        <ZeitSkeleton />
      ) : periods.length === 0 ? (
        <Card className="p-6 text-center text-sm text-muted-foreground">
          Noch keine Perioden. Legen Sie die erste Periode an.
        </Card>
      ) : (
        <div className="space-y-2">
          {periods.map((p) => (
            <Card key={p.id} className="p-3 flex items-center gap-3">
              <div className="flex-1">
                <div className="font-medium">{p.label}</div>
                <div className="text-xs text-muted-foreground tabular-nums">
                  {fmtDDMM(p.startDate)} – {fmtDDMM(p.endDate)}
                </div>
              </div>
              <span
                className={
                  p.status === "open"
                    ? "rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800"
                    : "rounded-full bg-gray-200 px-2 py-0.5 text-xs font-medium text-gray-700"
                }
              >
                {p.status === "open" ? "Offen" : "Gesperrt"}
              </span>
              {isAdmin && (
                <>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={pending}
                    onClick={() => onToggleLock(p.id)}
                  >
                    {p.status === "open" ? "Sperren" : "Entsperren"}
                  </Button>
                  {p.status === "open" && (
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={pending}
                      onClick={() => {
                        if (confirm(`Periode „${p.label}" wirklich löschen?`)) {
                          onDelete(p.id);
                        }
                      }}
                    >
                      Löschen
                    </Button>
                  )}
                </>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

// Z3 — Umhängen-Popover je Zeile: listet alle Einträge der Person in dieser
// Woche mit einem Abteilungs-Select (begrenzt auf ihre Zuordnungen am
