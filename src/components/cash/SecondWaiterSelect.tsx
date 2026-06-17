// SecondWaiterSelect — Dropdown der aktiven Kellner der eigenen Organisation.
//
// Datenquelle: listOrgWaiters (createServerFn, requireSupabaseAuth).
// "none" ist der UI-interne Sentinelwert für "kein Kellner"; nach außen
// wird stets null gemeldet, der Server speichert niemals den String "none".

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
  /** Anzeigenamen, die nicht angeboten werden sollen (z. B. bereits gewählte). */
  excludeNames?: string[];
  /** Staff-IDs, die nicht angeboten werden sollen (i. d. R. die eigene). */
  excludeStaffIds?: string[];
  placeholder?: string;
};

export function SecondWaiterSelect({
  value,
  onValueChange,
  disabled,
  excludeNames = [],
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
    const excludeN = new Set(excludeNames.filter((n): n is string => Boolean(n)));
    // Aktuell gewählten Namen NIE herausfiltern, sonst zeigt das Trigger den Wert leer an.
    return all.filter(
      (s) =>
        !excludeIds.has(s.id) &&
        (s.displayName === value || !excludeN.has(s.displayName)),
    );
  }, [q.data, excludeStaffIds, excludeNames, value]);

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
          <SelectItem key={s.id} value={s.displayName}>
            {s.displayName}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}