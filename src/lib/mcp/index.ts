import { auth, defineMcp } from "@lovable.dev/mcp-js";
import echoTool from "./tools/echo";
import getBilanzYearTool from "./tools/get-bilanz-year";

// Direkter Supabase-Host (Frank: NIE die .lovable.cloud-Proxy-URL für den
// OAuth-Issuer — mcp-js prüft die Discovery gegen exakt diese Host-Angabe).
// VITE_SUPABASE_PROJECT_ID wird von Vite als String-Literal inlined.
const projectRef = import.meta.env.VITE_SUPABASE_PROJECT_ID ?? "project-ref-unset";

export default defineMcp({
  name: "coco-mcp",
  title: "COCO – Central Operations Cockpit",
  version: "0.1.0",
  instructions:
    "MCP-Server für COCO (Gastronomie-Betriebsplattform). Auth: Supabase-OAuth (pro Nutzer). `get_bilanz_year` liest Jahresabschlüsse admin-only und automatisch auf die eigene Organisation begrenzt.",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: [echoTool, getBilanzYearTool],
});
