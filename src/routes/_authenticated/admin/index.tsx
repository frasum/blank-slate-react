import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/admin/")({
  head: () => ({ meta: [{ title: "Verwaltung" }] }),
  component: AdminIndex,
});

function AdminIndex() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Verwaltung</h1>
        <p className="text-sm text-muted-foreground">Stammdaten, PINs und Badges (B1c).</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Link
          to="/admin/staff"
          className="rounded-md border border-border bg-card p-4 hover:bg-accent"
        >
          <div className="font-medium text-foreground">Mitarbeiter</div>
          <div className="text-sm text-muted-foreground">
            Stammdaten, Standorte, Rolle, PIN, Badges
          </div>
        </Link>
        <Link
          to="/admin/locations"
          className="rounded-md border border-border bg-card p-4 hover:bg-accent"
        >
          <div className="font-medium text-foreground">Standorte</div>
          <div className="text-sm text-muted-foreground">
            Standorte anlegen, umbenennen, entfernen
          </div>
        </Link>
      </div>
    </div>
  );
}
