import { useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { listLocations } from "@/lib/admin/locations.functions";
import {
  listLocationDepartmentDefaults,
  upsertLocationDepartmentDefault,
} from "@/lib/admin/location-defaults.functions";

export const Route = createFileRoute("/_authenticated/admin/standortzeiten")({
  head: () => ({ meta: [{ title: "Standortzeiten · Verwaltung" }] }),
  component: Page,
});

type Dept = "kitchen" | "service" | "gl";
const DEPTS: { value: Dept; label: string }[] = [
  { value: "kitchen", label: "Küche" },
  { value: "service", label: "Service" },
  { value: "gl", label: "GL (optional)" },
];

type DraftMap = Record<string, { checkin: string; checkout: string }>;
const key = (loc: string, dept: Dept) => `${loc}:${dept}`;

function Page() {
  const qc = useQueryClient();
  const fnLocs = useServerFn(listLocations);
  const fnList = useServerFn(listLocationDepartmentDefaults);
  const fnUpsert = useServerFn(upsertLocationDepartmentDefault);

  const locQ = useQuery({ queryKey: ["admin", "locations"], queryFn: () => fnLocs() });
  const defQ = useQuery({
    queryKey: ["admin", "location-department-defaults"],
    queryFn: () => fnList(),
  });

  const [draft, setDraft] = useState<DraftMap>({});

  // Server-Werte als Ausgangs-Draft übernehmen.
  const serverMap = useMemo(() => {
    const m: DraftMap = {};
    for (const r of defQ.data ?? []) {
      m[key(r.locationId, r.department)] = {
        checkin: r.defaultCheckin ?? "",
        checkout: r.defaultCheckout ?? "",
      };
    }
    return m;
  }, [defQ.data]);

  useEffect(() => {
    setDraft(serverMap);
  }, [serverMap]);

  const upsertMut = useMutation({
    mutationFn: (vars: {
      locationId: string;
      department: Dept;
      checkin: string;
      checkout: string;
    }) =>
      fnUpsert({
        data: {
          locationId: vars.locationId,
          department: vars.department,
          defaultCheckin: vars.checkin,
          defaultCheckout: vars.checkout || null,
        },
      }),
    onSuccess: () => {
      toast.success("Gespeichert.");
      void qc.invalidateQueries({ queryKey: ["admin", "location-department-defaults"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (locQ.isLoading || defQ.isLoading) {
    return <div className="p-4 text-sm text-muted-foreground">Lädt…</div>;
  }
  if (locQ.error || defQ.error) {
    return <div className="p-4 text-sm text-destructive">Daten konnten nicht geladen werden.</div>;
  }

  return (
    <div className="space-y-4 p-4">
      <div>
        <h1 className="text-lg font-semibold">Standortzeiten</h1>
        <p className="text-sm text-muted-foreground">
          Standard-Beginn und Standard-Ende je Standort und Bereich. Diese Werte werden bei der
          Eröffnung einer Tages-Session als Plan-Snapshot in den Trinkgeld-Pool eingefroren.
          GL-Werte sind optional — GL nimmt nicht am Trinkgeld teil.
        </p>
      </div>
      {(locQ.data ?? []).map((loc) => (
        <Card key={loc.id} className="p-4">
          <div className="mb-2 text-sm font-medium">{loc.name}</div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Bereich</TableHead>
                <TableHead className="w-40">Standard-Beginn</TableHead>
                <TableHead className="w-40">Standard-Ende</TableHead>
                <TableHead className="w-32"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {DEPTS.map((d) => {
                const k = key(loc.id, d.value);
                const dv = draft[k] ?? { checkin: "", checkout: "" };
                const sv = serverMap[k] ?? { checkin: "", checkout: "" };
                const dirty = dv.checkin !== sv.checkin || dv.checkout !== sv.checkout;
                return (
                  <TableRow key={d.value}>
                    <TableCell>{d.label}</TableCell>
                    <TableCell>
                      <Input
                        type="time"
                        value={dv.checkin}
                        onChange={(e) =>
                          setDraft({ ...draft, [k]: { ...dv, checkin: e.target.value } })
                        }
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        type="time"
                        value={dv.checkout}
                        onChange={(e) =>
                          setDraft({ ...draft, [k]: { ...dv, checkout: e.target.value } })
                        }
                      />
                    </TableCell>
                    <TableCell>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={!dirty || !dv.checkin || upsertMut.isPending}
                        onClick={() =>
                          upsertMut.mutate({
                            locationId: loc.id,
                            department: d.value,
                            checkin: dv.checkin,
                            checkout: dv.checkout,
                          })
                        }
                      >
                        Speichern
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
          <div className="mt-2 text-xs text-muted-foreground">
            Hinweis: Für GL kann „Beginn" gespeichert werden, ist aber für den Snapshot irrelevant —
            GL-Zeilen werden ohne Standardzeit angelegt.
          </div>
        </Card>
      ))}
    </div>
  );
}
