// SD3 — Skill-Zuweisung per Popover in der Personalliste. Ersetzt den
// entfernten Skills-Tab im Stammblatt: Skills gruppiert nach Bereich
// (Küche/Service/Geschäftsleitung/Sonstiges), Mehrfachauswahl per Klick
// auf die Pille, Zähler je Gruppe, unten Speichern + Abbrechen.
//
// Reine UI-Komponente — Speichern delegiert an den Aufrufer, damit die
// bestehende Server-Function `assignStaffSkills` genau einen Aufrufer
// (die Personalliste) behält.

import { useEffect, useMemo, useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { SkillCategory } from "@/lib/admin/skills.functions";
import { cn } from "@/lib/utils";

type SkillRow = {
  id: string;
  name: string;
  category: SkillCategory;
  color: string | null;
};

const CATEGORY_LABEL: Record<SkillCategory, string> = {
  kitchen: "Küche",
  service: "Service",
  gl: "Geschäftsleitung",
  other: "Sonstiges",
};
const CATEGORY_ORDER: SkillCategory[] = ["kitchen", "service", "gl", "other"];

export function SkillAssignPopover({
  skills,
  currentIds,
  disabled,
  pending,
  trigger,
  onSave,
}: {
  skills: SkillRow[];
  currentIds: string[];
  disabled?: boolean;
  pending?: boolean;
  trigger: React.ReactNode;
  onSave: (nextIds: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(() => new Set(currentIds));

  // Beim Öffnen aktuellen Bestand übernehmen — bewusst nicht auf jede
  // Änderung von `currentIds` neu setzen, damit ein optimistisches Update
  // während der Speicherrunde die noch offene Auswahl nicht überschreibt.
  useEffect(() => {
    if (open) setSelected(new Set(currentIds));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const grouped = useMemo(() => {
    const m = new Map<SkillCategory, SkillRow[]>();
    for (const s of skills) {
      const list = m.get(s.category) ?? [];
      list.push(s);
      m.set(s.category, list);
    }
    return m;
  }, [skills]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild disabled={disabled}>
        {trigger}
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[min(22rem,calc(100vw-2rem))] space-y-4">
        <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Skills zuweisen
        </div>
        {skills.length === 0 && (
          <p className="text-xs text-muted-foreground">Noch keine Skills angelegt.</p>
        )}
        {CATEGORY_ORDER.map((cat) => {
          const items = grouped.get(cat);
          if (!items || items.length === 0) return null;
          const catSel = items.filter((i) => selected.has(i.id)).length;
          return (
            <div key={cat} className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  {CATEGORY_LABEL[cat]}
                </span>
                <span className="text-xs tabular-nums text-muted-foreground">
                  {catSel}/{items.length}
                </span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {items.map((sk) => {
                  const has = selected.has(sk.id);
                  const color = sk.color ?? undefined;
                  return (
                    <button
                      key={sk.id}
                      type="button"
                      onClick={() => {
                        const next = new Set(selected);
                        if (has) next.delete(sk.id);
                        else next.add(sk.id);
                        setSelected(next);
                      }}
                      className={cn(
                        "inline-flex min-w-[36px] items-center justify-center rounded-md border-2 px-2.5 py-1 text-xs font-bold transition-all hover:scale-105",
                        !has && "border-muted-foreground/30 bg-transparent text-muted-foreground",
                      )}
                      style={
                        color && has
                          ? { backgroundColor: color, borderColor: color, color: "#fff" }
                          : undefined
                      }
                    >
                      {sk.name}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
        <div className="flex justify-end gap-2 border-t border-border pt-3">
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="rounded-md border border-input bg-background px-3 py-1.5 text-xs font-medium text-foreground hover:bg-accent"
          >
            Abbrechen
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={() => {
              onSave(Array.from(selected));
              setOpen(false);
            }}
            className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {pending ? "Speichern…" : "Speichern"}
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
}