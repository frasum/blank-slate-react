// DP2 — Build-stabile App-Version, injiziert via Vite `define` in
// vite.config.ts. Wird vom Display-Endpoint als `appVersion` im Payload
// mitgeliefert und clientseitig für den Versions-Handschlag benutzt.
// Fallback "unknown" nur, falls die Konstante nicht ersetzt wurde
// (z. B. in Test-Setups ohne Bundler-Define).
declare const __APP_VERSION__: string | undefined;

export const APP_VERSION: string =
  typeof __APP_VERSION__ === "string" && __APP_VERSION__.length > 0
    ? __APP_VERSION__
    : "unknown";