// Schicht-Pille im Grid. Service nutzt service-marker.ts (z. B. X/GL/B/19h/H),
// Küche zeigt die Skill-Farbe + Abkürzung. Per dnd-kit draggable.
import { useDraggable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { cn } from "@/lib/utils";
import type { RosterShift } from "@/lib/roster/roster.functions";
import { serviceMarker } from "@/lib/roster/service-marker";
import { abbr, pillStyle } from "@/lib/roster/pill-style";

const FIT_PILL_CLASS = "h-5 w-8 text-[9px]";

type Props = {
  shift: RosterShift;
  area: "kitchen" | "service";
  draggable: boolean;
  onClick: () => void;
};

export function ShiftPill({ shift, area, draggable, onClick }: Props) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `shift:${shift.id}`,
    data: { shift },
    disabled: !draggable,
  });

  const isService = area === "service";
  const label = isService ? serviceMarker(shift.skillName) : abbr(shift.skillName);
  const status: "planned" | "confirmed" = shift.status === "confirmed" ? "confirmed" : "planned";
  const { backgroundColor, textClass } = pillStyle({
    skillColor: shift.skillColor,
    area,
    label,
    status,
  });
  const isDefaultService = isService && label === "X";
  const style: React.CSSProperties = {
    transform: CSS.Translate.toString(transform),
    backgroundColor,
    opacity: isDragging ? 0.4 : 1,
  };

  return (
    <button
      ref={setNodeRef}
      type="button"
      style={style}
      onClick={(e) => {
        if (isDragging) return;
        e.stopPropagation();
        onClick();
      }}
      {...listeners}
      {...attributes}
      title={`${shift.skillName ?? "—"} (${shift.status})`}
      className={cn(
        "mx-auto flex items-center justify-center rounded border font-bold leading-none transition-shadow hover:shadow-md",
        FIT_PILL_CLASS,
        textClass,
        draggable && "cursor-grab active:cursor-grabbing",
      )}
    >
      <span className={cn(isDefaultService && "text-[13px] leading-none")}>{label}</span>
    </button>
  );
}
