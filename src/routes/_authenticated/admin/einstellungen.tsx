// Einstellungen-Bereich: Layout-Route. Die Sub-Tabs (Allgemein /
// EasyOrder-Verwaltung / System) werden vom Admin-Layout (route.tsx)
// gerendert, damit „System" auch außerhalb dieses Layouts sichtbar bleibt.

import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/admin/einstellungen")({
  head: () => ({ meta: [{ title: "Einstellungen · Verwaltung" }] }),
  component: EinstellungenLayout,
});

function EinstellungenLayout() {
  return <Outlet />;
}