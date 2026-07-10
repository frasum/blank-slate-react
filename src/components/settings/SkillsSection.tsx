// SD3 — Zentrale Skill-Palette in Einstellungen. Zeigt alle globalen
// Skills gruppiert nach Bereich und öffnet pro Pille einen kleinen
// Farb-Popover (nur Admin). Anlage/Umbenennung von Skills gehören
// weiterhin nicht in die UI.

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { listSkills, updateSkillColor, type SkillCategory } from "@/lib/admin/skills.functions";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

type SkillRow = {
  id: string;
  name: string;
  category: SkillCategory;
  color: string | null;
  sortOrder: number;
};

const CATEGORY_LABEL: Record<SkillCategory, string> = {
  kitchen: "Küche",
  service: "Service",
  gl: "Geschäftsleitung",
  other: "Sonstiges",
};
const CATEGORY_ORDER: SkillCategory[] = ["kitchen", "service", "gl", "other"];

function chipBackground(color: string | null): string | undefined {
  if (!color) return undefined;
  if (color.toLowerCase() === "#ffffff") return "#ffffff";
  return `color-mix(in oklab, ${color} 85%, black)`;
}

export function SkillsSection({ canEdit }: { canEdit: boolean }) {
  const queryClient = useQueryClient();
  const skillsQ = useQuery({ queryKey: ["admin", "skills"], queryFn: () => listSkills() });
  const callUpdateColor = useServerFn(updateSkillColor);

  const colorMutation = useMutation({
    mutationFn: (vars: { skillId: string; color: string | null }) =>
      callUpdateColor({ data: vars }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["admin", "skills"] }),
        queryClient.invalidateQueries({ queryKey: ["skills"] }),
        queryClient.invalidateQueries({ queryKey: ["roster-shifts"] }),
        queryClient.invalidateQueries({ queryKey: ["roster-cross-bookings"] }),
      ]);
    },
    onError: (e: unknown) =>
      toast.error(e instanceof Error ? e.message : "Farbe konnte nicht gespeichert werden."),
  });

  if (skillsQ.isLoading) return <p className="text-sm text-muted-foreground">Lade Skills…</p>;
  const skills = (skillsQ.data ?? []) as SkillRow[];

  const grouped = new Map<SkillCategory, SkillRow[]>();
  for (const s of skills) {
    const list = grouped.get(s.category) ?? [];
    list.push(s);
    grouped.set(s.category, list);
  }

  return (
    <section className="space-y-4">
      <header>
        <h2 className="text-lg font-medium text-foreground">Skills</h2>
        <p className="text-xs text-muted-foreground">
          Farbe der globalen Skill-Pillen. Wirkt im Dienstplan-Grid und in der Tagesansicht.
          {!canEdit && " Nur Admin darf ändern."}
        </p>
      </header>
      {skills.length === 0 && (
        <p className="text-sm text-muted-foreground">Noch keine Skills angelegt.</p>
      )}
      {CATEGORY_ORDER.map((cat) => {
        const items = grouped.get(cat);
        if (!items || items.length === 0) return null;
        return (
          <div key={cat} className="rounded-lg border border-border bg-card/40 p-4">
            <div className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {CATEGORY_LABEL[cat]}
            </div>
            <div className="flex flex-wrap gap-2">
              {items.map((sk) => (
                <SkillColorChip
                  key={sk.id}
                  skill={sk}
                  canEdit={canEdit}
                  onColorChange={(color) => colorMutation.mutate({ skillId: sk.id, color })}
                />
              ))}
            </div>
          </div>
        );
      })}
    </section>
  );
}

function SkillColorChip({
  skill,
  canEdit,
  onColorChange,
}: {
  skill: SkillRow;
  canEdit: boolean;
  onColorChange: (color: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<string>(skill.color ?? "#9ca3af");
  useEffect(() => setDraft(skill.color ?? "#9ca3af"), [skill.color]);

  const bg = chipBackground(skill.color);
  const isWhite = (skill.color ?? "").toLowerCase() === "#ffffff";
  const textColor: string | undefined = skill.color ? (isWhite ? "#0a0a0a" : "#ffffff") : undefined;
  const borderColor = skill.color ?? undefined;

  return (
    <span
      className={cn(
        "inline-flex items-center overflow-hidden rounded-full border",
        !skill.color && "border-muted-foreground/30 text-muted-foreground",
      )}
      style={{ borderColor, backgroundColor: bg }}
    >
      <span className="px-3 py-1.5 text-sm font-medium" style={{ color: textColor }}>
        {skill.name}
      </span>
      {canEdit && (
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <button
              type="button"
              aria-label={`Farbe für ${skill.name} ändern`}
              className="mr-1 grid h-6 w-6 place-items-center rounded-full text-xs opacity-60 hover:opacity-100"
              style={{ color: textColor }}
            >
              ✎
            </button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-56 space-y-3">
            <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Farbe · {skill.name}
            </div>
            <input
              type="color"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              className="h-10 w-full cursor-pointer rounded border border-border bg-transparent"
            />
            <div className="flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => {
                  onColorChange(null);
                  setOpen(false);
                }}
                className="text-xs text-muted-foreground hover:text-foreground"
              >
                Zurücksetzen
              </button>
              <button
                type="button"
                onClick={() => {
                  onColorChange(draft);
                  setOpen(false);
                }}
                className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90"
              >
                Speichern
              </button>
            </div>
          </PopoverContent>
        </Popover>
      )}
    </span>
  );
}
