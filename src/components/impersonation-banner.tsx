import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { stopImpersonation } from "@/lib/admin/impersonation.functions";
import {
  IMPERSONATION_MAX_MINUTES,
  impersonationRemainingMs,
} from "@/lib/admin/impersonation-expiry";

export function ImpersonationBanner() {
  const { identity } = useAuth();
  const stopFn = useServerFn(stopImpersonation);
  const router = useRouter();
  const queryClient = useQueryClient();
  const [pending, setPending] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  const active = identity?.impersonation.active ?? false;
  const since = identity?.impersonation.since ?? null;

  // Sekundentakt nur bei aktiver Vorschau — sonst kein Timer.
  useEffect(() => {
    if (!active) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [active]);

  // Ablauf-Erkennung: Server räumt beim nächsten Read auf; hier stoßen wir
  // Identity-Refetch + Redirect an, sobald die Restzeit auf 0 fällt.
  useEffect(() => {
    if (!active || !since) return;
    const remaining = impersonationRemainingMs(since, new Date(now).toISOString());
    if (remaining > 0) return;
    let cancelled = false;
    (async () => {
      await queryClient.cancelQueries();
      queryClient.clear();
      await queryClient.invalidateQueries({ queryKey: ["identity"] });
      if (cancelled) return;
      toast.info("Vorschau automatisch beendet");
      await router.navigate({ to: "/admin" });
    })().catch(() => {
      /* Refetch-/Navigations-Fehler sind hier kosmetisch. */
    });
    return () => {
      cancelled = true;
    };
    // `now` ist absichtlich Dep: sobald der Timer die 0-Grenze überschreitet, triggert es genau einmal.
  }, [active, since, now, queryClient, router]);

  if (!identity?.impersonation.active) return null;

  async function handleStop() {
    setPending(true);
    try {
      await stopFn();
      await queryClient.cancelQueries();
      queryClient.clear();
      await queryClient.invalidateQueries({ queryKey: ["identity"] });
      await router.navigate({ to: "/admin" });
    } finally {
      setPending(false);
    }
  }

  const sinceLabel = identity.impersonation.since
    ? new Date(identity.impersonation.since).toLocaleTimeString("de-DE", {
        hour: "2-digit",
        minute: "2-digit",
      })
    : null;

  const remainingMs = identity.impersonation.since
    ? impersonationRemainingMs(identity.impersonation.since, new Date(now).toISOString())
    : IMPERSONATION_MAX_MINUTES * 60_000;
  // Nach oben runden, damit „endet in 1 min" bis zur letzten Sekunde stehen bleibt
  // und nie „endet in 0 min" vor dem eigentlichen Ablauf angezeigt wird.
  const remainingMin = Math.max(0, Math.ceil(remainingMs / 60_000));

  return (
    <div className="sticky top-0 z-50 flex flex-wrap items-center justify-between gap-2 border-b border-destructive/40 bg-destructive px-4 py-2 text-sm text-destructive-foreground">
      <div>
        <span className="font-semibold">Vorschau als {identity.impersonation.asDisplayName}</span>
        {sinceLabel && <span className="ml-2 opacity-80">seit {sinceLabel}</span>}
        <span className="ml-2 opacity-80">· endet in {remainingMin} min</span>
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
