// P1 — Client-seitiger Sentry-Init.
//
// Wird einmalig in __root beim Mount gestartet. DSN kommt aus der Server-
// Function `getSentryClientConfig` (SENTRY_DSN serverseitig). Ohne DSN
// passiert nichts. `@sentry/react` wird dynamisch nachgeladen, damit der
// Fall „kein Monitoring" das Bundle nicht mit Init-Code belastet.

let started = false;

export async function startSentryClient(): Promise<void> {
  if (started) return;
  started = true;
  try {
    const { getSentryClientConfig } = await import("./sentry-config.functions");
    const config = await getSentryClientConfig();
    if (!config?.dsn) return;

    const Sentry = await import("@sentry/react");
    Sentry.init({
      dsn: config.dsn,
      environment: config.environment,
      // Bewusst konservativ: keine Session-Replays, kein Performance-Sampling,
      // nur Errors. Kann später erhöht werden, wenn wir das brauchen.
      tracesSampleRate: 0,
      replaysSessionSampleRate: 0,
      replaysOnErrorSampleRate: 0,
    });
    Sentry.setTag("app", "coco");
  } catch {
    // Monitoring darf nichts brechen.
    started = false;
  }
}

export async function captureClientError(
  err: unknown,
  tags?: Record<string, string>,
): Promise<void> {
  try {
    const Sentry = await import("@sentry/react");
    const client = Sentry.getClient?.();
    if (!client) return;
    Sentry.withScope((scope) => {
      if (tags) {
        for (const [k, v] of Object.entries(tags)) scope.setTag(k, v);
      }
      Sentry.captureException(err);
    });
  } catch {
    /* ignore */
  }
}
