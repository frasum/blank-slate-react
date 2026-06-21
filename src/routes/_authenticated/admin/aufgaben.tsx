import { useMemo, useState, useEffect } from "react";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { listLocations } from "@/lib/admin/locations.functions";
import { listStaff } from "@/lib/admin/staff.functions";
import { KanbanBoard } from "@/components/aufgaben/KanbanBoard";
import { LocationPills } from "@/components/shared/LocationPills";

export const Route = createFileRoute("/_authenticated/admin/aufgaben")({
  head: () => ({ meta: [{ title: "Aufgaben · Verwaltung" }] }),
  beforeLoad: ({ context }) => {
    // Payroll wurde im Admin-Layout schon umgeleitet — hier zusätzlich
    // hart absichern, falls jemand /admin/aufgaben direkt aufruft.
    if (context.identity.role === "payroll") {
      throw redirect({ to: "/admin/zeit-uebersicht" });
    }
  },
  component: AufgabenPage,
});

function AufgabenPage() {
  const { identity } = Route.useRouteContext();
  const locsQ = useQuery({ queryKey: ["admin", "locations"], queryFn: () => listLocations() });
  const staffQ = useQuery({ queryKey: ["admin", "staff"], queryFn: () => listStaff() });

  const [locationId, setLocationId] = useState<string>("");
  useEffect(() => {
    if (!locationId && locsQ.data && locsQ.data.length > 0) {
      setLocationId(locsQ.data[0].id);
    }
  }, [locsQ.data, locationId]);

  const staffForLocation = useMemo(() => {
    if (!locationId) return [];
    return (staffQ.data ?? [])
      .filter((s) => s.isActive && s.locationIds.includes(locationId))
      .map((s) => ({ id: s.id, name: s.displayName }));
  }, [staffQ.data, locationId]);

  const canCreate = identity.role === "admin" || identity.role === "manager";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Aufgaben</h1>
        <p className="text-sm text-muted-foreground">
          Kanban-Board pro Standort. Manager-Ansicht (Phase 1).
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium text-muted-foreground">Standort:</span>
        <LocationPills locations={locsQ.data ?? []} value={locationId} onChange={setLocationId} />
      </div>

      {locationId ? (
        <KanbanBoard locationId={locationId} staff={staffForLocation} canCreate={canCreate} />
      ) : (
        <p className="text-sm text-muted-foreground">Bitte einen Standort wählen.</p>
      )}
    </div>
  );
}
