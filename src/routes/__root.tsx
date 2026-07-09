import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";

import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";
import { startSentryClient, captureClientError } from "@/lib/monitoring/sentry-client";
import { AuthProvider } from "@/contexts/auth-context";
import { TooltipProvider } from "@/components/ui/tooltip";
import cocoFavicon from "@/assets/coco-favicon.png.asset.json";
import cocoOg from "@/assets/coco-og.jpg.asset.json";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Seite nicht gefunden</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Zur Startseite
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
    void captureClientError(error, {
      boundary: "tanstack_root_error_component",
      route: typeof window !== "undefined" ? window.location.pathname : "unknown",
    });
  }, [error]);

  // Spezialfall: Supabase-Env-Variablen fehlen im Build. Statt der generischen
  // "Erneut versuchen"-Karte eine erklärende Meldung zeigen — Refresh hilft
  // hier nicht, der Fehler steckt in der Konfiguration.
  const isSupabaseEnvError =
    typeof error?.message === "string" &&
    error.message.includes("Missing Supabase environment variable");
  if (isSupabaseEnvError) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <div className="max-w-md text-center">
          <h1 className="text-xl font-semibold tracking-tight text-foreground">
            Konfiguration unvollständig
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Die Verbindung zur Datenbank ist in diesem Build nicht konfiguriert
            (Supabase-Umgebungsvariablen fehlen). Bitte in Lovable die Cloud-
            Verbindung prüfen oder in der Datei <code>.env</code> die Werte für
            <code> VITE_SUPABASE_URL</code> und <code> VITE_SUPABASE_PUBLISHABLE_KEY</code>
            {" "}ergänzen und den Build neu starten.
          </p>
          <p className="mt-3 text-xs text-muted-foreground/80">
            Ein Neuladen behebt das Problem nicht, solange die Variablen fehlen.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          Diese Seite konnte nicht geladen werden
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Something went wrong on our end. You can try refreshing or head back home.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Erneut versuchen
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Zur Startseite
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "COCO – Central Operations Cockpit" },
      {
        name: "description",
        content: "COCO · Central Operations Cockpit — Gastronomie-Betriebsplattform.",
      },
      { name: "author", content: "COCO" },
      { property: "og:title", content: "COCO – Central Operations Cockpit" },
      {
        property: "og:description",
        content: "COCO · Central Operations Cockpit — Gastronomie-Betriebsplattform.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: "COCO – Central Operations Cockpit" },
      {
        name: "twitter:description",
        content: "COCO · Central Operations Cockpit — Gastronomie-Betriebsplattform.",
      },
      { property: "og:image", content: cocoOg.url },
      { name: "twitter:image", content: cocoOg.url },
    ],
    links: [
      {
        rel: "stylesheet",
        href: appCss,
      },
      { rel: "icon", type: "image/png", href: cocoFavicon.url },
      { rel: "apple-touch-icon", href: cocoFavicon.url },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="de">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  useEffect(() => {
    void startSentryClient();
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider delayDuration={150}>
        <AuthProvider>
          {/* Required: nested routes render here. Removing <Outlet /> breaks all child routes. */}
          <Outlet />
        </AuthProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}
