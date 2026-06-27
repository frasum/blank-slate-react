import type { ReactNode } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { useAuth } from "@/hooks/use-auth";
import { usePortalNav, type PortalNavItem } from "@/lib/nav/portal-nav";

function isActive(to: string, pathname: string): boolean {
  if (to === "/") return pathname === "/";
  return pathname === to || pathname.startsWith(to + "/");
}

function TopBarLink({ item, active }: { item: PortalNavItem; active: boolean }) {
  const Icon = item.icon;
  return (
    <Link
      to={item.to}
      className={[
        "inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
        active
          ? "bg-primary/10 text-foreground"
          : "text-muted-foreground hover:bg-accent hover:text-foreground",
      ].join(" ")}
    >
      <Icon className="h-4 w-4" aria-hidden />
      <span>{item.label}</span>
    </Link>
  );
}

function BottomTabLink({ item, active }: { item: PortalNavItem; active: boolean }) {
  const Icon = item.icon;
  return (
    <Link
      to={item.to}
      className={[
        "flex min-h-[56px] flex-1 flex-col items-center justify-center gap-0.5 px-1 py-2 text-[11px] font-medium transition-colors",
        active ? "text-primary" : "text-muted-foreground hover:text-foreground",
      ].join(" ")}
    >
      <Icon className="h-5 w-5" aria-hidden />
      <span className="truncate">{item.label}</span>
    </Link>
  );
}

export function PortalShell({ children }: { children: ReactNode }) {
  const { items } = usePortalNav();
  const { signOut } = useAuth();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  return (
    <div className="min-h-screen bg-background">
      {/* Desktop Top-Bar */}
      <header className="sticky top-0 z-30 hidden border-b border-border bg-card sm:flex">
        <div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-4 px-4 py-2">
          <nav className="flex items-center gap-1">
            {items.map((item) => (
              <TopBarLink key={item.to} item={item} active={isActive(item.to, pathname)} />
            ))}
          </nav>
          <button
            onClick={() => void signOut()}
            className="inline-flex items-center justify-center rounded-md px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            Abmelden
          </button>
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl px-4 py-6 pb-24 sm:pb-6">{children}</main>

      {/* Mobile Bottom-Tabs */}
      <nav
        className="fixed inset-x-0 bottom-0 z-30 flex border-t border-border bg-card sm:hidden"
        aria-label="Portal-Navigation"
      >
        {items.map((item) => (
          <BottomTabLink key={item.to} item={item} active={isActive(item.to, pathname)} />
        ))}
      </nav>
    </div>
  );
}
