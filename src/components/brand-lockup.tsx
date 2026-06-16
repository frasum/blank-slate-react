// COCO Brand-Lockup. Zwei Größen: "lg" für Hub/Auth, "sm" für Admin-Header.
// Keine Hex-Werte — alles über Tokens (foreground / muted-foreground).

type Size = "lg" | "sm";

export function BrandLockup({ size = "lg" }: { size?: Size }) {
  if (size === "sm") {
    return (
      <div className="flex items-baseline gap-2">
        <span className="text-lg font-black tracking-tight text-foreground">COCO</span>
        <span className="hidden text-[10px] uppercase tracking-[0.25em] text-muted-foreground sm:inline">
          Central Operations Cockpit
        </span>
      </div>
    );
  }
  return (
    <div className="space-y-2 text-center">
      <h1 className="text-6xl font-black tracking-tight text-foreground md:text-7xl">COCO</h1>
      <p className="text-[11px] uppercase tracking-[0.3em] text-muted-foreground md:text-xs">
        Central Operations Cockpit
      </p>
    </div>
  );
}