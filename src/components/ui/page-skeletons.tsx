import { Skeleton } from "@/components/ui/skeleton";
import { Card } from "@/components/ui/card";

// Wiederverwendbare Loading-Skelette für Admin-Seiten. Ersetzen einfache
// „Lade…"-Textplatzhalter durch strukturähnliche Pulsbalken.

function SkeletonRow({ cols }: { cols: number }) {
  return (
    <div className="flex gap-3 border-b border-border/50 px-4 py-3 last:border-b-0">
      {Array.from({ length: cols }).map((_, i) => (
        <Skeleton key={i} className="h-4 flex-1" />
      ))}
    </div>
  );
}

function TableSkeleton({ cols, rows }: { cols: number; rows: number }) {
  return (
    <Card className="overflow-hidden p-0">
      <div className="flex gap-3 border-b border-border bg-muted/30 px-4 py-3">
        {Array.from({ length: cols }).map((_, i) => (
          <Skeleton key={i} className="h-3 flex-1 bg-primary/15" />
        ))}
      </div>
      {Array.from({ length: rows }).map((_, i) => (
        <SkeletonRow key={i} cols={cols} />
      ))}
    </Card>
  );
}

export function KassePageSkeleton() {
  return <TableSkeleton cols={6} rows={5} />;
}

export function ZeitSkeleton() {
  return <TableSkeleton cols={7} rows={6} />;
}

export function DienstplanSkeleton() {
  return (
    <Card className="p-4">
      <div className="grid grid-cols-7 gap-2">
        {Array.from({ length: 7 }).map((_, i) => (
          <Skeleton key={`h-${i}`} className="h-4 w-full bg-primary/15" />
        ))}
        {Array.from({ length: 7 * 5 }).map((_, i) => (
          <Skeleton key={`c-${i}`} className="h-16 w-full" />
        ))}
      </div>
    </Card>
  );
}
