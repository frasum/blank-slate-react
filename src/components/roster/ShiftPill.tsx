// Schicht-Pille im Grid. Service nutzt service-marker.ts (z. B. X/GL/B/19h/H),
// Küche zeigt die Skill-Farbe + Abkürzung. Per dnd-kit draggable.
import { useDraggable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { cn } from "@/lib/utils";
import type { RosterShift } from "@/lib/roster/roster.functions";
import { serviceMarker } from "@/lib/roster/service-marker";
import { DENSITY_PILL_CLASS, type Density } from "@/hooks/use-density";

function abbr(s: string | null | undefined): string {
  if (!s) return "";
  return s.trim().slice(0, 2).toUpperCase();
}

type Props = {
  shift: RosterShift;
  area: "kitchen" | "service";
  draggable: boolean;
  onClick: () => void;
  density?: Density;
};

export function ShiftPill({ shift, area, draggable, onClick, density = "normal" }: Props) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `shift:${shift.id}`,
    data: { shift },
    disabled: !draggable,
  });

  const isService = area === "service";
  const label = isService ? serviceMarker(shift.skillName) : abbr(shift.skillName);
  const serviceColorMap: Record<string, string> = {
    GL: "#f59e0b",
    B: "#3b82f6",
    H: "#10b981",
    "19h": "#8b5cf6",
  };
  const serviceBg = isService ? serviceColorMap[label] : undefined;
  const bg = isService
    ? (serviceBg ?? "#ffffff")
    : (shift.skillColor ?? "#9ca3af");
  const textCls =
    isService && !serviceBg
      ? "text-foreground border-foreground/40"
      : "text-white border-transparent";
  const opacity = shift.status === "confirmed" ? 1 : 0.7;

  const style: React.CSSProperties = {
    transform: CSS.Translate.toString(transform),
    backgroundColor: bg,
    opacity: isDragging ? 0.4 : opacity,
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
        DENSITY_PILL_CLASS[density],
        textCls,
        draggable && "cursor-grab active:cursor-grabbing",
      )}
    >
      {label}
    </button>
  );
}
