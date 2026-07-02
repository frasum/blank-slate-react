// SecondWaiterSelect — Dropdown der aktiven Kellner der eigenen Organisation.
//
// Datenquelle: listOrgWaiters (createServerFn, requireSupabaseAuth).
// `value` / `onValueChange` arbeiten mit der staff_id (UUID), angezeigt wird
// der displayName. "none" ist der UI-interne Sentinelwert für "kein Kellner";
// nach außen wird stets null gemeldet, der Server speichert niemals "none".

import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { listOrgWaiters } from "@/lib/cash/cash.functions";

const NONE = "none";

export type SecondWaiterSelectProps = {
  value: string | null;
  onValueChange: (v: string | null) => void;
  disabled?: boolean;
  /** Staff-IDs, die nicht angeboten werden sollen (i. d. R. die eigene). */
  excludeStaffIds?: string[];
  placeholder?: string;
};

export function SecondWaiterSelect({
  value,
  onValueChange,
  disabled,
  excludeStaffIds = [],
  placeholder = "— kein zweiter Kellner —",
}: SecondWaiterSelectProps) {
  const fetchWaiters = useServerFn(listOrgWaiters);
  const q = useQuery({
    queryKey: ["cash", "org-waiters"],
    queryFn: () => fetchWaiters(),
    staleTime: 60_000,
  });

  const options = useMemo(() => {
    const all = q.data ?? [];
    const excludeIds = new Set(excludeStaffIds);
    // Aktuell gewählte ID NIE herausfiltern, sonst zeigt das Trigger leer an.
    return all.filter((s) => s.id === value || !excludeIds.has(s.id));
  }, [q.data, excludeStaffIds, value]);

  return (
    <Select
      value={value && value.length > 0 ? value : NONE}
      onValueChange={(v) => onValueChange(v === NONE ? null : v)}
      disabled={disabled || q.isLoading}
    >
      <SelectTrigger className="w-full">
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={NONE}>{placeholder}</SelectItem>
        {options.map((s) => (
          <SelectItem key={s.id} value={s.id}>
            {s.displayName}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
