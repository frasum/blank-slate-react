// Eingabeformular für Urlaubs-/Krank-Zeitraum (Von / Bis).
// Wird in CellQuickPopover und PillConfirmPopover eingebettet, wenn der
// Nutzer einen Abwesenheitstyp gewählt hat.
import * as React from "react";
import { format } from "date-fns";
import { de } from "date-fns/locale";
import { CalendarIcon, Umbrella, HeartPulse } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

function isoFromDate(d: Date): string {
  // lokale Tagesgrenze beibehalten — der Picker liefert Tage in lokaler Zeitzone.
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function dateFromIso(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function countShiftsInRange(staffShiftDates: string[], fromIso: string, toIso: string): number {
  let n = 0;
  for (const d of staffShiftDates) {
    if (d >= fromIso && d <= toIso) n++;
  }
  return n;
}

type Props = {
  type: "urlaub" | "krank";
  defaultDate: string;
  staffShiftDates: string[];
  busy: boolean;
  onCancel: () => void;
  onSubmit: (fromIso: string, toIso: string) => void | Promise<void>;
};

export function AbsenceRangeForm({
  type,
  defaultDate,
  staffShiftDates,
  busy,
  onCancel,
  onSubmit,
}: Props) {
  const [fromIso, setFromIso] = React.useState(defaultDate);
  const [toIso, setToIso] = React.useState(defaultDate);
  const [fromOpen, setFromOpen] = React.useState(false);
  const [toOpen, setToOpen] = React.useState(false);

  const valid = toIso >= fromIso;
  const conflictCount = valid ? countShiftsInRange(staffShiftDates, fromIso, toIso) : 0;

  const label = type === "urlaub" ? "Urlaub eintragen" : "Krank eintragen";
  const Icon = type === "urlaub" ? Umbrella : HeartPulse;
  const iconColor = type === "urlaub" ? "text-green-600" : "text-red-600";

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1.5 text-xs font-medium">
        <Icon className={cn("h-3.5 w-3.5", iconColor)} />
        {label}
      </div>
      <div className="grid grid-cols-[auto_1fr] items-center gap-1.5 text-xs">
        <span className="text-muted-foreground">Von</span>
        <Popover open={fromOpen} onOpenChange={setFromOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className="h-7 justify-start text-left text-xs font-normal"
            >
              <CalendarIcon className="mr-1.5 h-3.5 w-3.5" />
              {format(dateFromIso(fromIso), "dd.MM.yyyy", { locale: de })}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar
              mode="single"
              selected={dateFromIso(fromIso)}
              onSelect={(d) => {
                if (!d) return;
                const iso = isoFromDate(d);
                setFromIso(iso);
                if (iso > toIso) setToIso(iso);
                setFromOpen(false);
              }}
              initialFocus
              className={cn("pointer-events-auto p-3")}
            />
          </PopoverContent>
        </Popover>
        <span className="text-muted-foreground">Bis</span>
        <Popover open={toOpen} onOpenChange={setToOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className="h-7 justify-start text-left text-xs font-normal"
            >
              <CalendarIcon className="mr-1.5 h-3.5 w-3.5" />
              {format(dateFromIso(toIso), "dd.MM.yyyy", { locale: de })}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar
              mode="single"
              selected={dateFromIso(toIso)}
              onSelect={(d) => {
                if (!d) return;
                setToIso(isoFromDate(d));
                setToOpen(false);
              }}
              disabled={(d) => isoFromDate(d) < fromIso}
              initialFocus
              className={cn("pointer-events-auto p-3")}
            />
          </PopoverContent>
        </Popover>
      </div>
      {conflictCount > 0 ? (
        <p className="text-[11px] text-amber-600">
          Hinweis: {conflictCount} {conflictCount === 1 ? "Schicht wird" : "Schichten werden"} im
          Zeitraum entfernt.
        </p>
      ) : (
        <p className="text-[11px] text-muted-foreground">Keine Schichten im Zeitraum.</p>
      )}
      <div className="flex justify-end gap-1.5 pt-1">
        <Button
          size="sm"
          variant="ghost"
          disabled={busy}
          onClick={onCancel}
          className="h-7 text-xs"
        >
          Abbrechen
        </Button>
        <Button
          size="sm"
          disabled={busy || !valid}
          onClick={() => void onSubmit(fromIso, toIso)}
          className="h-7 text-xs"
        >
          Eintragen
        </Button>
      </div>
    </div>
  );
}
