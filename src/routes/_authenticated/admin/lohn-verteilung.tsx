import { useState } from "react";
import { createFileRoute, useRouteContext, redirect } from "@tanstack/react-router";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  assignPayslips,
  planPayslipAssignment,
  type AssignUploadResult,
} from "@/lib/payslips/payslip-assign.functions";
import type { AssignDecision, AssignStatus } from "@/lib/payslips/payslip-assign-core";
import {
  splitCombinedPdf,
  bytesToBase64,
  type SplitOutput,
} from "@/lib/payslips/split-combined";

export const Route = createFileRoute("/_authenticated/admin/lohn-verteilung")({
  head: () => ({ meta: [{ title: "Lohn-Verteilung · Verwaltung" }] }),
  beforeLoad: ({ context }) => {
    // Doppeltes Admin-Gate: serverseitige Schreib-Fns prüfen ebenfalls.
    const role = (context as { identity?: { role?: string } }).identity?.role;
    if (role !== "admin") throw redirect({ to: "/admin" });
  },
  component: LohnVerteilungPage,
});

const STATUS_LABEL: Record<AssignStatus, string> = {
  matched: "Zugeordnet",
  matched_inactive: "Zugeordnet (inaktiv)",
  unknown_perso: "Unbekannte Personal-Nr",
  ambiguous: "Mehrdeutig — übersprungen",
  unparsable: "Name nicht lesbar",
};

function isUploadable(status: AssignStatus): boolean {
  return status === "matched" || status === "matched_inactive";
}

async function fileToBase64(file: File): Promise<string> {
  const dataUrl: string = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error ?? new Error("Lesefehler"));
    reader.onload = () => resolve(String(reader.result));
    reader.readAsDataURL(file);
  });
  return dataUrl.split(",")[1] ?? "";
}

