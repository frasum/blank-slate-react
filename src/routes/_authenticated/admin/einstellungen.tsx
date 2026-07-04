// Einstellungen-Bereich: Layout-Route mit Sub-Tabs.
// Allgemein = bisherige Einstellungen-Seite (einstellungen.index.tsx).
// EasyOrder-Verwaltung wurde aus dem Bestell-Bereich hierher verlagert.

import { createFileRoute, Link, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/admin/einstellungen")({
  head: () => ({ meta: [{ title: "Einstellungen · Verwaltung" }] }),
  component: EinstellungenLayout,
});

function EinstellungenLayout() {
  return (
    <div className="space-y-6">
      <nav className="flex flex-wrap items-center gap-4 border-b border-border text-sm">
        <SubLink to="/admin/einstellungen" exact>
          Allgemein
        </SubLink>
        <SubLink to="/admin/einstellungen/easyorder-verwaltung">EasyOrder-Verwaltung</SubLink>
      </nav>
      <Outlet />
    </div>
  );
}

function SubLink({
  to,
  exact,
  children,
}: {
  to: string;
  exact?: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      to={to}
      activeOptions={exact ? { exact: true } : undefined}
      className="-mb-px border-b-2 border-transparent px-3 pb-2 pt-1 font-medium text-muted-foreground transition-colors hover:text-foreground"
      activeProps={{
        className: "border-primary bg-primary/5 text-foreground font-semibold rounded-t-md",
      }}
    >
      {children}
    </Link>
  );
}