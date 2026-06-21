import { useEffect, useState } from "react";
import { createFileRoute, redirect } from "@tanstack/react-router";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAuth } from "@/hooks/use-auth";
import { KanbanBoard } from "@/components/aufgaben/KanbanBoard";
import { useMyTaskLocations } from "@/lib/aufgaben/tasks.queries";
import { supabase } from "@/integrations/supabase/client";
import { getMyIdentity } from "@/lib/auth/me.functions";

export const Route = createFileRoute("/_authenticated/zeit/aufgaben")({
  head: () => ({
    meta: [
      { title: "Aufgaben · Zeit" },
      { name: "description", content: "Offene Aufgaben deiner Standorte" },
    ],
  }),
  beforeLoad: ({ context }) => {
    return (async () => {
      const { data } = await supabase.auth.getSession();
      if (!data.session?.user) return;
      const identity = await context.queryClient.ensureQueryData({
        queryKey: ["identity", data.session.user.id ?? null],
        queryFn: () => getMyIdentity(),
      });
      if (identity.role === "payroll") {
        throw redirect({ to: "/admin/zeit-uebersicht" });
      }
    })();
  },
  component: ZeitAufgabenPage,
});

function ZeitAufgabenPage() {
  const { identity } = useAuth();
  const locsQ = useMyTaskLocations();
  const [locationId, setLocationId] = useState<string>("");

  useEffect(() => {
    if (!locationId && locsQ.data && locsQ.data.length > 0) {
      setLocationId(locsQ.data[0].id);
    }
  }, [locsQ.data, locationId]);

  const role = identity?.role ?? null;
  const canManage = role === "admin" || role === "manager";

  if (locsQ.isLoading) {
    return <p className="text-sm text-muted-foreground">Lade Standorte…</p>;
  }
  if (locsQ.isError) {
    return (
      <p className="text-sm text-destructive">
        Fehler beim Laden: {(locsQ.error as Error).message}
      </p>
    );
  }
  if (!locsQ.data || locsQ.data.length === 0) {
    return (
      <main className="mx-auto max-w-2xl space-y-4 px-4 py-8">
        <h1 className="text-2xl font-semibold tracking-tight">Aufgaben</h1>
        <p className="text-sm text-muted-foreground">
          Dir ist aktuell kein Standort zugeordnet. Bitte wende dich an deinen Manager.
        </p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-6xl space-y-6 px-4 py-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Aufgaben</h1>
          <p className="text-sm text-muted-foreground">
            Offene Aufgaben deiner Standorte – Übernehmen und Status ziehen.
          </p>
        </div>
        <div className="min-w-[220px]">
          <Select value={locationId} onValueChange={setLocationId}>
            <SelectTrigger>
              <SelectValue placeholder="Standort wählen" />
            </SelectTrigger>
            <SelectContent>
              {locsQ.data.map((l) => (
                <SelectItem key={l.id} value={l.id}>
                  {l.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {locationId ? (
        <KanbanBoard
          locationId={locationId}
          staff={[]}
          canCreate={false}
          canManage={canManage}
          currentStaffId={identity?.staffId ?? null}
        />
      ) : (
        <p className="text-sm text-muted-foreground">Bitte einen Standort wählen.</p>
      )}
    </main>
  );
}
