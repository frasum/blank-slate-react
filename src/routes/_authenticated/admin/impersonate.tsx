import { createFileRoute, redirect, useRouter } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { getMyIdentity } from "@/lib/auth/me.functions";
import {
  listStaffForImpersonation,
  startImpersonation,
  type ImpersonationStaffOption,
} from "@/lib/admin/impersonation.functions";

export const Route = createFileRoute("/_authenticated/admin/impersonate")({
  head: () => ({ meta: [{ title: "Mitarbeiterportal testen" }] }),
  beforeLoad: async () => {
    const id = await getMyIdentity();
    if (id.role !== "admin" || id.impersonation.active) {
      throw redirect({ to: "/admin" });
    }
  },
  component: ImpersonatePage,
});

function ImpersonatePage() {
  const listFn = useServerFn(listStaffForImpersonation);
  const startFn = useServerFn(startImpersonation);
  const router = useRouter();
  const queryClient = useQueryClient();

  const [query, setQuery] = useState("");
  const [reason, setReason] = useState("");
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const staffQuery = useQuery({
    queryKey: ["impersonate", "staff-list"],
    queryFn: () => listFn(),
  });

  const items: ImpersonationStaffOption[] = staffQuery.data ?? [];
  const filtered = items.filter((s) =>
    s.displayName.toLowerCase().includes(query.trim().toLowerCase()),
  );

  async function handleStart(staffId: string) {
    setError(null);
    const r = reason.trim();
    if (r.length < 3) {
      setError("Bitte einen Grund (mind. 3 Zeichen) angeben.");
      return;
    }
    setPendingId(staffId);
    try {
      await startFn({ data: { staffId, reason: r } });
      await queryClient.cancelQueries();
      queryClient.clear();
      await router.navigate({ to: "/" });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Impersonation fehlgeschlagen.");
    } finally {
      setPendingId(null);
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          Mitarbeiterportal testen
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Du wechselst serverseitig in die Identität des gewählten Mitarbeiters. Alle Abfragen
          laufen mit dessen Rechten und Sichtbarkeiten. Über die rote Leiste oben beendest du die
          Sitzung jederzeit.
        </p>
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium text-foreground" htmlFor="imp-reason">
          Grund (wird im Audit-Log gespeichert)
        </label>
        <input
          id="imp-reason"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="z.B. Stempeluhr-Test"
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
        />
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium text-foreground" htmlFor="imp-search">
          Mitarbeiter suchen
        </label>
        <input
          id="imp-search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Name eingeben…"
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
        />
      </div>

      {error && (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      )}

      <div className="space-y-2">
        {staffQuery.isLoading && (
          <div className="text-sm text-muted-foreground">Mitarbeiter werden geladen…</div>
        )}
        {staffQuery.error && (
          <div className="text-sm text-destructive">
            Liste konnte nicht geladen werden:{" "}
            {staffQuery.error instanceof Error ? staffQuery.error.message : "Unbekannter Fehler"}
          </div>
        )}
        {!staffQuery.isLoading && filtered.length === 0 && (
          <div className="text-sm text-muted-foreground">Keine Treffer.</div>
        )}
        <ul className="divide-y divide-border rounded-md border border-border bg-card">
          {filtered.map((s) => (
            <li
              key={s.staffId}
              className="flex items-center justify-between gap-3 px-4 py-3 text-sm"
            >
              <div className="min-w-0">
                <div className="truncate font-medium text-foreground">{s.displayName}</div>
                <div className="truncate text-xs text-muted-foreground">
                  Rolle: {s.role ?? "—"}
                  {!s.hasAccount && " · kein Account"}
                </div>
              </div>
              <button
                type="button"
                disabled={!s.hasAccount || pendingId !== null}
                onClick={() => void handleStart(s.staffId)}
                className="shrink-0 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
                title={s.hasAccount ? "Als diesen Mitarbeiter testen" : "Mitarbeiter hat keinen Account"}
              >
                {pendingId === s.staffId ? "Starte…" : "Als testen"}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}