import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/admin/bestellung/")({
  beforeLoad: () => {
    throw redirect({ to: "/admin/bestellung/warenkorb" });
  },
});