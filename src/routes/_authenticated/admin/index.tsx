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
          className="group flex items-start justify-between rounded-lg border border-border bg-card p-5 transition-all hover:border-foreground/20 hover:bg-accent hover:shadow-sm"
        >
          <div>
            <div className="font-medium text-foreground">Mitarbeiter</div>
            <div className="mt-1 text-sm text-muted-foreground">
              Stammdaten, Standorte, Rolle, PIN, Badges
            </div>
          </div>
          <span className="text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-foreground" aria-hidden>→</span>
        </Link>
        <Link
          to="/admin/locations"
          className="group flex items-start justify-between rounded-lg border border-border bg-card p-5 transition-all hover:border-foreground/20 hover:bg-accent hover:shadow-sm"
        >
          <div>
            <div className="font-medium text-foreground">Standorte</div>
            <div className="mt-1 text-sm text-muted-foreground">
              Standorte anlegen, umbenennen, entfernen
            </div>
          </div>
          <span className="text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-foreground" aria-hidden>→</span>
        </Link>
      </div>
    </div>
  );
}
