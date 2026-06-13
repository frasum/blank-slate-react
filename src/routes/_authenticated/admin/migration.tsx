// B2c Commit 4 — Migration-UI (Admin-only).
// Minimal: Upload + Dry-Run, Mapping-Tabelle, Commit, Abgleichsbericht.

import { createFileRoute, redirect } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { listStaff } from "@/lib/admin/staff.functions";
import {
  confirmMapping,
  getReconciliationReport,
  getReconciliationReportFromDb,
  listIdentityMappings,
  parseImportCsv,
  proposeIdentityMappings,
  runImport,
  bootstrapMissingStaff,
  reassignImportedStaff,
  deleteImportedShifts,
} from "@/lib/migration/migration.functions";

type SourceSystem = "tagesabrechnung" | "bunker";

export const Route = createFileRoute("/_authenticated/admin/migration")({
  head: () => ({ meta: [{ title: "Migration & Parallelbetrieb" }] }),
  beforeLoad: ({ context }) => {
    // admin-layout setzt context.identity; hier zusätzlich Admin-only erzwingen.
    const identity = (context as { identity?: { role: string } }).identity;
    if (!identity || identity.role !== "admin") {
      throw redirect({ to: "/admin" });
    }
  },
  component: MigrationPage,
});

function MigrationPage() {
  const qc = useQueryClient();
  const [sourceSystem, setSourceSystem] = useState<SourceSystem>("tagesabrechnung");
  const [csvText, setCsvText] = useState<string>("");
  const [fileName, setFileName] = useState<string>("");
  const [groupBy, setGroupBy] = useState<"week" | "cycle">("cycle");
  const [from, setFrom] = useState<string>("");
  const [to, setTo] = useState<string>("");

  const callParse = useServerFn(parseImportCsv);
  const callPropose = useServerFn(proposeIdentityMappings);
  const callList = useServerFn(listIdentityMappings);
  const callConfirm = useServerFn(confirmMapping);
  const callRun = useServerFn(runImport);
  const callReport = useServerFn(getReconciliationReport);
  const callReportDb = useServerFn(getReconciliationReportFromDb);
  const fetchStaff = useServerFn(listStaff);
  const callBootstrap = useServerFn(bootstrapMissingStaff);
  const callReassign = useServerFn(reassignImportedStaff);
  const callDeleteImported = useServerFn(deleteImportedShifts);
  const [deleteStaffId, setDeleteStaffId] = useState<string>("");

  const staffQ = useQuery({ queryKey: ["admin-staff"], queryFn: () => fetchStaff() });
  const mappingsQ = useQuery({
    queryKey: ["identity-mappings", sourceSystem],
    queryFn: () => callList({ data: { sourceSystem } }),
  });

  const parseMut = useMutation({
    mutationFn: () => callParse({ data: { sourceSystem, csvText } }),
    onError: (e: Error) => toast.error(e.message),
  });

  const proposeMut = useMutation({
    mutationFn: () => callPropose({ data: { sourceSystem, csvText } }),
    onSuccess: () => {
      toast.success("Identitäts-Vorschläge aktualisiert.");
      void qc.invalidateQueries({ queryKey: ["identity-mappings", sourceSystem] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const dryRunMut = useMutation({
    mutationFn: () => callRun({ data: { sourceSystem, csvText, mode: "dry_run" } }),
    onError: (e: Error) => toast.error(e.message),
  });

  const commitMut = useMutation({
    mutationFn: () => callRun({ data: { sourceSystem, csvText, mode: "commit" } }),
    onSuccess: (r) => {
      toast.success(
        `Import abgeschlossen. Importiert: ${r.counters.imported}, Wasserlinie: ${r.lockedThrough ?? "unverändert"}.`,
      );
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const reportMut = useMutation({
    mutationFn: () =>
      callReport({
        data: {
          sourceSystem,
          csvText,
          groupBy,
          from: from || undefined,
          to: to || undefined,
        },
      }),
    onError: (e: Error) => toast.error(e.message),
  });

  const reportDbMut = useMutation({
    mutationFn: () =>
      callReportDb({
        data: {
          sourceSystem,
          csvText,
          groupBy,
          from: from || undefined,
          to: to || undefined,
        },
      }),
    onError: (e: Error) => toast.error(e.message),
  });

  const confirmMut = useMutation({
    mutationFn: (vars: { id: string; staffId: string | null }) => callConfirm({ data: vars }),
    onSuccess: () => {
      toast.success("Mapping gespeichert.");
      void qc.invalidateQueries({ queryKey: ["identity-mappings", sourceSystem] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const bootstrapMut = useMutation({
    mutationFn: () => callBootstrap({ data: { sourceSystem } }),
    onSuccess: (r) => {
      toast.success(
        `Staff-Bootstrap: ${r.created} angelegt, ${r.linked} verknüpft, ${r.skipped} übersprungen.`,
      );
      void qc.invalidateQueries({ queryKey: ["identity-mappings", sourceSystem] });
      void qc.invalidateQueries({ queryKey: ["admin-staff"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const reassignDryMut = useMutation({
    mutationFn: () => callReassign({ data: { sourceSystem, mode: "dry_run" } }),
    onError: (e: Error) => toast.error(e.message),
  });
  const reassignCommitMut = useMutation({
    mutationFn: () => callReassign({ data: { sourceSystem, mode: "commit" } }),
    onSuccess: (r) => {
      toast.success(`Umgehängt: ${r.totalUpdated} Schicht(en) in ${r.groups.length} Gruppe(n).`);
      void reassignDryMut.reset();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteImportedDryMut = useMutation({
    mutationFn: () =>
      callDeleteImported({ data: { mode: "dry_run", staffId: deleteStaffId || null } }),
    onError: (e: Error) => toast.error(e.message),
  });
  const deleteImportedCommitMut = useMutation({
    mutationFn: () =>
      callDeleteImported({ data: { mode: "commit", staffId: deleteStaffId || null } }),
    onSuccess: (r) => {
      toast.success(`Gelöscht: ${r.totalDeleted} Import-Zeile(n).`);
      void deleteImportedDryMut.reset();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const mappings = useMemo(() => mappingsQ.data?.mappings ?? [], [mappingsQ.data]);
  const unconfirmedCount = useMemo(
    () => mappings.filter((m) => !m.confirmed_at).length,
    [mappings],
  );

  function onFileChange(ev: React.ChangeEvent<HTMLInputElement>) {
    const file = ev.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = () => setCsvText(String(reader.result ?? ""));
    reader.readAsText(file, "utf-8");
  }

  const parseRes = parseMut.data;
  const dryRes = dryRunMut.data;
  const reportRows = (reportMut.data?.rows ?? []).filter((r) => r.hasDifference);
  const reportDbRows = (reportDbMut.data?.rows ?? []).filter((r) => r.hasDifference);
  const staffNameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const s of staffQ.data ?? []) m.set(s.id, s.displayName);
    return m;
  }, [staffQ.data]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          Migration & Parallelbetrieb
        </h1>
        <p className="text-sm text-muted-foreground">
          CSV-Import aus Tagesabrechnung / Bunker. Idempotent über <code>import_key</code>. Commit
          schiebt die Wasserlinie auf <code>max(business_date)</code> vor.
        </p>
      </div>

      <Card className="p-4 space-y-3">
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <Label>Quellsystem</Label>
            <select
              className="w-48 rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={sourceSystem}
              onChange={(e) => setSourceSystem(e.target.value as SourceSystem)}
            >
              <option value="tagesabrechnung">tagesabrechnung</option>
              <option value="bunker">bunker</option>
            </select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="file">CSV-Datei</Label>
            <Input id="file" type="file" accept=".csv,text/csv" onChange={onFileChange} />
            {fileName && (
              <div className="text-xs text-muted-foreground">
                {fileName} · {csvText.length.toLocaleString("de-DE")} Zeichen
              </div>
            )}
          </div>
          <div className="ml-auto flex gap-2">
            <Button
              variant="outline"
              disabled={!csvText || parseMut.isPending}
              onClick={() => parseMut.mutate()}
            >
              {parseMut.isPending ? "Lese…" : "Vorschau"}
            </Button>
            <Button
              variant="outline"
              disabled={!csvText || proposeMut.isPending}
              onClick={() => proposeMut.mutate()}
            >
              {proposeMut.isPending ? "Schlage vor…" : "Identitäten vorschlagen"}
            </Button>
            <Button disabled={!csvText || dryRunMut.isPending} onClick={() => dryRunMut.mutate()}>
              {dryRunMut.isPending ? "Dry-Run…" : "Dry-Run"}
            </Button>
          </div>
        </div>

        {parseRes && <CountersView title="Vorschau (Parser-Zähler)" counters={parseRes.counters} />}
        {dryRes && (
          <CountersView
            title={`Dry-Run · ${dryRes.fileHash.slice(0, 12)}…`}
            counters={dryRes.counters}
          />
        )}
      </Card>

      <Card className="p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="font-medium">Identitäts-Mapping</div>
          <div className="flex items-center gap-2 text-sm">
            <Button
              size="sm"
              variant="outline"
              disabled={bootstrapMut.isPending}
              onClick={() => bootstrapMut.mutate()}
            >
              {bootstrapMut.isPending ? "Lege an…" : "Fehlende Staff anlegen"}
            </Button>
            {unconfirmedCount > 0 ? (
              <Badge variant="destructive">{unconfirmedCount} unbestätigt</Badge>
            ) : (
              <Badge variant="secondary">alle bestätigt</Badge>
            )}
          </div>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Alt-ID</TableHead>
              <TableHead>Alt-Name</TableHead>
              <TableHead>Staff</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Aktion</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {mappings.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground">
                  Noch keine Mappings — „Identitäten vorschlagen" laufen lassen.
                </TableCell>
              </TableRow>
            )}
            {mappings.map((m) => (
              <MappingRow
                key={m.id}
                row={m}
                staff={staffQ.data ?? []}
                onConfirm={(staffId) => confirmMut.mutate({ id: m.id, staffId })}
                pending={confirmMut.isPending}
              />
            ))}
          </TableBody>
        </Table>
      </Card>

      <Card className="p-4 space-y-3">
        <div className="font-medium">Commit</div>
        <p className="text-sm text-muted-foreground">
          Schreibt Einträge mit <code>source='import'</code>. Bereits importierte Schlüssel werden
          übersprungen. Unbestätigte Mappings blockieren nicht den Commit, ihre Schichten landen
          aber im Skip-Bucket <code>unmapped_staff</code>.
        </p>
        <div className="flex items-center gap-3">
          <Button
            variant="destructive"
            disabled={!csvText || commitMut.isPending}
            onClick={() => {
              if (!window.confirm("Commit ausführen? Schreibt in time_entries.")) return;
              commitMut.mutate();
            }}
          >
            {commitMut.isPending ? "Commit läuft…" : "Commit ausführen"}
          </Button>
          {commitMut.data && (
            <span className="text-sm text-muted-foreground">
              Run-ID: <code>{commitMut.data.runId}</code> · Wasserlinie:{" "}
              <code>{commitMut.data.lockedThrough ?? "—"}</code>
            </span>
          )}
        </div>
        {commitMut.data && (
          <CountersView title="Commit-Zähler" counters={commitMut.data.counters} />
        )}
      </Card>

      <Card className="p-4 space-y-3">
        <div className="font-medium">Fehlzuordnungen korrigieren</div>
        <p className="text-sm text-muted-foreground">
          Hängt bereits importierte Schichten (<code>source='import'</code>) auf den laut
          bestätigtem Identitäts-Mapping korrekten Mitarbeiter um. Geld- und Zeitwerte bleiben
          unverändert, die Wasserlinie wird NICHT verschoben. Idempotent.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            disabled={reassignDryMut.isPending}
            onClick={() => reassignDryMut.mutate()}
          >
            {reassignDryMut.isPending ? "Prüfe…" : "Dry-Run"}
          </Button>
          <Button
            variant="destructive"
            disabled={reassignCommitMut.isPending || !reassignDryMut.data}
            onClick={() => {
              const n = reassignDryMut.data?.totalMismatched ?? 0;
              if (!window.confirm(`Commit: ${n} Schicht(en) umhängen?`)) return;
              reassignCommitMut.mutate();
            }}
            title={!reassignDryMut.data ? "Erst Dry-Run ausführen." : undefined}
          >
            {reassignCommitMut.isPending ? "Commit läuft…" : "Commit ausführen"}
          </Button>
        </div>
        {(reassignDryMut.data || reassignCommitMut.data) && (
          <ReassignReport
            result={reassignCommitMut.data ?? reassignDryMut.data ?? null}
            mode={reassignCommitMut.data ? "commit" : "dry_run"}
          />
        )}
      </Card>

      <Card className="p-4 space-y-3">
        <div className="font-medium">Import-Zeilen löschen (Reparatur)</div>
        <p className="text-sm text-muted-foreground">
          Löscht ausschließlich Zeilen mit <code>source='import'</code>; Stempeluhr- und
          Manual-Einträge bleiben unangetastet. Wasserlinie wird NICHT verschoben. Anwendung: nach
          Korrektur der Identitäts-Mappings die fehlzugeordneten Import-Schichten entfernen und
          dieselbe CSV erneut importieren — durch <code>import_key</code> idempotent.
        </p>
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <Label>Nur Mitarbeiter (optional)</Label>
            <select
              className="w-64 rounded-md border border-input bg-background px-2 py-2 text-sm"
              value={deleteStaffId}
              onChange={(e) => {
                setDeleteStaffId(e.target.value);
                deleteImportedDryMut.reset();
                deleteImportedCommitMut.reset();
              }}
            >
              <option value="">— alle Import-Zeilen —</option>
              {(staffQ.data ?? []).map((s) => (
                <option key={s.id} value={s.id}>
                  {s.displayName}
                </option>
              ))}
            </select>
          </div>
          <Button
            variant="outline"
            disabled={deleteImportedDryMut.isPending}
            onClick={() => deleteImportedDryMut.mutate()}
          >
            {deleteImportedDryMut.isPending ? "Prüfe…" : "Dry-Run"}
          </Button>
          <Button
            variant="destructive"
            disabled={deleteImportedCommitMut.isPending || !deleteImportedDryMut.data}
            onClick={() => {
              const n = deleteImportedDryMut.data?.totalMatched ?? 0;
              if (n === 0) return;
              if (
                !window.confirm(
                  `Wirklich ${n} Import-Zeile(n) UNWIEDERBRINGLICH löschen?`,
                )
              )
                return;
              deleteImportedCommitMut.mutate();
            }}
            title={!deleteImportedDryMut.data ? "Erst Dry-Run ausführen." : undefined}
          >
            {deleteImportedCommitMut.isPending ? "Lösche…" : "Löschen ausführen"}
          </Button>
        </div>
        {(deleteImportedDryMut.data || deleteImportedCommitMut.data) && (
          <DeleteImportedReport
            result={deleteImportedCommitMut.data ?? deleteImportedDryMut.data ?? null}
            mode={deleteImportedCommitMut.data ? "commit" : "dry_run"}
          />
        )}
      </Card>

      <Card className="p-4 space-y-3">
        <div className="font-medium">Abgleichsbericht (Alt-Topf vs. neu)</div>
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <Label>Von</Label>
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>Bis</Label>
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>Gruppierung</Label>
            <select
              className="w-40 rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={groupBy}
              onChange={(e) => setGroupBy(e.target.value as "week" | "cycle")}
            >
              <option value="cycle">Abrechnungszyklus (26.–25.)</option>
              <option value="week">Kalenderwoche</option>
            </select>
          </div>
          <Button
            variant="outline"
            disabled={!csvText || reportMut.isPending}
            onClick={() => reportMut.mutate()}
          >
            {reportMut.isPending ? "Berechne…" : "Bericht erstellen"}
          </Button>
          <Button
            variant="outline"
            disabled={!csvText || reportDbMut.isPending}
            onClick={() => reportDbMut.mutate()}
          >
            {reportDbMut.isPending ? "DB-Berechne…" : "Bericht aus DB"}
          </Button>
        </div>

        {reportRows.length > 0 && (
          <ReconciliationTable
            title="Alt-Topf (CSV) vs. neu (CSV-Adapter)"
            rows={reportRows}
            staffNameById={staffNameById}
          />
        )}
        {reportMut.data && reportRows.length === 0 && (
          <p className="text-sm text-muted-foreground">
            CSV-Adapter: keine Differenzen im Zeitraum.
          </p>
        )}
        {reportDbRows.length > 0 && (
          <ReconciliationTable
            title="Alt-Topf (CSV) vs. neu (aus DB)"
            rows={reportDbRows}
            staffNameById={staffNameById}
          />
        )}
        {reportDbMut.data && reportDbRows.length === 0 && (
          <p className="text-sm text-muted-foreground">
            DB-Adapter: keine Differenzen im Zeitraum.
          </p>
        )}
      </Card>
    </div>
  );
}

function CountersView({
  title,
  counters,
}: {
  title: string;
  counters: {
    read: number;
    imported: number;
    skippedByReason: Record<string, number>;
  };
}) {
  const skipped = Object.values(counters.skippedByReason).reduce((a, b) => a + b, 0);
  const balanced = counters.read === counters.imported + skipped;
  return (
    <div className="rounded-md border border-border bg-muted/30 p-3 text-sm">
      <div className="mb-1 font-medium">{title}</div>
      <div className="flex flex-wrap gap-4">
        <span>
          gelesen: <strong>{counters.read}</strong>
        </span>
        <span>
          importiert: <strong>{counters.imported}</strong>
        </span>
        <span>
          übersprungen: <strong>{skipped}</strong>
        </span>
        {Object.entries(counters.skippedByReason).map(([k, v]) =>
          v > 0 ? (
            <span key={k} className="text-muted-foreground">
              {k}: {v}
            </span>
          ) : null,
        )}
        {!balanced && <Badge variant="destructive">Bilanz verletzt!</Badge>}
      </div>
    </div>
  );
}

function MappingRow({
  row,
  staff,
  onConfirm,
  pending,
}: {
  row: {
    id: string;
    alt_id: string;
    alt_name: string;
    staff_id: string | null;
    confirmed_at: string | null;
  };
  staff: { id: string; displayName: string }[];
  onConfirm: (staffId: string | null) => void;
  pending: boolean;
}) {
  const [pick, setPick] = useState<string>(row.staff_id ?? "");
  return (
    <TableRow>
      <TableCell className="font-mono text-xs">{row.alt_id}</TableCell>
      <TableCell>{row.alt_name}</TableCell>
      <TableCell>
        <select
          className="w-full rounded-md border border-input bg-background px-2 py-1 text-sm"
          value={pick}
          onChange={(e) => setPick(e.target.value)}
        >
          <option value="">— nicht zuordnen —</option>
          {staff.map((s) => (
            <option key={s.id} value={s.id}>
              {s.displayName}
            </option>
          ))}
        </select>
      </TableCell>
      <TableCell>
        {row.confirmed_at ? (
          <Badge variant="secondary">bestätigt</Badge>
        ) : (
          <Badge variant="outline">offen</Badge>
        )}
      </TableCell>
      <TableCell className="text-right">
        <Button
          size="sm"
          variant="outline"
          disabled={pending}
          onClick={() => onConfirm(pick === "" ? null : pick)}
        >
          Bestätigen
        </Button>
      </TableCell>
    </TableRow>
  );
}

function ReconciliationTable({
  title,
  rows,
  staffNameById,
}: {
  title: string;
  rows: Array<{
    staffId: string;
    bucketKey: string;
    alt: Record<string, number>;
    recomputed: Record<string, number>;
    diff: Record<string, number>;
    hasDifference: boolean;
  }>;
  staffNameById: Map<string, string>;
}) {
  return <ReconciliationTableImpl title={title} rows={rows} staffNameById={staffNameById} />;
}

function ReassignReport({
  result,
  mode,
}: {
  result: {
    totalScanned: number;
    totalMismatched: number;
    totalUpdated: number;
    groups: Array<{
      altId: string;
      altName: string;
      fromStaffName: string;
      toStaffName: string;
      shiftCount: number;
      minBusinessDate: string | null;
      maxBusinessDate: string | null;
    }>;
  } | null;
  mode: "dry_run" | "commit";
}) {
  if (!result) return null;
  return (
    <div className="space-y-2">
      <div className="rounded-md border border-border bg-muted/30 p-3 text-sm">
        <div className="font-medium">
          {mode === "commit" ? "Commit-Bericht" : "Dry-Run-Bericht"}
        </div>
        <div className="flex flex-wrap gap-4">
          <span>
            gescannt: <strong>{result.totalScanned}</strong>
          </span>
          <span>
            betroffen: <strong>{result.totalMismatched}</strong>
          </span>
          {mode === "commit" && (
            <span>
              umgehängt: <strong>{result.totalUpdated}</strong>
            </span>
          )}
        </div>
      </div>
      {result.groups.length > 0 && (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Alt-ID</TableHead>
              <TableHead>Alt-Name</TableHead>
              <TableHead>von</TableHead>
              <TableHead>nach</TableHead>
              <TableHead className="text-right">Schichten</TableHead>
              <TableHead>Zeitraum</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {result.groups.map((g) => (
              <TableRow key={`${g.altId}-${g.fromStaffName}-${g.toStaffName}`}>
                <TableCell className="font-mono text-xs">{g.altId}</TableCell>
                <TableCell>{g.altName}</TableCell>
                <TableCell>{g.fromStaffName}</TableCell>
                <TableCell>{g.toStaffName}</TableCell>
                <TableCell className="text-right">{g.shiftCount}</TableCell>
                <TableCell className="font-mono text-xs">
                  {g.minBusinessDate ?? "—"} … {g.maxBusinessDate ?? "—"}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}

function ReconciliationTableImpl({
  title,
  rows,
  staffNameById,
}: {
  title: string;
  rows: Array<{
    staffId: string;
    bucketKey: string;
    alt: Record<string, number>;
    recomputed: Record<string, number>;
    diff: Record<string, number>;
    hasDifference: boolean;
  }>;
  staffNameById: Map<string, string>;
}) {
  const potKeys = Array.from(new Set(rows.flatMap((r) => Object.keys(r.diff)))).sort();
  return (
    <div className="overflow-x-auto">
      <div className="mb-1 text-sm font-medium">{title}</div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Bucket</TableHead>
            <TableHead>Staff</TableHead>
            {potKeys.map((k) => (
              <TableHead key={k} className="text-right">
                Δ {k}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r, i) => (
            <TableRow key={`${r.staffId}-${r.bucketKey}-${i}`}>
              <TableCell className="font-mono text-xs">{r.bucketKey}</TableCell>
              <TableCell>
                <div className="text-sm">{staffNameById.get(r.staffId) ?? "—"}</div>
                <div className="font-mono text-[10px] text-muted-foreground" title={r.staffId}>
                  {r.staffId}
                </div>
              </TableCell>
              {potKeys.map((k) => {
                const d = r.diff[k] ?? 0;
                return (
                  <TableCell
                    key={k}
                    className={
                      Math.abs(d) > 0.001
                        ? "text-right font-semibold text-destructive"
                        : "text-right text-muted-foreground"
                    }
                  >
                    {d.toFixed(2)}
                  </TableCell>
                );
              })}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function DeleteImportedReport({
  result,
  mode,
}: {
  result: {
    totalMatched: number;
    totalDeleted: number;
    minBusinessDate: string | null;
    maxBusinessDate: string | null;
    staffGroups: Array<{ staffId: string; staffName: string; shiftCount: number }>;
    filter: { staffId: string | null };
  } | null;
  mode: "dry_run" | "commit";
}) {
  if (!result) return null;
  return (
    <div className="space-y-2">
      <div className="rounded-md border border-border bg-muted/30 p-3 text-sm">
        <div className="font-medium">
          {mode === "commit" ? "Lösch-Bericht" : "Dry-Run-Bericht"}
        </div>
        <div className="flex flex-wrap gap-4">
          <span>
            betroffen: <strong>{result.totalMatched}</strong>
          </span>
          {mode === "commit" && (
            <span>
              gelöscht: <strong>{result.totalDeleted}</strong>
            </span>
          )}
          <span>
            Zeitraum:{" "}
            <code>
              {result.minBusinessDate ?? "—"} … {result.maxBusinessDate ?? "—"}
            </code>
          </span>
          {result.filter.staffId && (
            <span className="text-muted-foreground">
              Filter staff_id: <code className="text-xs">{result.filter.staffId}</code>
            </span>
          )}
        </div>
      </div>
      {result.staffGroups.length > 0 && (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Mitarbeiter</TableHead>
              <TableHead className="text-right">Schichten</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {result.staffGroups.map((g) => (
              <TableRow key={g.staffId}>
                <TableCell>{g.staffName}</TableCell>
                <TableCell className="text-right">{g.shiftCount}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
