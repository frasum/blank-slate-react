// OAuth-Consent-Screen für Supabase Auth (MCP-Server-Anbindung).
// Supabase leitet Clients wie ChatGPT/Claude nach dem Authorize-Call auf
// diese Route weiter; hier bestätigt oder verweigert der Nutzer die
// Verbindung. Danach führt Supabase die redirect_url zurück zum Client.
//
// ssr:false — die Supabase-Session liegt in localStorage.

import { createFileRoute, redirect } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";

// Beta-API: supabase.auth.oauth ist noch nicht in den Typen — lokal minimal
// typisieren, sonst müssten wir globale Supabase-Typen anfassen.
type ConsentClient = { name?: string | null };
type ConsentDetails = {
  client?: ConsentClient | null;
  redirect_url?: string | null;
  redirect_to?: string | null;
};
type OAuthNamespace = {
  getAuthorizationDetails: (id: string) => Promise<{ data: ConsentDetails | null; error: Error | null }>;
  approveAuthorization: (id: string) => Promise<{ data: ConsentDetails | null; error: Error | null }>;
  denyAuthorization: (id: string) => Promise<{ data: ConsentDetails | null; error: Error | null }>;
};
function oauthClient(): OAuthNamespace {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (supabase.auth as any).oauth as OAuthNamespace;
}

function safeSameOriginPath(raw: string | null | undefined): string | null {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//")) return null;
  return raw;
}

export const Route = createFileRoute("/.lovable/oauth/consent")({
  ssr: false,
  validateSearch: (s: Record<string, unknown>) => ({
    authorization_id: typeof s.authorization_id === "string" ? s.authorization_id : "",
  }),
  beforeLoad: async ({ search, location }) => {
    if (!search.authorization_id) throw new Error("Missing authorization_id");
    const { data } = await supabase.auth.getSession();
    const next = location.pathname + location.searchStr;
    if (!data.session) throw redirect({ to: "/auth", search: { next } });
  },
  loader: async ({ location }) => {
    const authorizationId = new URLSearchParams(location.search).get("authorization_id")!;
    const { data, error } = await oauthClient().getAuthorizationDetails(authorizationId);
    if (error) throw error;
    const immediate = safeSameOriginPath(data?.redirect_url ?? data?.redirect_to ?? null)
      ? null
      : (data?.redirect_url ?? data?.redirect_to ?? null);
    // Wenn Supabase sofort weiterleitet (Client bereits genehmigt), hier raus.
    if (immediate && !data?.client) {
      throw redirect({ href: immediate });
    }
    return data;
  },
  component: Consent,
  errorComponent: ({ error }) => (
    <main className="mx-auto max-w-md p-6 text-sm">
      <h1 className="text-lg font-semibold">Autorisierung konnte nicht geladen werden</h1>
      <p className="mt-2 text-muted-foreground">{String((error as Error)?.message ?? error)}</p>
    </main>
  ),
});

function Consent() {
  const details = Route.useLoaderData();
  const { authorization_id } = Route.useSearch();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function decide(approve: boolean) {
    setBusy(true);
    setError(null);
    const { data, error } = approve
      ? await oauthClient().approveAuthorization(authorization_id)
      : await oauthClient().denyAuthorization(authorization_id);
    if (error) {
      setBusy(false);
      setError(error.message);
      return;
    }
    const target = data?.redirect_url ?? data?.redirect_to;
    if (!target) {
      setBusy(false);
      setError("Keine Redirect-URL vom Autorisierungsserver erhalten.");
      return;
    }
    window.location.href = target;
  }

  const clientName = details?.client?.name ?? "Ein externer Client";

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-6 p-6">
      <div>
        <h1 className="text-xl font-semibold">{clientName} mit COCO verbinden</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Der Client greift danach mit deiner Identität auf COCO-Tools zu (nur Daten deiner
          Organisation, gemäß deiner Rolle).
        </p>
      </div>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <div className="flex gap-2">
        <button
          disabled={busy}
          onClick={() => decide(true)}
          className="flex-1 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
        >
          {busy ? "…" : "Zulassen"}
        </button>
        <button
          disabled={busy}
          onClick={() => decide(false)}
          className="flex-1 rounded-md border border-input px-4 py-2 text-sm font-medium disabled:opacity-50"
        >
          Ablehnen
        </button>
      </div>
    </main>
  );
}