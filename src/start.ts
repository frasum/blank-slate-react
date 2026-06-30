import { createStart, createMiddleware } from "@tanstack/react-start";

import { renderErrorPage } from "./lib/error-page";
import { attachSupabaseAuth } from "@/integrations/supabase/auth-attacher";
import {
  logServerFnErrors,
  logServerFnErrorsServer,
  installServerFnFetchLogger,
} from "@/lib/server-fn-error-logger";

// Patcht window.fetch einmalig, damit jeder /_serverFn/*-Aufruf mit ≥400
// im Browser eine ausführliche Diagnosezeile (Funktionsname, Route, Dauer)
// loggt — unabhängig davon, ob ein Error-Boundary den Fehler abfängt.
installServerFnFetchLogger();

const errorMiddleware = createMiddleware().server(async ({ next }) => {
  try {
    return await next();
  } catch (error) {
    if (error != null && typeof error === "object" && "statusCode" in error) {
      throw error;
    }
    console.error(error);
    return new Response(renderErrorPage(), {
      status: 500,
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  }
});

export const startInstance = createStart(() => ({
  functionMiddleware: [attachSupabaseAuth, logServerFnErrors, logServerFnErrorsServer],
  requestMiddleware: [errorMiddleware],
}));
