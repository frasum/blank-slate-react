import { Input } from "@/components/ui/input";
import { focusNextInput } from "@/lib/cash/kasse-helpers";

export function ExcelSectionHeader({ label, colorClass }: { label: string; colorClass: string }) {
  return (
    <div className={`bg-muted/50 px-3 py-2 border-y border-l-4 ${colorClass}`}>
      <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
    </div>
  );
}

export function ExcelInputRow({
  label,
  value,
  onChange,
  disabled,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
}) {
  return (
    <tr className="border-b last:border-b-0 hover:bg-muted/20 transition-colors">
      <td className="px-3 py-1.5 font-medium text-foreground">{label}</td>
      <td className="px-3 py-1.5 w-36">
        <Input
          className="h-7 text-sm text-right font-mono border-primary/20 bg-primary/5"
          inputMode="decimal"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onFocus={(e) => e.currentTarget.select()}
          onMouseUp={(e) => e.preventDefault()}
          onClick={(e) => e.currentTarget.select()}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              focusNextInput(e.currentTarget);
            }
          }}
          disabled={disabled}
        />
      </td>
    </tr>
  );
}

export function ExcelReadonlyRow({ label, value }: { label: string; value: string }) {
  return (
    <tr className="border-b last:border-b-0 hover:bg-muted/20 transition-colors">
      <td className="px-3 py-1.5 font-medium text-foreground">{label}</td>
      <td className="px-3 py-1.5 w-36 text-right font-mono tabular-nums text-sm">{value}</td>
    </tr>
  );
}
