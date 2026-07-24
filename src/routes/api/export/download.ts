import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { APP_URL } from "@/lib/config";

const MAX_BASE64_BYTES = 25_000_000;
const ALLOWED_CONTENT_TYPES = new Set([
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "text/csv",
  "application/octet-stream",
]);

const LOVABLE_PREVIEW_ORIGINS = new Set([
  "https://a9a57e34-6bcd-4c59-9526-a8d67e2c7859.lovableproject.com",
]);

const exportPayloadSchema = z.object({
  filename: z.string().trim().min(1).max(180),
  contentType: z.string().trim().min(1).max(120),
  base64: z
    .string()
    .min(1)
    .max(MAX_BASE64_BYTES)
    .regex(/^[A-Za-z0-9+/]+={0,2}$/),
});

function sanitizeFilename(filename: string): string {
  const cleaned = filename
    // eslint-disable-next-line no-control-regex -- bewusst: Steuerzeichen aus Dateinamen entfernen
    .replace(/[\u0000-\u001f\u007f]/g, "_")
    .replace(/[\\/:*?"<>|]+/g, "_")
    .replace(/\s+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 180);
  return cleaned || "export.bin";
}

function contentDisposition(filename: string): string {
  const safe = sanitizeFilename(filename);
  const ascii = safe.replace(/[^\x20-\x7E]/g, "_").replace(/["\\]/g, "_");
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(safe)}`;
}

function normalizeContentType(contentType: string): string {
  const base = contentType.split(";")[0]?.trim().toLowerCase() || "application/octet-stream";
  if (!ALLOWED_CONTENT_TYPES.has(base)) return "application/octet-stream";
  if (base === "text/csv") return "text/csv; charset=utf-8";
  return base;
}

function isTrustedRequestUrl(value: string, requestOrigin: string, appOrigin: string): boolean {
  try {
    const urlOrigin = new URL(value).origin;
    return urlOrigin === requestOrigin || urlOrigin === appOrigin || LOVABLE_PREVIEW_ORIGINS.has(urlOrigin);
  } catch {
    return false;
  }
}

function isExplicitForeignRequest(request: Request): boolean {
  const origin = request.headers.get("origin");
  const referer = request.headers.get("referer");
  const secFetchSite = request.headers.get("sec-fetch-site");

  const requestOrigin = new URL(request.url).origin;
  const appOrigin = new URL(APP_URL).origin;
  const originForeign = Boolean(origin && !isTrustedRequestUrl(origin, requestOrigin, appOrigin));
  const refererForeign = Boolean(
    !origin && referer && !isTrustedRequestUrl(referer, requestOrigin, appOrigin),
  );
  return originForeign || refererForeign || secFetchSite === "cross-site";
}

function forbiddenOriginResponse(): Response {
  return new Response("Forbidden", {
    status: 403,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

export const Route = createFileRoute("/api/export/download")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        // Härtung: fremde Seiten dürfen unseren Download-Endpunkt nicht als
        // Attachment-Vehikel unter unserer Domain missbrauchen.
        // Safari sendet bei same-origin-POSTs teils weder Origin noch Sec-Fetch-Site —
        // abgelehnt wird nur EXPLIZIT Fremdes.
        if (isExplicitForeignRequest(request)) {
          return forbiddenOriginResponse();
        }
        try {
          const formData = await request.formData();
          const parsed = exportPayloadSchema.parse({
            filename: formData.get("filename"),
            contentType: formData.get("contentType"),
            base64: formData.get("base64"),
          });

          const bytes = Buffer.from(parsed.base64, "base64");
          if (bytes.length === 0 || bytes.length > 18_000_000) {
            return new Response("Export ist zu groß.", { status: 413 });
          }

          const contentType = normalizeContentType(parsed.contentType);
          const disposition = contentDisposition(parsed.filename);

          if (formData.get("probe") === "form") {
            return Response.json(
              {
                ok: true,
                status: 200,
                statusText: "OK",
                contentType,
                contentDisposition: disposition,
                contentLength: String(bytes.length),
                bodyPreview: `${bytes.length} Bytes validiert`,
                url: "/api/export/download",
                transport: "form",
              },
              { headers: { "Cache-Control": "no-store" } },
            );
          }

          return new Response(bytes, {
            status: 200,
            headers: {
              "Content-Type": contentType,
              "Content-Disposition": disposition,
              "Content-Length": String(bytes.length),
              "Cache-Control": "no-store",
              "X-Content-Type-Options": "nosniff",
            },
          });
        } catch (error) {
          const message = error instanceof Error ? error.message : "Ungültiger Export.";
          return new Response(message, {
            status: 400,
            headers: {
              "Content-Type": "text/plain; charset=utf-8",
              "Cache-Control": "no-store",
            },
          });
        }
      },
    },
  },
});
