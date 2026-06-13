import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { listStaff } from "@/lib/admin/staff.functions";

export const Route = createFileRoute("/_authenticated/admin/staff/")({
  head: () => ({ meta: [{ title: "Mitarbeiter · Verwaltung" }] }),
  component: StaffListPage,
});

function StaffListPage() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["admin", "staff"],
    queryFn: () => listStaff(),
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Mitarbeiter</h1>
        <Link
          to="/admin/staff/new"
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          Neuer Mitarbeiter
        </Link>
      </div>

      {isLoading && <p className="text-sm text-muted-foreground">Lade…</p>}
      {error && <p className="text-sm text-destructive">Fehler beim Laden.</p>}

      {data && (
        <div className="overflow-hidden rounded-md border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted text-left text-muted-foreground">
              <tr>
                <th className="px-3 py-2 font-medium">Name</th>
                <th className="px-3 py-2 font-medium">Rolle</th>
                <th className="px-3 py-2 font-medium">Aktiv</th>
                <th className="px-3 py-2 font-medium">PIN</th>
                <th className="px-3 py-2 font-medium">Badges</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {data.map((s) => (
                <tr key={s.id} className="border-t border-border">
                  <td className="px-3 py-2">
                    <div className="font-medium text-foreground">{s.displayName}</div>
                    <div className="text-xs text-muted-foreground">{s.email ?? "—"}</div>
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">{s.role ?? "—"}</td>
                  <td className="px-3 py-2">
                    {s.isActive ? (
                      <span className="text-foreground">aktiv</span>
                    ) : (
                      <span className="text-muted-foreground">inaktiv</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">{s.hasPin ? "gesetzt" : "—"}</td>
                  <td className="px-3 py-2 text-muted-foreground">{s.activeBadgeCount}</td>
                  <td className="px-3 py-2 text-right">
                    <Link
                      to="/admin/staff/$staffId"
                      params={{ staffId: s.id }}
                      className="text-sm text-primary hover:underline"
                    >
                      Bearbeiten
                    </Link>
                  </td>
                </tr>
              ))}
              {data.length === 0 && (
                <tr>
                  <td className="px-3 py-6 text-center text-muted-foreground" colSpan={6}>
                    Noch keine Mitarbeiter.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
