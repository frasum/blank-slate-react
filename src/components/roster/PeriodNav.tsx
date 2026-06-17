// Monats-/Periodennavigation im Stil von thaitime.pro (ScheduleGridToolbar).
// Pfeile blättern in der Perioden-Reihenfolge; "Heute" springt zur Periode,
// die das heutige Datum enthält.
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

type Period = { id: string; label: string; startDate: string; endDate: string };

type Props = {
  periods: Period[];
  currentPeriodId: string | null;
  today: string;
  onSelect: (periodId: string) => void;
};

const btnBase =
  "h-10 rounded-full border border-gray-400 bg-white text-gray-700 transition-all hover:opacity-80 flex items-center justify-center touch-manipulation disabled:opacity-40 disabled:cursor-not-allowed";

export function PeriodNav({ periods, currentPeriodId, today, onSelect }: Props) {
  if (periods.length === 0) return null;
  const idx = periods.findIndex((p) => p.id === currentPeriodId);
  const safeIdx = idx >= 0 ? idx : 0;
  const current = periods[safeIdx];
  const first = periods[0];
  const last = periods[periods.length - 1];
  const prev = safeIdx > 0 ? periods[safeIdx - 1] : null;
  const next = safeIdx < periods.length - 1 ? periods[safeIdx + 1] : null;
  const todayPeriod = periods.find((p) => p.startDate <= today && today <= p.endDate) ?? null;

  return (
    <div className="flex items-center gap-1">
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={() => todayPeriod && onSelect(todayPeriod.id)}
            disabled={!todayPeriod || todayPeriod.id === current.id}
            className={cn(btnBase, "px-4")}
          >
            <span className="text-sm font-medium">Heute</span>
          </button>
        </TooltipTrigger>
        <TooltipContent>Zur aktuellen Periode</TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={() => onSelect(first.id)}
            disabled={current.id === first.id}
            className={cn(btnBase, "w-10")}
          >
            <ChevronsLeft className="h-5 w-5" strokeWidth={2} />
          </button>
        </TooltipTrigger>
        <TooltipContent>Erste Periode</TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={() => prev && onSelect(prev.id)}
            disabled={!prev}
            className={cn(btnBase, "w-10")}
          >
            <ChevronLeft className="h-5 w-5" strokeWidth={2} />
          </button>
        </TooltipTrigger>
        <TooltipContent>Vorherige Periode</TooltipContent>
      </Tooltip>

      <span className="min-w-32 whitespace-nowrap text-center text-sm font-semibold">
        {current.label}
      </span>

      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={() => next && onSelect(next.id)}
            disabled={!next}
            className={cn(btnBase, "w-10")}
          >
            <ChevronRight className="h-5 w-5" strokeWidth={2} />
          </button>
        </TooltipTrigger>
        <TooltipContent>Nächste Periode</TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={() => onSelect(last.id)}
            disabled={current.id === last.id}
            className={cn(btnBase, "w-10")}
          >
            <ChevronsRight className="h-5 w-5" strokeWidth={2} />
          </button>
        </TooltipTrigger>
        <TooltipContent>Letzte Periode</TooltipContent>
      </Tooltip>
    </div>
  );
}
