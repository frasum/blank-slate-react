import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const MAX_BASE64_BYTES = 25_000_000;
const ALLOWED_CONTENT_TYPES = new Set([
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "text/csv",
  "application/octet-stream",
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

export const Route = createFileRoute("/api/public/export/download")({
  server: {
    handlers: {
      POST: async ({ request }) => {
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
          return new Response(bytes, {
            status: 200,
            headers: {
              "Content-Type": contentType,
              "Content-Disposition": contentDisposition(parsed.filename),
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