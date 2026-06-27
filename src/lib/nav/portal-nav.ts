import { useQuery } from "@tanstack/react-query";
import {
  Home,
  Clock,
  Receipt,
  ShoppingCart,
  LayoutDashboard,
  type LucideIcon,
} from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { getMyEasyOrderContext } from "@/lib/bestellung/easyorder.functions";

export type PortalNavItem = { to: string; label: string; icon: LucideIcon };

/** Einzige Quelle: leitet sichtbare Portal-Navigation aus Rolle + Freischaltungen ab. */
export function usePortalNav(): { items: PortalNavItem[]; isLoading: boolean } {
  const { identity } = useAuth();
  const role = identity?.role ?? null;
  const eoQ = useQuery({
    queryKey: ["easyorder", "context"],
    queryFn: () => getMyEasyOrderContext(),
    enabled: !!identity?.staffId,
  });
  const hasEasyOrder = (eoQ.data?.locations.length ?? 0) > 0;

  const items: PortalNavItem[] = [{ to: "/", label: "Start", icon: Home }];
  if (role === "admin" || role === "manager" || role === "staff") {
    items.push({ to: "/zeit", label: "Stempeln", icon: Clock });
    items.push({ to: "/zeit/abrechnung", label: "Abrechnung", icon: Receipt });
  }
  if (hasEasyOrder) items.push({ to: "/easyorder", label: "Bestellung", icon: ShoppingCart });
  if (role === "admin" || role === "manager")
    items.push({ to: "/admin", label: "Backoffice", icon: LayoutDashboard });

  return { items, isLoading: eoQ.isLoading };
}