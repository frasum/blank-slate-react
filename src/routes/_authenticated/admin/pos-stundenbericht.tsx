// PV3 — POS-Stundenbericht als eigene Route (früher zweiter Inline-Tab von
// /admin/pos-verkauf). Zeigt PosHourlyView je Standort; Upload admin-only.

import { useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listPosHourlyStats, replacePosHourlyStats } from "@/lib/bestellung/pos-hourly.functions";
import { PosHourlyView } from "@/components/bestellung/PosHourlyView";
import { listLocations } from "@/lib/admin/locations.functions";
import { LocationPills } from "@/components/shared/LocationPills";
import { useAuth } from "@/hooks/use-auth";
import { PosNav } from "@/components/bestellung/PosNav";

export const Route = createFileRoute("/_authenticated/admin/pos-stundenbericht")({
  head: () => ({ meta: [{ title: "POS-Stundenbericht · Auswertungen" }] }),
  component: PosStundenberichtPage,
});

function PosStundenberichtPage() {
  const callListHourly = useServerFn(listPosHourlyStats);
  const callReplaceHourly = useServerFn(replacePosHourlyStats);
  const auth = useAuth();
  const isAdmin = auth.identity?.role === "admin";

  const locationsQ = useQuery({ queryKey: ["locations"], queryFn: () => listLocations() });
  const locations = useMemo(() => locationsQ.data ?? [], [locationsQ.data]);

  const [locationId, setLocationId] = useState<string>("");
  useEffect(() => {
    if (!locationId && locations.length > 0) setLocationId(locations[0].id);
  }, [locations, locationId]);

  return (
    <div className="space-y-4">
      <PosNav />
      <div>
        <h2 className="text-lg font-semibold text-foreground">POS-Stundenbericht</h2>
        <p className="text-sm text-muted-foreground">
          Vectron-Stundenberichte je Standort (Buchungen &amp; Umsatz pro Stunde).
        </p>
      </div>

      <LocationPills locations={locations} value={locationId} onChange={setLocationId} />

      <PosHourlyView
        locationId={locationId}
        isAdmin={isAdmin}
        onList={(input) => callListHourly({ data: input })}
        onReplace={(input) => callReplaceHourly({ data: input })}
      />
    </div>
  );
}