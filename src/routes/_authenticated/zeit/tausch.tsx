// TA3: Redirect für alte Links/Lesezeichen. Die Tausch-UI ist nach
// /zeit/schichten gewandert (Anfragen an dich → eigene Schichten →
// meine Anfragen im gleichen Screen).

import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/zeit/tausch")({
  beforeLoad: () => {
    throw redirect({ to: "/zeit/schichten" });
  },
});