// Multi-Toggle-Chips: nur Mitarbeiter zeigen, die einen der gewählten
// Skills haben (ODER-Verknüpfung). Leere Auswahl = alle zeigen.
import { cn } from "@/lib/utils";
import type { RosterSkill } from "@/lib/roster/roster.functions";

type Props = {
  skills: RosterSkill[];
  selected: string[];
  onChange: (next: string[]) => void;
};

export function SkillFilterChips({ skills, selected, onChange }: Props) {
  const toggle = (id: string) => {
    if (selected.includes(id)) onChange(selected.filter((x) => x !== id));
    else onChange([...selected, id]);
  };
  if (skills.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-1.5 text-xs">
      <span className="text-muted-foreground">Filter:</span>
      {skills.map((s) => {
        const on = selected.includes(s.id);
        return (
          <button
            key={s.id}
            type="button"
            onClick={() => toggle(s.id)}
            aria-pressed={on}
            className={cn(
              "rounded-full border px-2 py-0.5 text-[11px] font-medium transition-colors",
              on
                ? "border-foreground bg-foreground text-background"
                : "border-border bg-background text-muted-foreground hover:text-foreground",
            )}
          >
            {s.name}
          </button>
        );
      })}
      {selected.length > 0 && (
        <button
          type="button"
          onClick={() => onChange([])}
          className="ml-1 text-[11px] text-muted-foreground underline-offset-2 hover:underline"
        >
          zurücksetzen
        </button>
      )}
    </div>
  );
}
