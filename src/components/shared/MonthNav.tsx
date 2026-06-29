// Kalendermonat-Navigation im Hausstil (Vorbild: roster/PeriodNav).
// ◀ / ▶ wechseln Monate; Label öffnet Dropdown (letzte ~18 Monate);
// „Dieser Monat" springt zurück. Keine Zukunftsmonate.
import { ChevronLeft, ChevronRight } from "lucide-react";
import { format } from "date-fns";
import { de } from "date-fns/locale";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { addMonths, currentMonth } from "@/lib/statistics/period-window";
import { cn } from "@/lib/utils";

type Props = {
  value: string;
  onChange: (month: string) => void;
  maxMonth?: string;
};

const btnBase =
  "h-10 rounded-full border border-gray-400 bg-white text-gray-700 transition-all hover:opacity-80 flex items-center justify-center touch-manipulation disabled:opacity-40 disabled:cursor-not-allowed";

function monthLabel(yearMonth: string): string {
  return format(new Date(`${yearMonth}-01T00:00:00`), "LLLL yyyy", { locale: de });
}

export function MonthNav({ value, onChange, maxMonth }: Props) {
  const max = maxMonth ?? currentMonth();
  const atMax = value >= max;
  const isCurrent = value === currentMonth();

  const options: string[] = [];
  for (let i = 0; i < 18; i++) options.push(addMonths(max, -i));

  return (
    <div className="flex items-center gap-1">
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={() => onChange(addMonths(value, -1))}
            className={cn(btnBase, "w-10")}
          >
            <ChevronLeft className="h-5 w-5" strokeWidth={2} />
          </button>
        </TooltipTrigger>
        <TooltipContent>Vorheriger Monat</TooltipContent>
      </Tooltip>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className={cn(btnBase, "min-w-40 px-4 text-sm font-semibold capitalize")}
          >
            {monthLabel(value)}
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="center" className="max-h-80">
          {options.map((m) => (
            <DropdownMenuItem
              key={m}
              onSelect={() => onChange(m)}
              className={cn("capitalize", m === value && "bg-accent font-semibold")}
            >
              {monthLabel(m)}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={() => onChange(addMonths(value, 1))}
            disabled={atMax}
            className={cn(btnBase, "w-10")}
          >
            <ChevronRight className="h-5 w-5" strokeWidth={2} />
          </button>
        </TooltipTrigger>
        <TooltipContent>Nächster Monat</TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={() => onChange(currentMonth())}
            disabled={isCurrent}
            className={cn(btnBase, "ml-1 px-4 text-sm font-medium")}
          >
            Dieser Monat
          </button>
        </TooltipTrigger>
        <TooltipContent>Zum aktuellen Monat</TooltipContent>
      </Tooltip>
    </div>
  );
}