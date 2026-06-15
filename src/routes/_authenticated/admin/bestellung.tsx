// Bestell-Bereich (Welle 1-B): Layout-Route mit Unter-Tabs.
// Kindrouten: lieferanten, artikel (1-B); warenkorb, bestellungen folgen
// in 1-C/1-D. payroll darf hier nicht rein (Top-Level-Gate in admin/route.tsx).

import { createFileRoute, Link, Outlet } from "@tanstack/react-router";

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
        <SubLink to="/admin/bestellung/warenkorb">Warenkorb</SubLink>
        <SubLink to="/admin/bestellung/easyorder">EasyOrder</SubLink>
        <SubLink to="/admin/bestellung/easyorder-verwaltung">EasyOrder-Verwaltung</SubLink>
        <SubLink to="/admin/bestellung/bestellungen">Bestellungen</SubLink>
        <SubLink to="/admin/bestellung/lieferanten">Lieferanten</SubLink>
        <SubLink to="/admin/bestellung/artikel">Artikel</SubLink>
        <SubLink to="/admin/bestellung/inventur">Inventur</SubLink>
        <SubLink to="/admin/bestellung/wein">Wein</SubLink>
        <SubLink to="/admin/bestellung/wein-quiz">Wein-Quiz</SubLink>
      </nav>
      <Outlet />
    </div>
  );
}

function SubLink({ to, children }: { to: string; children: React.ReactNode }) {
  return (
    <Link
      to={to}
      className="-mb-px border-b-2 border-transparent px-1 pb-2 text-muted-foreground hover:text-foreground"
      activeProps={{ className: "-mb-px border-b-2 border-primary px-1 pb-2 text-foreground" }}
    >
      {children}
    </Link>
  );
}
