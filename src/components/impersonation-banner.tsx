import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { stopImpersonation } from "@/lib/admin/impersonation.functions";

export function ImpersonationBanner() {
  const { identity } = useAuth();
  const stopFn = useServerFn(stopImpersonation);
  const router = useRouter();
  const queryClient = useQueryClient();
  const [pending, setPending] = useState(false);

  if (!identity?.impersonation.active) return null;

  async function handleStop() {
    setPending(true);
    try {
      await stopFn();
      await queryClient.cancelQueries();
      queryClient.clear();
      await router.navigate({ to: "/admin" });
    } finally {
      setPending(false);
    }
  }

  const since = identity.impersonation.since
    ? new Date(identity.impersonation.since).toLocaleTimeString("de-DE", {
        hour: "2-digit",
        minute: "2-digit",
      })
    : null;

  return (
    <div className="sticky top-0 z-50 flex flex-wrap items-center justify-between gap-2 border-b border-destructive/40 bg-destructive px-4 py-2 text-sm text-destructive-foreground">
      <div>
        <span className="font-semibold">Vorschau als {identity.impersonation.asDisplayName}</span>
        {since && <span className="ml-2 opacity-80">seit {since}</span>}
      </div>
      <button
        type="button"
        onClick={() => void handleStop()}
        disabled={pending}
        className="rounded-md bg-background/20 px-3 py-1 text-xs font-medium hover:bg-background/30 disabled:opacity-50"
      >
        {pending ? "Beende…" : "Impersonation beenden"}
      </button>
    </div>
  );
}