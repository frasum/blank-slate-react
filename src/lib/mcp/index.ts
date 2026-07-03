import { defineMcp } from "@lovable.dev/mcp-js";
import echoTool from "./tools/echo";
import getBilanzYearTool from "./tools/get-bilanz-year";

export default defineMcp({
  name: "coco-mcp",
  title: "COCO – Central Operations Cockpit",
  version: "0.1.0",
  instructions:
    "MCP-Server für COCO (Gastronomie-Betriebsplattform). Aktuell nur der `echo`-Tool zum Prüfen der Verbindung; weitere Tools werden nachgezogen.",
  tools: [echoTool, getBilanzYearTool],
});