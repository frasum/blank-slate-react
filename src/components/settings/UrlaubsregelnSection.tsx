// RT1/UZ1 — Section „Urlaubszählung" in Org-Einstellungen.
// Umschalter, ob gesetzliche Feiertage als Urlaubstage zählen.

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  getOrgSettings,
  setCountHolidaysAsLeave,
} from "@/lib/admin/org-settings.functions";

export function UrlaubsregelnSection({ canEdit }: { canEdit: boolean }) {
  const qc = useQueryClient();
  const callSet = useServerFn(setCountHolidaysAsLeave);
  const q = useQuery({ queryKey: ["admin", "org-settings"], queryFn: () => getOrgSettings() });
  const [value, setValue] = useState<boolean>(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    if (q.data) setValue(q.data.countHolidaysAsLeave);
  }, [q.data]);

  const mut = useMutation({
    mutationFn: (v: boolean) => callSet({ data: { countHolidaysAsLeave: v } }),
    onSuccess: async () => {
      setMsg("Gespeichert.");
      await qc.invalidateQueries({ queryKey: ["admin", "org-settings"] });
    },
    onError: (e: unknown) => setMsg(e instanceof Error ? e.message : "Fehler."),
  });

  return (
    <section className="space-y-4 rounded-lg border border-border bg-card p-5">
      <div>
        <h2 className="text-base font-semibold text-foreground">Urlaubszählung</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Standard: Gesetzliche (bayerische) Feiertage werden NICHT als Urlaubstag gezählt.
          Der Schalter kehrt die Regel um. Die Zählung wird immer live berechnet — bestehende
          Anträge zeigen nach einer Umstellung ggf. andere Tageszahlen als bei Antragstellung.
          Das ist gewollt (eine Regel, eine Zählung).
        </p>
      </div>
      <label className="flex items-start gap-3">
        <input
          type="checkbox"
          checked={value}
          disabled={!canEdit || mut.isPending}
          onChange={(e) => {
            const v = e.target.checked;
            setValue(v);
            setMsg(null);
            mut.mutate(v);
          }}
          className="mt-0.5 h-4 w-4"
        />
        <span className="text-sm">
          <span className="font-medium">Feiertage zählen als Urlaubstage</span>
          <span className="mt-0.5 block text-xs text-muted-foreground">
            Aktiviert: klassische Zählung — jeder Tag im Antragszeitraum zählt. Deaktiviert:
            Feiertage im Zeitraum werden vom Kontingent abgezogen.
          </span>
        </span>
      </label>
      {msg && <p className="text-xs text-muted-foreground">{msg}</p>}
    </section>
  );
}