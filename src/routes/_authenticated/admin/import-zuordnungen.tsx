// Admin-only Auslöse-Weg für den einmaligen Import der
// Mitarbeiter-Zuordnungen via `importStaffAssignments`.
// Ablauf: zwei CSV-Uploads → Dry-Run (Pflicht) → Commit.

import { createFileRoute, redirect } from "@tanstack/react-router";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { importStaffAssignments } from "@/lib/admin/import-assignments.functions";
import { parseImportCsvs, type ParseResult } from "@/lib/admin/import-zuordnungen-csv";
import { importStaffPersonalData } from "@/lib/admin/import-personal.functions";
import { parsePersonalCsv, type PersonalParseResult } from "@/lib/admin/import-personal-csv";

export const Route = createFileRoute("/_authenticated/admin/import-zuordnungen")({
  head: () => ({ meta: [{ title: "Zuordnungen importieren" }] }),
  beforeLoad: ({ context }) => {
    const identity = (context as { identity?: { role: string } }).identity;
    if (!identity || identity.role !== "admin") throw redirect({ to: "/admin" });
  },
  component: ImportZuordnungenPage,
});

function ImportZuordnungenPage() {
  const callImport = useServerFn(importStaffAssignments);
  const [assignmentsCsv, setAssignmentsCsv] = useState("");
  const [skillsCsv, setSkillsCsv] = useState("");
  const [assignmentsName, setAssignmentsName] = useState("");
  const [skillsName, setSkillsName] = useState("");

  const parsed = useMemo<ParseResult | { error: string } | null>(() => {
    if (!assignmentsCsv || !skillsCsv) return null;
    try {
      return parseImportCsvs({ assignmentsCsv, skillsCsv });
    } catch (e) {
      return { error: (e as Error).message };
    }
  }, [assignmentsCsv, skillsCsv]);

  const dryMut = useMutation({
    mutationFn: () => {
      if (!parsed || "error" in parsed) throw new Error("CSVs unvollständig.");
      return callImport({
        data: {
          assignments: parsed.assignments,
          skills: parsed.skills,
          mode: "dry_run",
          sourceSystem: "tagesabrechnung",
          skillsMode: "replace",
        },
      });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const commitMut = useMutation({
    mutationFn: () => {
      if (!parsed || "error" in parsed) throw new Error("CSVs unvollständig.");
      return callImport({
        data: {
          assignments: parsed.assignments,
          skills: parsed.skills,
          mode: "commit",
          sourceSystem: "tagesabrechnung",
          skillsMode: "replace",
        },
      });
    },
    onSuccess: (r) => {
      toast.success(
        `Import abgeschlossen: +${r.plan.totals.locationsAdded} / −${r.plan.totals.locationsRemoved} Zuordnungen, +${r.plan.totals.skillsAdded} / −${r.plan.totals.skillsRemoved} Skills.`,
      );
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function onAssignmentsFile(ev: React.ChangeEvent<HTMLInputElement>) {
    const f = ev.target.files?.[0];
    if (!f) return;
    setAssignmentsName(f.name);
    f.text().then(setAssignmentsCsv);
    dryMut.reset();
    commitMut.reset();
  }
  function onSkillsFile(ev: React.ChangeEvent<HTMLInputElement>) {
    const f = ev.target.files?.[0];
    if (!f) return;
    setSkillsName(f.name);
    f.text().then(setSkillsCsv);
    dryMut.reset();
    commitMut.reset();
  }

  const parseError = parsed && "error" in parsed ? parsed.error : null;
  const parseOk = parsed && !("error" in parsed) ? parsed : null;
  const dry = dryMut.data;
  const committed = commitMut.data;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          Zuordnungen importieren
        </h1>
        <p className="text-sm text-muted-foreground">
          Einmaliger Import der Mitarbeiter-Zuordnungen (Standort + Abteilung) und Skills aus der
          Tagesabrechnung. Idempotent — Re-Import ändert bei gleichen Eingaben nichts.
        </p>
      </div>

      <Card className="p-4 space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <Label htmlFor="assign">Zuordnungs-CSV</Label>
            <Input id="assign" type="file" accept=".csv,text/csv" onChange={onAssignmentsFile} />
            {assignmentsName && (
              <div className="text-xs text-muted-foreground">{assignmentsName}</div>
            )}
          </div>
          <div className="space-y-1">
            <Label htmlFor="skills">Skill-CSV</Label>
            <Input id="skills" type="file" accept=".csv,text/csv" onChange={onSkillsFile} />
            {skillsName && <div className="text-xs text-muted-foreground">{skillsName}</div>}
          </div>
        </div>

        {parseError && (
          <div className="rounded-md border border-destructive bg-destructive/10 p-3 text-sm text-destructive">
            {parseError}
          </div>
        )}

        {parseOk && (
          <div className="space-y-2 text-sm">
            <div className="flex flex-wrap gap-2">
              <Badge variant="secondary">{parseOk.staffCount} Mitarbeiter</Badge>
              <Badge variant="secondary">{parseOk.assignments.length} Zuordnungen</Badge>
              <Badge variant="secondary">{parseOk.skills.length} Skills</Badge>
              {parseOk.warnings.length > 0 ? (
                <Badge variant="destructive">{parseOk.warnings.length} Warnungen</Badge>
              ) : (
                <Badge variant="secondary">0 Warnungen</Badge>
              )}
            </div>
            {parseOk.warnings.length > 0 && (
              <details className="rounded-md border border-border bg-muted/30 p-2">
                <summary className="cursor-pointer text-sm font-medium">Warnungen ansehen</summary>
                <ul className="mt-2 list-disc space-y-1 pl-5 text-xs">
                  {parseOk.warnings.map((w, i) => (
                    <li key={i}>
                      <code>{w.kind}</code> · {JSON.stringify(w)}
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </div>
        )}

        <div className="flex gap-2">
          <Button disabled={!parseOk || dryMut.isPending} onClick={() => dryMut.mutate()}>
            {dryMut.isPending ? "Dry-Run…" : "Dry-Run ausführen"}
          </Button>
          <Button
            variant="destructive"
            disabled={!dry || commitMut.isPending}
            onClick={() => {
              if (!dry) return;
              const t = dry.plan.totals;
              const msg = `Commit ausführen?\n\n+${t.locationsAdded} / −${t.locationsRemoved} Zuordnungen, +${t.skillsAdded} / −${t.skillsRemoved} Skills.`;
              if (!window.confirm(msg)) return;
              commitMut.mutate();
            }}
            title={!dry ? "Erst Dry-Run ausführen." : undefined}
          >
            {commitMut.isPending ? "Commit läuft…" : "Jetzt importieren"}
          </Button>
        </div>
      </Card>

      {dry && <PlanReport title="Dry-Run-Bericht" result={dry} />}
      {committed && <PlanReport title="Commit-Bericht" result={committed} />}

      <PersonalSection />
    </div>
  );
}

type ImportResult = Awaited<ReturnType<typeof importStaffAssignments>>;

function PlanReport({ title, result }: { title: string; result: ImportResult }) {
  const t = result.plan.totals;
  return (
    <Card className="p-4 space-y-3">
      <div className="font-medium">{title}</div>
      <div className="flex flex-wrap gap-2 text-xs">
        <Badge variant="secondary">{t.staff} MA betroffen</Badge>
        <Badge variant="secondary">{t.assignments} Zuordnungs-Zeilen</Badge>
        <Badge variant="secondary">{t.skills} Skill-Zeilen</Badge>
        <Badge variant="secondary">
          Standorte +{t.locationsAdded} / −{t.locationsRemoved}
        </Badge>
        <Badge variant="secondary">
          Skills +{t.skillsAdded} / −{t.skillsRemoved}
        </Badge>
        {t.skippedCount > 0 ? (
          <Badge variant="destructive">{t.skippedCount} skippedRows</Badge>
        ) : (
          <Badge variant="secondary">0 skippedRows</Badge>
        )}
      </div>

      {result.plan.skippedRows.length > 0 && (
        <details className="rounded-md border border-border bg-muted/30 p-2">
          <summary className="cursor-pointer text-sm font-medium">
            Übersprungene Zeilen ({result.plan.skippedRows.length})
          </summary>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-xs">
            {result.plan.skippedRows.map((s, i) => (
              <li key={i}>
                <code>{s.reason}</code> · {JSON.stringify(s)}
              </li>
            ))}
          </ul>
        </details>
      )}

      <details className="rounded-md border border-border bg-muted/30 p-2">
        <summary className="cursor-pointer text-sm font-medium">
          Pro Mitarbeiter ({result.plan.perStaff.length})
        </summary>
        <div className="mt-2 space-y-2 text-xs">
          {result.plan.perStaff.map((s) => (
            <div key={s.staffId} className="rounded border border-border bg-card p-2">
              <div className="font-mono">{s.staffId}</div>
              <div>
                Standorte: +{s.locations.added.length} / −{s.locations.removed.length} / ={" "}
                {s.locations.kept.length}
              </div>
              <div>
                Skills: +{s.skills.added.length} / −{s.skills.removed.length} ={" "}
                {s.skills.kept.length}
              </div>
            </div>
          ))}
        </div>
      </details>
    </Card>
  );
}

function PersonalSection() {
  const callImport = useServerFn(importStaffPersonalData);
  const [csv, setCsv] = useState("");
  const [name, setName] = useState("");

  const parsed = useMemo<PersonalParseResult | { error: string } | null>(() => {
    if (!csv) return null;
    try {
      return parsePersonalCsv(csv);
    } catch (e) {
      return { error: (e as Error).message };
    }
  }, [csv]);

  const dryMut = useMutation({
    mutationFn: () => {
      if (!parsed || "error" in parsed) throw new Error("CSV unvollständig.");
      return callImport({
        data: { rows: parsed.rows, mode: "dry_run", sourceSystem: "tagesabrechnung" },
      });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const commitMut = useMutation({
    mutationFn: () => {
      if (!parsed || "error" in parsed) throw new Error("CSV unvollständig.");
      return callImport({
        data: { rows: parsed.rows, mode: "commit", sourceSystem: "tagesabrechnung" },
      });
    },
    onSuccess: (r) => {
      const t = r.plan.totals;
      toast.success(
        `Personaldaten: ${t.nameUpdates} Namen-Updates · ${t.compInserts}+${t.compUpdates} Lohn-UPSERTs.`,
      );
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function onFile(ev: React.ChangeEvent<HTMLInputElement>) {
    const f = ev.target.files?.[0];
    if (!f) return;
    setName(f.name);
    f.text().then(setCsv);
    dryMut.reset();
    commitMut.reset();
  }

  const parseError = parsed && "error" in parsed ? parsed.error : null;
  const parseOk = parsed && !("error" in parsed) ? parsed : null;
  const dry = dryMut.data;
  const committed = commitMut.data;

  return (
    <div className="space-y-3">
      <div>
        <h2 className="text-xl font-semibold tracking-tight text-foreground">
          Personaldaten (Welle 1)
        </h2>
        <p className="text-sm text-muted-foreground">
          Übernahme von echten Vor-/Nachnamen, Personalnummern und Stundenlöhnen aus der
          Tagesabrechnung. Leeres Eintrittsdatum → Fallback auf heute (im Bericht markiert).
        </p>
      </div>

      <Card className="p-4 space-y-3">
        <div className="space-y-1">
          <Label htmlFor="personal">Personal-CSV</Label>
          <Input id="personal" type="file" accept=".csv,text/csv" onChange={onFile} />
          {name && <div className="text-xs text-muted-foreground">{name}</div>}
        </div>

        {parseError && (
          <div className="rounded-md border border-destructive bg-destructive/10 p-3 text-sm text-destructive">
            {parseError}
          </div>
        )}

        {parseOk && (
          <div className="space-y-2 text-sm">
            <div className="flex flex-wrap gap-2">
              <Badge variant="secondary">{parseOk.rows.length} Zeilen</Badge>
              {parseOk.warnings.length > 0 ? (
                <Badge variant="destructive">{parseOk.warnings.length} Warnungen</Badge>
              ) : (
                <Badge variant="secondary">0 Warnungen</Badge>
              )}
            </div>
            {parseOk.warnings.length > 0 && (
              <details className="rounded-md border border-border bg-muted/30 p-2">
                <summary className="cursor-pointer text-sm font-medium">Warnungen ansehen</summary>
                <ul className="mt-2 list-disc space-y-1 pl-5 text-xs">
                  {parseOk.warnings.map((w, i) => (
                    <li key={i}>
                      <code>{w.kind}</code> · {JSON.stringify(w)}
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </div>
        )}

        <div className="flex gap-2">
          <Button disabled={!parseOk || dryMut.isPending} onClick={() => dryMut.mutate()}>
            {dryMut.isPending ? "Dry-Run…" : "Dry-Run ausführen"}
          </Button>
          <Button
            variant="destructive"
            disabled={!dry || commitMut.isPending}
            onClick={() => {
              if (!dry) return;
              const t = dry.plan.totals;
              const msg = `Commit ausführen?\n\n${t.staff} MA · ${t.nameUpdates} Namen-Updates · ${t.compInserts}+${t.compUpdates} Lohn-UPSERTs · ${t.compFallbacks} Fallback-Datum · ${t.skippedCount} skipped.`;
              if (!window.confirm(msg)) return;
              commitMut.mutate();
            }}
            title={!dry ? "Erst Dry-Run ausführen." : undefined}
          >
            {commitMut.isPending ? "Commit läuft…" : "Jetzt importieren"}
          </Button>
        </div>
      </Card>

      {dry && <PersonalReport title="Dry-Run-Bericht" result={dry} />}
      {committed && <PersonalReport title="Commit-Bericht" result={committed} />}
    </div>
  );
}

type PersonalImportResult = Awaited<ReturnType<typeof importStaffPersonalData>>;

function PersonalReport({ title, result }: { title: string; result: PersonalImportResult }) {
  const t = result.plan.totals;
  return (
    <Card className="p-4 space-y-3">
      <div className="font-medium">{title}</div>
      <div className="flex flex-wrap gap-2 text-xs">
        <Badge variant="secondary">{t.rows} Zeilen</Badge>
        <Badge variant="secondary">{t.staff} MA betroffen</Badge>
        <Badge variant="secondary">{t.nameUpdates} Namen-Updates</Badge>
        <Badge variant="secondary">
          Lohn +{t.compInserts} / ~{t.compUpdates}
        </Badge>
        {t.compFallbacks > 0 ? (
          <Badge variant="destructive">{t.compFallbacks} Fallback-Datum</Badge>
        ) : (
          <Badge variant="secondary">0 Fallback</Badge>
        )}
        {t.skippedCount > 0 ? (
          <Badge variant="destructive">{t.skippedCount} skipped</Badge>
        ) : (
          <Badge variant="secondary">0 skipped</Badge>
        )}
      </div>

      {result.plan.skippedRows.length > 0 && (
        <details className="rounded-md border border-border bg-muted/30 p-2">
          <summary className="cursor-pointer text-sm font-medium">
            Übersprungene Zeilen ({result.plan.skippedRows.length})
          </summary>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-xs">
            {result.plan.skippedRows.map((s, i) => (
              <li key={i}>
                <code>{s.reason}</code> · {JSON.stringify(s)}
              </li>
            ))}
          </ul>
        </details>
      )}

      <details className="rounded-md border border-border bg-muted/30 p-2">
        <summary className="cursor-pointer text-sm font-medium">
          Pro Mitarbeiter ({result.plan.perStaff.length})
        </summary>
        <div className="mt-2 space-y-2 text-xs">
          {result.plan.perStaff.map((s) => (
            <div key={s.staffId} className="rounded border border-border bg-card p-2">
              <div className="font-mono">{s.staffId}</div>
              <div>
                Name-Diff: {Object.keys(s.nameDiff).length === 0 ? "—" : JSON.stringify(s.nameDiff)}
              </div>
              <div>
                Lohn: {s.compOp}
                {s.compFallback ? " · Fallback-Datum" : ""} ·{" "}
                {Object.keys(s.compDiff).length === 0 ? "—" : JSON.stringify(s.compDiff)}
              </div>
            </div>
          ))}
        </div>
      </details>
    </Card>
  );
}
