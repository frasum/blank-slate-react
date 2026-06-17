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
  // Feste Farben für Küchen-Skills (Abkürzungen aus abbr()):
  // VS=Blau, PA=Rot (PASS), SP=Grün (SPÜLEN), CO=Orange.
  const kitchenColorMap: Record<string, string> = {
    VS: "#00bfff",
    PA: "#ef4444",
    SP: "#10b981",
    CO: "#f59e0b",
  };
  const serviceBg = isService ? serviceColorMap[label] : undefined;
  const kitchenBg = !isService ? kitchenColorMap[label] : undefined;
  const isDefaultService = isService && label === "X";
  const bg = isService
    ? (serviceBg ?? "#ffffff")
    : (kitchenBg ?? shift.skillColor ?? "#9ca3af");
  const textCls = isDefaultService
    ? "text-black border-transparent"
    : "text-white border-transparent";
  const isPlanned = shift.status !== "confirmed";
  // BG nur leicht abdunkeln, damit der weiße Text gut kontrastiert, die
  // gewählte Farbe aber sichtbar bleibt. Für die Default-Service-Pille (X)
  // bleibt der Hintergrund weiß und der Text schwarz.
  const mixPct = isPlanned ? 92 : 85;
  const backgroundColor = isDefaultService
    ? "#ffffff"
    : `color-mix(in oklab, ${bg} ${mixPct}%, black)`;
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
        textCls,
        draggable && "cursor-grab active:cursor-grabbing",
      )}
    >
      {label}
    </button>
  );
}
