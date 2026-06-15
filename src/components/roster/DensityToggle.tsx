// 4-State Segmented Control: kompakt / normal / komfortabel / fit.
import { cn } from "@/lib/utils";
import type { Density } from "@/hooks/use-density";

const OPTIONS: { value: Density; label: string }[] = [
  { value: "compact", label: "Kompakt" },
  { value: "normal", label: "Normal" },
  { value: "comfortable", label: "Komfort" },
  { value: "fit", label: "Fit" },
];

type Props = {
  value: Density;
  onChange: (d: Density) => void;
};

export function DensityToggle({ value, onChange }: Props) {
  return (
    <div className="inline-flex overflow-hidden rounded-md border border-input text-[11px]">
      {OPTIONS.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          aria-pressed={value === o.value}
          className={cn(
            "px-2 py-1 transition-colors",
            value === o.value
              ? "bg-foreground text-background"
              : "bg-background text-muted-foreground hover:text-foreground",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
