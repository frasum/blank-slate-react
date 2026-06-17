// Monats-/Periodennavigation im Stil von thaitime.pro (ScheduleGridToolbar).
// ‹‹ / ›› → ganze Periode wechseln.
// ‹  / ›  → Datumsfenster um 14 Tage verschieben (Halb-Offset).
// "Heute" → springt zur Periode mit dem heutigen Datum, Halb-Offset = 0.
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

type Period = { id: string; label: string; startDate: string; endDate: string };

type Props = {
  periods: Period[];
  currentPeriodId: string | null;
  halfOffset: boolean;
  hasTodayJump: boolean;
  onPrevPeriod: () => void;
  onNextPeriod: () => void;
  onPrevHalf: () => void;
  onNextHalf: () => void;
  onToday: () => void;
};

const btnBase =
  "h-10 rounded-full border border-gray-400 bg-white text-gray-700 transition-all hover:opacity-80 flex items-center justify-center touch-manipulation disabled:opacity-40 disabled:cursor-not-allowed";

export function PeriodNav({
  periods,
  currentPeriodId,
  halfOffset,
  hasTodayJump,
  onPrevPeriod,
  onNextPeriod,
  onPrevHalf,
  onNextHalf,
  onToday,
}: Props) {
  if (periods.length === 0) return null;
  const idx = periods.findIndex((p) => p.id === currentPeriodId);
  const safeIdx = idx >= 0 ? idx : 0;
  const current = periods[safeIdx];
  const prev = safeIdx > 0 ? periods[safeIdx - 1] : null;
  const next = safeIdx < periods.length - 1 ? periods[safeIdx + 1] : null;
  // Halb-Offset überquert Periodengrenze: ‹ ist nur sperrbar, wenn wir schon
  // an der ersten Hälfte der ersten Periode stehen; › entsprechend am Ende.
  const canPrevHalf = halfOffset || !!prev;
  const canNextHalf = !halfOffset || !!next;
  const label = halfOffset && next ? `${current.label} / ${next.label}` : current.label;

  return (
    <div className="flex items-center gap-1">
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={onToday}
            disabled={!hasTodayJump}
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
            onClick={onNextPeriod}
            disabled={!next}
            className={cn(btnBase, "w-10")}
          >
            <ChevronsLeft className="h-5 w-5" strokeWidth={2} />
          </button>
        </TooltipTrigger>
        <TooltipContent>Nächste Periode</TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={onPrevHalf}
            disabled={!canPrevHalf}
            className={cn(btnBase, "w-10")}
          >
            <ChevronLeft className="h-5 w-5" strokeWidth={2} />
          </button>
        </TooltipTrigger>
        <TooltipContent>2 Wochen zurück</TooltipContent>
      </Tooltip>

      <span className="min-w-32 whitespace-nowrap text-center text-sm font-semibold">{label}</span>

      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={onNextHalf}
            disabled={!canNextHalf}
            className={cn(btnBase, "w-10")}
          >
            <ChevronRight className="h-5 w-5" strokeWidth={2} />
          </button>
        </TooltipTrigger>
        <TooltipContent>2 Wochen vor</TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={onPrevPeriod}
            disabled={!prev}
            className={cn(btnBase, "w-10")}
          >
            <ChevronsRight className="h-5 w-5" strokeWidth={2} />
          </button>
        </TooltipTrigger>
        <TooltipContent>Vorherige Periode</TooltipContent>
      </Tooltip>
    </div>
  );
}
