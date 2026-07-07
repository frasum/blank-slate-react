// P1 — Öffentlich lesbare Sentry-Konfiguration für den Client-Init.
//
// Sentry-DSNs sind für den Browser-Einsatz gedacht und daher nicht
// vertraulich; sie liegen serverseitig in `SENTRY_DSN` und werden dem
// Client hierüber ausgeliefert, damit kein separater VITE_-Build-Env-
// Wert nötig ist.

import { createServerFn } from "@tanstack/react-start";

export type SentryClientConfig = {
  dsn: string | null;
  environment: string;
};

export const getSentryClientConfig = createServerFn({ method: "GET" }).handler(
  async (): Promise<SentryClientConfig> => {
    return {
      dsn: process.env.SENTRY_DSN ?? null,
      environment: process.env.NODE_ENV === "production" ? "production" : "development",
    };
  },
);