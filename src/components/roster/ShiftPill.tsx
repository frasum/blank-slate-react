// Schicht-Pille im Grid. Service nutzt service-marker.ts (z. B. X/GL/B/19h/H),
// Küche zeigt die Skill-Farbe + Abkürzung. Per dnd-kit draggable.
import { useDraggable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { cn } from "@/lib/utils";
import type { RosterShift } from "@/lib/roster/roster.functions";
import { serviceMarker } from "@/lib/roster/service-marker";

const FIT_PILL_CLASS = "h-5 w-8 text-[9px]";

function abbr(s: string | null | undefined): string {
  if (!s) return "";
  return s.trim().slice(0, 2).toUpperCase();
}

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
  const serviceColorMap: Record<string, string> = {
    GL: "#f59e0b",
    B: "#3b82f6",
    H: "#10b981",
    "19h": "#8b5cf6",
  };
  const serviceBg = isService ? serviceColorMap[label] : undefined;
  const bg = isService ? (serviceBg ?? "#ffffff") : (shift.skillColor ?? "#9ca3af");
  const textCls = "text-white border-transparent";
  const isPlanned = shift.status !== "confirmed";
  // Küchen-Skillfarben aus der DB sind eher pastellig; deutlich kräftiger
  // ziehen, damit sie optisch zum Service (feste, kräftige Farben) passen.
  const kitchenFilter = isPlanned
    ? "saturate(2.2) brightness(0.92)"
    : "saturate(2.6) brightness(0.82)";
  const serviceFilter = isPlanned
    ? "saturate(1.1) brightness(1)"
    : "saturate(1.2) brightness(0.95)";
  const style: React.CSSProperties = {
    transform: CSS.Translate.toString(transform),
    backgroundColor: bg,
    opacity: isDragging ? 0.4 : 1,
    filter: isService ? serviceFilter : kitchenFilter,
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
        textCls,
        draggable && "cursor-grab active:cursor-grabbing",
      )}
    >
      {label}
    </button>
  );
}
