import { useEffect, useRef, useState } from "react";
import workerUrl from "pdfjs-dist/legacy/build/pdf.worker.min.mjs?url";

interface PdfCanvasPreviewProps {
  blob: Blob;
}

export function PdfCanvasPreview({ blob }: PdfCanvasPreviewProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const container = containerRef.current;
    if (!container) return;
    container.innerHTML = "";
    setStatus("loading");
    setError(null);

    (async () => {
      try {
        const data = await blob.arrayBuffer();
        if (cancelled) return;
        const pdfjsLib = await import("pdfjs-dist/legacy/build/pdf.mjs");
        pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;
        if (cancelled) return;
        const pdf = await pdfjsLib.getDocument({ data }).promise;
        if (cancelled) return;
        const dpr = Math.max(window.devicePixelRatio || 1, 1);
        const containerWidth = container.clientWidth || 800;
        for (let i = 1; i <= pdf.numPages; i++) {
          if (cancelled) return;
          const page = await pdf.getPage(i);
          const baseViewport = page.getViewport({ scale: 1 });
          const cssScale = (containerWidth - 16) / baseViewport.width;
          const viewport = page.getViewport({ scale: cssScale * dpr });
          const canvas = document.createElement("canvas");
          canvas.width = viewport.width;
          canvas.height = viewport.height;
          canvas.style.width = `${baseViewport.width * cssScale}px`;
          canvas.style.height = `${baseViewport.height * cssScale}px`;
          canvas.className = "mx-auto my-2 rounded border shadow-sm bg-white";
          container.appendChild(canvas);
          const ctx = canvas.getContext("2d");
          if (!ctx) continue;
          await page.render({ canvasContext: ctx, viewport, canvas }).promise;
        }
        if (!cancelled) setStatus("ready");
      } catch (e) {
        if (cancelled) return;
        setError((e as Error).message ?? "Unbekannter Fehler");
        setStatus("error");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [blob]);

  return (
    <div className="relative h-full w-full overflow-auto rounded border bg-muted/30">
      {status === "loading" && (
        <div className="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground">
          PDF wird gerendert…
        </div>
      )}
      {status === "error" && (
        <div className="absolute inset-0 flex items-center justify-center px-6 text-center text-sm text-destructive">
          PDF-Vorschau fehlgeschlagen: {error}
        </div>
      )}
      <div ref={containerRef} className="p-2" />
    </div>
  );
}
