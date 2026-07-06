// Tertiäre Navigation für POS-Verkauf (Artikel / Stundenbericht). Wird von
// beiden POS-Seiten gerendert, analog zum Muster in bestellung.tsx.

import { Link, useRouterState } from "@tanstack/react-router";
import { tabClass } from "@/components/ui/nav-tab";

const ITEMS = [
  { to: "/admin/pos-verkauf", label: "Artikel" },
  { to: "/admin/pos-stundenbericht", label: "Stundenbericht" },
] as const;

export function PosNav() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  return (
    <nav className="flex flex-wrap items-center gap-x-2 gap-y-1 border-b border-border/60 text-xs">
      {ITEMS.map((it) => {
        const active = pathname === it.to || pathname.startsWith(it.to + "/");
        return (
          <Link key={it.to} to={it.to} className={tabClass(active)}>
            {it.label}
          </Link>
        );
      })}
    </nav>
  );
}
