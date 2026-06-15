// Paint-Modus: ein Skill (oder Eraser) ist aktiv → Klick in Zelle
// legt direkt an / löscht ohne Popover.
import { Brush, Eraser } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { RosterSkill } from "@/lib/roster/roster.functions";

export type PaintSelection = { kind: "skill"; skillId: string } | { kind: "eraser" } | null;

type Props = {
  enabled: boolean;
  onToggle: () => void;
  skills: RosterSkill[];
  active: PaintSelection;
  onChange: (s: PaintSelection) => void;
};

export function PaintToolbar({ enabled, onToggle, skills, active, onChange }: Props) {
  const eraserActive = active?.kind === "eraser";
  const activeSkillId = active?.kind === "skill" ? active.skillId : null;
  return (
    <div
      role="toolbar"
      aria-label="Paint-Modus"
      className={cn(
        "flex flex-wrap items-center gap-2 rounded-md border px-3 py-2 text-xs transition-colors",
        enabled ? "border-primary/40 bg-primary/5" : "border-border bg-muted/30",
      )}
    >
      <Button
        size="sm"
        variant={enabled ? "default" : "outline"}
        onClick={onToggle}
        aria-pressed={enabled}
        className="h-7"
      >
        <Brush className="mr-1.5 h-3.5 w-3.5" />
        Paint-Modus {enabled ? "an" : "aus"}
      </Button>
      {enabled && (
        <>
          <div className="flex flex-wrap items-center gap-1.5">
            {skills.map((s) => {
              const selected = s.id === activeSkillId;
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => onChange({ kind: "skill", skillId: s.id })}
                  aria-pressed={selected}
                  aria-label={`Pinsel: ${s.name}`}
                  style={{ backgroundColor: s.color ?? "#9ca3af" }}
                  className={cn(
                    "rounded px-2 py-0.5 text-[11px] font-bold text-white transition-all",
                    selected
                      ? "ring-2 ring-foreground ring-offset-1 ring-offset-background"
                      : "opacity-70 hover:opacity-100",
                  )}
                >
                  {s.name}
                </button>
              );
            })}
            {skills.length === 0 && (
              <span className="text-muted-foreground">Keine Skills im Pool.</span>
            )}
          </div>
          <Button
            size="sm"
            variant={eraserActive ? "destructive" : "outline"}
            onClick={() => onChange({ kind: "eraser" })}
            aria-pressed={eraserActive}
            className="ml-auto h-7"
          >
            <Eraser className="mr-1.5 h-3.5 w-3.5" />
            Radiergummi
          </Button>
        </>
      )}
    </div>
  );
}