function LohnVerteilungPage() {
  const { identity } = useRouteContext({ from: "/_authenticated/admin" });
  const isAdmin = identity.role === "admin";

  const [files, setFiles] = useState<File[]>([]);
  const [splitOutputs, setSplitOutputs] = useState<SplitOutput[]>([]);
  const [splitTotalPages, setSplitTotalPages] = useState<number | null>(null);
  const [splitUnparsable, setSplitUnparsable] = useState<number[]>([]);
  const [splitting, setSplitting] = useState(false);
  const [splitError, setSplitError] = useState<string | null>(null);
  const [decisions, setDecisions] = useState<AssignDecision[] | null>(null);
  const [results, setResults] = useState<AssignUploadResult[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const callPlan = useServerFn(planPayslipAssignment);
  const callAssign = useServerFn(assignPayslips);

  const planFileNames = (): { fileName: string }[] => {
    if (splitOutputs.length > 0) return splitOutputs.map((o) => ({ fileName: o.fileName }));
    return files.map((f) => ({ fileName: f.name }));
  };

  const planMut = useMutation({
    mutationFn: async () => {
      const list = planFileNames();
      if (list.length === 0) throw new Error("Keine Dateien gewählt.");
      const res = await callPlan({ data: { files: list } });
      return res;
    },
    onSuccess: (data) => {
      setDecisions(data);
      setResults(null);
      setError(null);
    },
    onError: (e) => setError(e instanceof Error ? e.message : String(e)),
  });

  const assignMut = useMutation({
    mutationFn: async () => {
      if (!decisions) throw new Error("Zuerst Vorschau erzeugen.");
      const uploadable = decisions.filter((d) => isUploadable(d.status)).map((d) => d.fileName);
      const set = new Set(uploadable);
      const payload: { fileName: string; contentBase64: string }[] = [];
      if (splitOutputs.length > 0) {
        for (const o of splitOutputs) {
          if (!set.has(o.fileName)) continue;
          payload.push({ fileName: o.fileName, contentBase64: bytesToBase64(o.bytes) });
        }
      } else {
        for (const f of files) {
          if (!set.has(f.name)) continue;
          payload.push({ fileName: f.name, contentBase64: await fileToBase64(f) });
        }
      }
      if (payload.length === 0) throw new Error("Keine hochladbaren Dateien.");
      return callAssign({ data: { files: payload } });
    },
    onSuccess: (data) => {
      setResults(data);
      setError(null);
    },
    onError: (e) => setError(e instanceof Error ? e.message : String(e)),
  });

  if (!isAdmin) {
    return <p className="text-sm text-destructive">Nur für Admins.</p>;
  }

  const uploadableCount = decisions?.filter((d) => isUploadable(d.status)).length ?? 0;
  const uploadedCount = results?.filter((r) => r.status === "uploaded").length ?? 0;
  const skippedCount = results ? results.length - uploadedCount : 0;

  function resetDownstream() {
    setDecisions(null);
    setResults(null);
    setError(null);
  }

  async function onCombinedSelected(file: File | null) {
    setSplitError(null);
    setSplitOutputs([]);
    setSplitTotalPages(null);
    setSplitUnparsable([]);
    resetDownstream();
    if (!file) return;
    // Beim Sammel-PDF-Modus den Einzeldatei-Modus räumen, damit nur EINE Quelle aktiv ist.
    setFiles([]);
    setSplitting(true);
    try {
      const res = await splitCombinedPdf(file);
      setSplitOutputs(res.outputs);
      setSplitTotalPages(res.totalPages);
      setSplitUnparsable(res.unparsablePages);
    } catch (e) {
      setSplitError(e instanceof Error ? e.message : String(e));
    } finally {
      setSplitting(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Lohn-Verteilung</h1>
        <p className="text-sm text-muted-foreground">
          Entweder mehrere bereits gesplittete edlohn-PDFs hochladen — oder das Sammel-PDF
          (Monatsexport je Mandant) wählen, das hier im Browser nach Personal-Nr aufgeteilt
          wird. Das System legt jede PDF in den Ordner des passenden Mitarbeiters. Mehrdeutige
          oder unbekannte Dateien werden übersprungen, nie falsch zugeordnet.
        </p>
      </div>

      <div className="space-y-3 rounded-lg border border-border bg-card p-4">
        <h2 className="text-sm font-semibold">Sammel-PDF aufteilen</h2>
        <input
          type="file"
          accept="application/pdf"
          onChange={(e) => {
            const f = e.target.files?.[0] ?? null;
            void onCombinedSelected(f);
          }}
        />
        {splitting ? <p className="text-sm text-muted-foreground">Teile PDF auf…</p> : null}
        {splitError ? <p className="text-sm text-destructive">{splitError}</p> : null}
        {splitOutputs.length > 0 && splitTotalPages !== null ? (
          <p className="text-sm">
            {splitTotalPages} Seiten → <strong>{splitOutputs.length} Mitarbeiter</strong>.
          </p>
        ) : null}
        {splitUnparsable.length > 0 ? (
          <p className="text-sm text-destructive">
            Warnung: {splitUnparsable.length} Seite(n) ohne lesbare Personal-Nr werden NICHT
            hochgeladen — Seiten (1-basiert):{" "}
            {splitUnparsable.map((p) => p + 1).join(", ")}
          </p>
        ) : null}
      </div>

      <div className="space-y-3 rounded-lg border border-border bg-card p-4">
        <h2 className="text-sm font-semibold">Einzeldateien hochladen</h2>
        <input
          type="file"
          accept="application/pdf"
          multiple
          onChange={(e) => {
            setFiles(Array.from(e.target.files ?? []));
            setSplitOutputs([]);
            setSplitTotalPages(null);
            setSplitUnparsable([]);
            resetDownstream();
          }}
        />
        <div className="flex gap-2">
          <button
            type="button"
            className="rounded-md border border-border bg-background px-3 py-1.5 text-sm font-medium hover:bg-accent disabled:opacity-50"
            disabled={(files.length === 0 && splitOutputs.length === 0) || planMut.isPending}
            onClick={() => planMut.mutate()}
          >
            {planMut.isPending ? "Prüfe…" : "Vorschau"}
          </button>
          <button
            type="button"
            className="rounded-md border border-border bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
            disabled={!decisions || uploadableCount === 0 || assignMut.isPending}
            onClick={() => assignMut.mutate()}
          >
            {assignMut.isPending ? "Lade hoch…" : `Zuordnen & hochladen (${uploadableCount})`}
          </button>
        </div>
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
      </div>

      {decisions ? (
        <div className="rounded-lg border border-border bg-card">
          <table className="w-full text-sm">
            <thead className="border-b border-border text-left text-xs uppercase text-muted-foreground">
              <tr>
                <th className="p-2">Datei</th>
                <th className="p-2">Perso</th>
                <th className="p-2">Mitarbeiter</th>
                <th className="p-2">Status</th>
              </tr>
            </thead>
            <tbody>
              {decisions.map((d) => {
                const ok = isUploadable(d.status);
                return (
                  <tr
                    key={d.fileName}
                    className={"border-b border-border/60 " + (ok ? "" : "opacity-60")}
                  >
                    <td className="p-2 font-mono text-xs">{d.fileName}</td>
                    <td className="p-2">{d.persoNr ?? "—"}</td>
                    <td className="p-2">{d.displayName ?? "—"}</td>
                    <td className="p-2">{STATUS_LABEL[d.status]}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : null}

      {results ? (
        <div className="space-y-2 rounded-lg border border-border bg-card p-4">
          <p className="text-sm font-medium">
            {uploadedCount} hochgeladen, {skippedCount} übersprungen.
          </p>
          <ul className="space-y-1 text-xs">
            {results.map((r) => (
              <li key={r.fileName} className="font-mono">
                {r.fileName} — {r.status}
                {r.reason ? ` · ${r.reason}` : ""}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
