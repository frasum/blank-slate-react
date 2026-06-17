import { format, parseISO } from "date-fns";
import { de } from "date-fns/locale";
import { CalendarIcon, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

interface DateSelectorProps {
  /** ISO date string yyyy-MM-dd */
  date: string;
  onDateChange: (date: string) => void;
}

function toIso(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function todayIso(): string {
  return toIso(new Date());
}

export function DateSelector({ date, onDateChange }: DateSelectorProps) {
  const current = parseISO(date);

  const goToPreviousDay = () => {
    const d = new Date(current);
    d.setDate(d.getDate() - 1);
    onDateChange(toIso(d));
  };

  const goToNextDay = () => {
    const d = new Date(current);
    d.setDate(d.getDate() + 1);
    onDateChange(toIso(d));
  };

  const goToToday = () => {
    onDateChange(todayIso());
  };

  const isToday = date === todayIso();

  return (
    <div className="flex items-center gap-2">
      <Button variant="outline" size="icon" onClick={goToPreviousDay} className="shrink-0">
        <ChevronLeft className="h-4 w-4" />
      </Button>

      <Popover>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            className={cn(
              "min-w-[200px] justify-start text-left font-normal",
              !date && "text-muted-foreground",
            )}
          >
            <CalendarIcon className="mr-2 h-4 w-4" />
            {format(current, "EEEE, d. MMMM yyyy", { locale: de })}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            mode="single"
            selected={current}
            onSelect={(d) => d && onDateChange(toIso(d))}
            initialFocus
            locale={de}
            className="pointer-events-auto"
          />
        </PopoverContent>
      </Popover>

      <Button variant="outline" size="icon" onClick={goToNextDay} className="shrink-0">
        <ChevronRight className="h-4 w-4" />
      </Button>

      {!isToday && (
        <Button variant="secondary" size="sm" onClick={goToToday}>
          Heute
        </Button>
      )}
    </div>
  );
}