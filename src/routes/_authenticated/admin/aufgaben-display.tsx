import { useEffect, useState } from "react";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { listLocations } from "@/lib/admin/locations.functions";
import { LocationPills } from "@/components/shared/LocationPills";
import { RemindersAdmin } from "@/components/aufgaben/RemindersAdmin";

export const Route = createFileRoute("/_authenticated/admin/aufgaben-display")({
  head: () => ({ meta: [{ title: "Aufgaben-Display · Verwaltung" }] }),
  beforeLoad: ({ context }) => {
    if (context.identity.role === "payroll") {
      throw redirect({ to: "/admin/zeit-uebersicht" });
    }
  },
  component: AufgabenDisplayPage,
});

function AufgabenDisplayPage() {
  const locsQ = useQuery({ queryKey: ["admin", "locations"], queryFn: () => listLocations() });
  const [locationId, setLocationId] = useState<string>("");
  useEffect(() => {
    if (!locationId && locsQ.data && locsQ.data.length > 0) {
      setLocationId(locsQ.data[0].id);
    }
  }, [locsQ.data, locationId]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Aufgaben-Display</h1>
        <p className="text-sm text-muted-foreground">
          Wiederkehrende Erinnerungen für das Standort-Display.
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium text-muted-foreground">Standort:</span>
        <LocationPills locations={locsQ.data ?? []} value={locationId} onChange={setLocationId} />
      </div>
      {locationId ? (
        <RemindersAdmin locationId={locationId} />
      ) : (
        <p className="text-sm text-muted-foreground">Bitte einen Standort wählen.</p>
      )}
    </div>
  );
}