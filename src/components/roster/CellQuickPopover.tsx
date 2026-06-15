// Klick in eine leere Zelle ohne aktiven Paint-Modus → Skill wählen
// und Schicht anlegen. Profil-Skills oben, weitere darunter.
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { CalendarX, CalendarCheck } from "lucide-react";
import type { RosterSkill } from "@/lib/roster/roster.functions";

type Props = {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  children: React.ReactNode;
  profileSkills: RosterSkill[];
  otherSkills: RosterSkill[];
  busy: boolean;
  onPick: (skillId: string) => void;
  isUnavailable: boolean;
  onSetUnavailable: () => void;
  onClearUnavailable: () => void;
};

export function CellQuickPopover({
  open,
  onOpenChange,
  children,
  profileSkills,
  otherSkills,
  busy,
  onPick,
  isUnavailable,
  onSetUnavailable,
  onClearUnavailable,
}: Props) {
  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent
        align="center"
        sideOffset={4}
        className="w-64 p-3"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-2 text-xs font-medium">Schicht anlegen — Skill wählen</div>
        {profileSkills.length > 0 && (
          <div className="mb-2">
            <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Profil-Skills
            </p>
            <div className="flex flex-wrap gap-1.5">
              {profileSkills.map((s) => (
                <SkillChip key={s.id} skill={s} disabled={busy} onClick={() => onPick(s.id)} />
              ))}
            </div>
          </div>
        )}
        {otherSkills.length > 0 && (
          <div>
            <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Weitere
            </p>
            <div className="flex flex-wrap gap-1.5">
              {otherSkills.map((s) => (
                <SkillChip
                  key={s.id}
                  skill={s}
                  disabled={busy}
                  faded
                  onClick={() => onPick(s.id)}
                />
              ))}
            </div>
          </div>
        )}
        {profileSkills.length === 0 && otherSkills.length === 0 && (
          <span className="text-xs text-muted-foreground">Keine passenden Skills hinterlegt.</span>
        )}
        <div className="mt-3 border-t pt-2">
          <Button
            size="sm"
            variant="outline"
            disabled={busy}
            onClick={isUnavailable ? onClearUnavailable : onSetUnavailable}
            className="h-7 w-full text-xs"
          >
            {isUnavailable ? (
              <>
                <CalendarCheck className="mr-1.5 h-3.5 w-3.5" /> Verfügbarkeit wiederherstellen
              </>
            ) : (
              <>
                <CalendarX className="mr-1.5 h-3.5 w-3.5" /> Als nicht verfügbar markieren
              </>
            )}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function SkillChip({
  skill,
  disabled,
  faded,
  onClick,
}: {
  skill: RosterSkill;
  disabled: boolean;
  faded?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`rounded px-2 py-1 text-[11px] font-bold text-white transition-opacity disabled:opacity-40 ${
        faded ? "opacity-70 hover:opacity-100" : ""
      }`}
      style={{ backgroundColor: skill.color ?? "#9ca3af" }}
    >
      {skill.name}
    </button>
  );
}
