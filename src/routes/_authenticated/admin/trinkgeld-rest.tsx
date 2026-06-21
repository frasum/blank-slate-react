// Admin-only: aufgelaufener Trinkgeld-Restcent je Geschäftstag
// (Euro-Abrundung im Bargeld). Read-only. Zahlen kommen live aus
// getTipRemainderByPeriod und sind identisch mit dem „Rest", den die
// Kasse-Ansicht pro Tag zeigt.

import { useEffect, useState } from "react";
import { createFileRoute, useRouteContext } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getTipRemainderByPeriod } from "@/lib/cash/cash.functions";
import { listLocations } from "@/lib/admin/locations.functions";
import { listPeriods } from "@/lib/time/time-admin.functions";
import { LocationPills } from "@/components/shared/LocationPills";
import { fmtCents } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/admin/trinkgeld-rest")({
  head: () => ({ meta: [{ title: "Trinkgeld-Rest · Verwaltung" }] }),
  component: TipRemainderPage,
});

function TipRemainderPage() {
  const { identity } = useRouteContext({ from: "/_authenticated/admin" });
  const fetchLocations = useServerFn(listLocations);
  const fetchPeriods = useServerFn(listPeriods);
  const fetchRemainder = useServerFn(getTipRemainderByPeriod);

  const [locationId, setLocationId] = useState<string>("");
  const [periodId, setPeriodId] = useState<string>("");

  const locationsQ = useQuery({
    queryKey: ["admin-locations"],
    queryFn: () => fetchLocations(),
    enabled: identity.role === "admin",
  });
  const periodsQ = useQuery({
    queryKey: ["admin-periods"],
    queryFn: () => fetchPeriods(),
    enabled: identity.role === "admin",
  });

  useEffect(() => {
    if (!locationId && locationsQ.data && locationsQ.data.length > 0) {
      setLocationId(locationsQ.data[0].id);
    }
  }, [locationId, locationsQ.data]);
  useEffect(() => {
    if (!periodId && periodsQ.data && periodsQ.data.length > 0) {
      setPeriodId(periodsQ.data[0].id);
    }
  }, [periodId, periodsQ.data]);

  const period = periodsQ.data?.find((p) => p.id === periodId) ?? null;

  const remainderQ = useQuery({
    queryKey: ["admin", "tip-remainder", locationId, period?.startDate, period?.endDate],
    queryFn: () =>
      fetchRemainder({
        data: {
          locationId,
          startDate: period!.startDate,
          endDate: period!.endDate,
        },
      }),
    enabled: identity.role === "admin" && locationId !== "" && period !== null,
  });

  if (identity.role !== "admin") {
    return <p className="text-sm text-muted-foreground">Nur für Admins.</p>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Trinkgeld-Rest</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Aufgelaufener Restcent durch die Euro-Abrundung im Bargeld — je Periode (26.–25.) und
          Standort, pro Tag und Küche/Service getrennt. Read-only.
        </p>
      </div>

      <div className="flex flex-wrap gap-4">
        <div className="space-y-1">
          <span className="block text-xs font-medium text-muted-foreground">Standort</span>
          <LocationPills
            locations={locationsQ.data ?? []}
            value={locationId}
            onChange={setLocationId}
          />
        </div>
        <label className="block space-y-1">
          <span className="text-xs font-medium text-muted-foreground">Periode</span>
          <select
            value={periodId}
            onChange={(e) => setPeriodId(e.target.value)}
            className="rounded-md border border-input bg-background px-3 py-2 text-sm"
          >
            {(periodsQ.data ?? []).map((p) => (
              <option key={p.id} value={p.id}>
                {p.label} ({p.startDate} – {p.endDate})
              </option>
            ))}
          </select>
        </label>
      </div>

      {remainderQ.isLoading && <p className="text-sm text-muted-foreground">Lade…</p>}
      {remainderQ.error && (
        <p className="text-sm text-destructive">Restcent konnte nicht geladen werden.</p>
      )}
      {remainderQ.data && (
        <div className="overflow-hidden rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-4 py-2 text-left font-medium">Datum</th>
                <th className="px-4 py-2 text-right font-medium">Rest Küche</th>
                <th className="px-4 py-2 text-right font-medium">Rest Service</th>
                <th className="px-4 py-2 text-right font-medium">Rest gesamt</th>
              </tr>
            </thead>
            <tbody>
              {remainderQ.data.rows.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-6 text-center text-sm text-muted-foreground">
                    Keine Sessions in dieser Periode.
                  </td>
                </tr>
              )}
              {remainderQ.data.rows.map((r) => {
                const total = r.kitchenRemainderCents + r.serviceRemainderCents;
                return (
                  <tr key={r.businessDate} className="border-t border-border">
                    <td className="px-4 py-2 font-mono tabular-nums">{r.businessDate}</td>
                    <td className="px-4 py-2 text-right font-mono tabular-nums">
                      {fmtCents(r.kitchenRemainderCents)} €
                    </td>
                    <td className="px-4 py-2 text-right font-mono tabular-nums">
                      {fmtCents(r.serviceRemainderCents)} €
                    </td>
                    <td className="px-4 py-2 text-right font-mono tabular-nums">
                      {fmtCents(total)} €
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot className="bg-muted/30 text-sm font-semibold">
              <tr className="border-t border-border">
                <td className="px-4 py-2">Periode gesamt</td>
                <td className="px-4 py-2 text-right font-mono tabular-nums">
                  {fmtCents(remainderQ.data.totals.kitchenCents)} €
                </td>
                <td className="px-4 py-2 text-right font-mono tabular-nums">
                  {fmtCents(remainderQ.data.totals.serviceCents)} €
                </td>
                <td className="px-4 py-2 text-right font-mono tabular-nums">
                  {fmtCents(remainderQ.data.totals.totalCents)} €
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}
