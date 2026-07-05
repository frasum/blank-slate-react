// Bestell-Bereich (Welle 1-B): Layout-Route mit Unter-Tabs.
// Kindrouten: lieferanten, artikel (1-B); warenkorb, bestellungen folgen
// in 1-C/1-D. payroll darf hier nicht rein (Top-Level-Gate in admin/route.tsx).

import { createFileRoute, Link, Outlet } from "@tanstack/react-router";
import { CartDrawer } from "@/components/bestellung/CartDrawer";

export const Route = createFileRoute("/_authenticated/admin/bestellung")({
  head: () => ({ meta: [{ title: "Bestellung · Verwaltung" }] }),
  component: BestellungLayout,
});

function BestellungLayout() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Bestellung</h1>
      </div>
      <nav className="flex flex-wrap items-center gap-4 border-b border-border text-sm">
        <SubLink to="/admin/bestellung/lieferanten">Bestellungen</SubLink>
        <SubLink to="/admin/bestellung/bestellungen">Bestellhistorie</SubLink>
        <SubLink to="/admin/bestellung/inventur">Inventur</SubLink>
        <SubLink to="/easyorder">EasyOrder</SubLink>
      </nav>
      <Outlet />
      <CartDrawer />
    </div>
  );
}

function SubLink({ to, children }: { to: string; children: React.ReactNode }) {
  return (
    <Link
      to={to}
      className="-mb-px border-b-2 border-transparent px-3 pb-2 pt-1 font-medium text-muted-foreground transition-colors hover:text-foreground"
      activeProps={{
        className: "border-primary bg-primary/5 text-foreground font-semibold rounded-t-md",
      }}
    >
      {children}
    </Link>
  );
}
