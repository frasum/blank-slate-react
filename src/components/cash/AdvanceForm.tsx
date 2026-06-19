import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { parseEuroToCents } from "@/lib/cash/kasse-helpers";

export function AdvanceForm({
  writable,
  staff,
  onAdd,
}: {
  writable: boolean;
  staff: { id: string; displayName: string }[];
  onAdd: (staffId: string, cents: number, note: string | null) => Promise<unknown>;
}) {
  const [staffId, setStaffId] = useState<string>(staff[0]?.id ?? "");
  useEffect(() => {
    if (!staffId && staff[0]) setStaffId(staff[0].id);
  }, [staff, staffId]);
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [pending, setPending] = useState(false);
  const cents = parseEuroToCents(amount);
  return (
    <div className="flex flex-wrap items-end gap-2">
      <select
        className="min-w-[10rem] rounded-md border border-input bg-background px-3 py-2 text-sm disabled:opacity-50"
        value={staffId}
        onChange={(e) => setStaffId(e.target.value)}
        disabled={!writable}
      >
        {staff.map((s) => (
          <option key={s.id} value={s.id}>
            {s.displayName}
          </option>
        ))}
      </select>
      <Input
        className="min-w-[10rem] flex-1"
        placeholder="Notiz (optional)"
        value={note}
        onChange={(e) => setNote(e.target.value)}
        disabled={!writable}
      />
      <Input
        className="w-28 text-right font-mono"
        inputMode="decimal"
        placeholder="€"
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
        disabled={!writable}
      />
      <Button
        size="sm"
        disabled={!writable || !staffId || cents === null || cents <= 0 || pending}
        onClick={async () => {
          setPending(true);
          try {
            await onAdd(staffId, cents!, note.trim() === "" ? null : note.trim());
            setAmount("");
            setNote("");
          } finally {
            setPending(false);
          }
        }}
      >
        Vorschuss hinzufügen
      </Button>
    </div>
  );
}
