// Browser-only Harness für den Sammel-PDF-Splitter. Nutzt pdfjs-dist zum
// Auslesen des Seiten-Texts und pdf-lib zum Bauen der Einzel-PDFs.
// Wirft NICHT die PDF-Bytes in Konsole/Logs. Keine Buffer-API — der Code
// läuft im Browser. Server-Code wird vom Splitter NICHT angefasst.

import { PDFDocument } from "pdf-lib";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import {
  parsePersoFromPageText,
  parseRunMonth,
  groupPagesByPerso,
  type PageMeta,
} from "./split-combined-core";

export type SplitOutput = {
  fileName: string;
  bytes: Uint8Array;
  perso: string;
  pages: number[];
};

export type SplitResult = {
  outputs: SplitOutput[];
  unparsablePages: number[];
  totalPages: number;
};

export async function extractPageTexts(file: File | Blob): Promise<string[]> {
  const data = await file.arrayBuffer();
  const pdfjsLib = await import("pdfjs-dist");
  pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;
  const pdf = await pdfjsLib.getDocument({ data }).promise;
  const out: string[] = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const text = content.items
      .map((it) => ("str" in it ? (it as { str: string }).str : ""))
      .join(" ");
    out.push(text);
  }
  return out;
}

export async function splitCombinedPdf(file: File): Promise<SplitResult> {
  const texts = await extractPageTexts(file);
  const metas: PageMeta[] = texts.map((text, i) => {
    const rm = parseRunMonth(text);
    return {
      page: i,
      perso: parsePersoFromPageText(text),
      runYear: rm?.year ?? null,
      runMonth: rm?.month ?? null,
    };
  });
  const { groups, unparsablePages } = groupPagesByPerso(metas);

  const srcBytes = await file.arrayBuffer();
  const src = await PDFDocument.load(srcBytes);

  const outputs: SplitOutput[] = [];
  for (const group of groups) {
    const out = await PDFDocument.create();
    const copied = await out.copyPages(src, group.pages);
    copied.forEach((p) => out.addPage(p));
    const bytes = await out.save();
    outputs.push({
      fileName: group.fileName,
      bytes,
      perso: group.perso,
      pages: group.pages,
    });
  }

  return { outputs, unparsablePages, totalPages: texts.length };
}

/**
 * Base64 aus Bytes — ohne Buffer (Browser). Geht in Chunks, damit
 * String.fromCharCode.apply auch bei großen PDFs nicht überläuft.
 */
export function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    const slice = bytes.subarray(i, i + chunk);
    binary += String.fromCharCode.apply(null, Array.from(slice));
  }
  return btoa(binary);
}
