// G1a Scheibe 2 — 1:1 aus src/routes/_authenticated/admin/zeit-uebersicht.tsx
// extrahiert. Verhaltensgleich; Props-Verträge unverändert.

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { WeeklyExportRow } from "@/lib/time/weekly-export";
import { DEPT_LABEL, type Department, type WeeklyEntry } from "@/lib/time/zeit-uebersicht-core";

// Z3 — Umhängen-Popover je Zeile: listet alle Einträge der Person in dieser
// Woche mit einem Abteilungs-Select (begrenzt auf ihre Zuordnungen am
// Standort). NULL („—") ist erlaubt und stellt den Ur-Zustand
// (Bestandsdaten/Stempel) wieder her.
export function ReassignPopover({
  row,
  entriesById,
  onReassign,
  pending,
  staffDeptsByStaff,
}: {
  row: WeeklyExportRow;
  entriesById: Map<string, WeeklyEntry>;
  onReassign: (id: string, department: Department | null) => void;
  pending: boolean;
  staffDeptsByStaff: Map<string, Department[]>;
}) {
  const staffDepts = staffDeptsByStaff.get(row.staffId) ?? [row.department];
  const entries = [...entriesById.values()]
    .filter((e) => e.staffId === row.staffId)
    .sort((a, b) => a.businessDate.localeCompare(b.businessDate));
  if (entries.length === 0) return null;
  const NULL_TOKEN = "__null__";
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="absolute bottom-0 right-0.5 text-[10px] leading-none text-muted-foreground hover:text-foreground underline decoration-dotted opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity"
          title="Einträge einer Abteilung zuordnen"
          disabled={pending}
        >
          umhängen
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 p-3 space-y-2">
        <div className="text-xs font-medium">{row.displayName} — Einträge dieser Woche</div>
        {entries.map((e) => {
          const current = e.rawDepartment ?? null;
          return (
            <div key={e.id} className="flex items-center gap-2 text-xs">
              <span className="tabular-nums w-24 truncate">
                {e.businessDate.slice(8, 10)}.{e.businessDate.slice(5, 7)}.{" "}
                {new Date(e.startedAt).toLocaleTimeString("de-DE", {
                  hour: "2-digit",
                  minute: "2-digit",
                  timeZone: "Europe/Berlin",
                })}
              </span>
              <Select
                value={current ?? NULL_TOKEN}
                disabled={pending}
                onValueChange={(v) => {
                  const next = v === NULL_TOKEN ? null : (v as Department);
                  if (next === current) return;
                  onReassign(e.id, next);
                }}
              >
                <SelectTrigger className="h-7 flex-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NULL_TOKEN}>— (Primär)</SelectItem>
                  {staffDepts.map((d) => (
                    <SelectItem key={d} value={d}>
                      {DEPT_LABEL[d]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          );
        })}
      </PopoverContent>
    </Popover>
  );
}
