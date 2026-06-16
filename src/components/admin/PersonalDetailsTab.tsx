import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  getStaffPersonalDetails,
  upsertStaffPersonalDetails,
  type PersonalDetailsDto,
} from "@/lib/admin/personal-details.functions";
import {
  personalDetailsSchema,
  type PersonalDetailsFields,
} from "@/lib/admin/personal-details.schema";

type Props = { staffId: string; canEdit: boolean };

type FormState = Record<keyof PersonalDetailsFields, string | boolean | null>;

const SENSITIVE: ReadonlyArray<keyof PersonalDetailsFields> = [
  "iban",
  "tax_id",
  "social_security_number",
];

function toFormState(d: PersonalDetailsDto): FormState {
  const f: Partial<FormState> = {};
  (Object.keys(d) as Array<keyof PersonalDetailsDto>).forEach((k) => {
    if (k === "exists") return;
    const v = d[k];
    if (typeof v === "boolean" || v === null) {
      (f as Record<string, unknown>)[k] = v;
    } else {
      (f as Record<string, unknown>)[k] = String(v);
    }
  });
  return f as FormState;
}

function toPatch(state: FormState): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, raw] of Object.entries(state)) {
    if (raw === null || raw === "") {
      out[key] = null;
      continue;
    }
    if (typeof raw === "boolean") {
      out[key] = raw;
      continue;
    }
    // Numerische Felder zurück in number wandeln.
    if (
      key === "child_tax_allowances" ||
      key === "vacation_days_contractual" ||
      key === "vacation_days_previous_year" ||
      key === "vacation_days_current_year" ||
      key === "vacation_days_taken"
    ) {
      const n = Number(raw);
      out[key] = Number.isFinite(n) ? n : null;
      continue;
    }
    out[key] = raw;
  }
  return out;
}

function mask(val: string | null, key: keyof PersonalDetailsFields): string {
  if (!val) return "—";
  if (key === "iban") {
    const last = val.slice(-4);
    return `•••• •••• •••• ${last}`;
  }
  return "••••••••";
}

function fmt(val: string | boolean | null): string {
  if (val === null || val === "") return "—";
  if (typeof val === "boolean") return val ? "ja" : "nein";
  return val;
}

export function PersonalDetailsTab({ staffId, canEdit }: Props) {
  const queryClient = useQueryClient();
  const fetchFn = useServerFn(getStaffPersonalDetails);
  const saveFn = useServerFn(upsertStaffPersonalDetails);

  const detailsQ = useQuery({
    queryKey: ["admin", "staff", staffId, "personal-details"],
    queryFn: () => fetchFn({ data: { staffId } }),
  });

  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<FormState | null>(null);
  const [revealed, setRevealed] = useState<Set<string>>(new Set());
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    if (detailsQ.data && form === null) {
      setForm(toFormState(detailsQ.data));
    }
  }, [detailsQ.data, form]);

  const mutation = useMutation({
    mutationFn: () => {
      if (!form) throw new Error("Formular nicht geladen");
      const patch = toPatch(form);
      // Client-Validierung (gleiches Schema wie Server)
      personalDetailsSchema.parse(patch);
      return saveFn({ data: { staffId, fields: patch } });
    },
    onSuccess: async () => {
      setMsg("Gespeichert.");
      setEditing(false);
      await queryClient.invalidateQueries({
        queryKey: ["admin", "staff", staffId, "personal-details"],
      });
    },
    onError: (e: unknown) => setMsg(e instanceof Error ? e.message : "Fehler beim Speichern."),
  });

  const sections = useMemo(
    () =>
      [
        {
          title: "Person & Kontakt",
          rows: [
            { key: "salutation", label: "Anrede", type: "text" },
            { key: "date_of_birth", label: "Geburtsdatum", type: "date" },
            { key: "place_of_birth", label: "Geburtsort", type: "text" },
            { key: "nationality", label: "Nationalität", type: "text" },
            { key: "phone", label: "Telefon", type: "text" },
            { key: "email", label: "E-Mail", type: "email" },
            { key: "address", label: "Adresse", type: "textarea" },
          ],
        },
        {
          title: "Steuer & Sozialversicherung",
          rows: [
            { key: "tax_class", label: "Steuerklasse", type: "text" },
            { key: "tax_id", label: "Steuer-ID", type: "text", sensitive: true },
            {
              key: "social_security_number",
              label: "SV-Nummer",
              type: "text",
              sensitive: true,
            },
            { key: "child_tax_allowances", label: "Kinderfreibeträge", type: "number" },
            { key: "is_minijob", label: "Minijob", type: "bool" },
            { key: "is_sv_exempt", label: "SV-frei", type: "bool" },
            { key: "church_tax_liable", label: "Kirchensteuerpflichtig", type: "bool" },
            { key: "health_insurance", label: "Krankenkasse", type: "text" },
          ],
        },
        {
          title: "Bankverbindung",
          rows: [
            { key: "iban", label: "IBAN", type: "text", sensitive: true },
            { key: "bank_name", label: "Bank", type: "text" },
            { key: "account_holder", label: "Kontoinhaber", type: "text" },
          ],
        },
        {
          title: "Beschäftigung & Urlaub",
          rows: [
            { key: "employment_start_date", label: "Eintritt", type: "date" },
            { key: "employment_end_date", label: "Austritt", type: "date" },
            { key: "personnel_group", label: "Personalgruppe", type: "text" },
            { key: "job_title", label: "Berufsbezeichnung", type: "text" },
            {
              key: "vacation_days_contractual",
              label: "Urlaub vertraglich",
              type: "number",
            },
            {
              key: "vacation_days_previous_year",
              label: "Urlaub Vorjahr",
              type: "number",
            },
            {
              key: "vacation_days_current_year",
              label: "Urlaub lfd. Jahr",
              type: "number",
            },
            { key: "vacation_days_taken", label: "Urlaub genommen", type: "number" },
          ],
        },
      ] as const,
    [],
  );

  if (detailsQ.isLoading) return <p className="text-sm text-muted-foreground">Lade…</p>;
  if (detailsQ.error || !detailsQ.data)
    return <p className="text-sm text-destructive">Personaldaten konnten nicht geladen werden.</p>;

  const data = detailsQ.data;

  return (
    <div className="max-w-2xl space-y-6">
      {!data.exists && !editing && (
        <p className="text-sm text-muted-foreground">Noch keine Personaldaten hinterlegt.</p>
      )}

      {canEdit && !editing && (
        <button
          type="button"
          onClick={() => {
            setMsg(null);
            setEditing(true);
          }}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          {data.exists ? "Bearbeiten" : "Anlegen"}
        </button>
      )}

      {sections.map((sec) => (
        <fieldset key={sec.title} className="space-y-3 rounded-md border border-border p-4">
          <legend className="px-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {sec.title}
          </legend>
          <div className="space-y-2">
            {sec.rows.map((row) => {
              const k = row.key as keyof PersonalDetailsFields;
              const isSensitive = SENSITIVE.includes(k);
              const rawVal = form?.[k] ?? null;
              if (editing && form) {
                return (
                  <FieldEditor
                    key={row.key}
                    label={row.label}
                    type={row.type}
                    value={rawVal}
                    onChange={(v) => setForm({ ...form, [k]: v })}
                  />
                );
              }
              const display =
                isSensitive && !revealed.has(row.key)
                  ? mask(typeof rawVal === "string" ? rawVal : null, k)
                  : fmt(rawVal);
              return (
                <div key={row.key} className="flex items-baseline justify-between gap-3 text-sm">
                  <span className="text-muted-foreground">{row.label}</span>
                  <span className="flex items-center gap-2 text-right text-foreground">
                    <span>{display}</span>
                    {isSensitive && rawVal && (
                      <button
                        type="button"
                        onClick={() => {
                          const next = new Set(revealed);
                          if (next.has(row.key)) next.delete(row.key);
                          else next.add(row.key);
                          setRevealed(next);
                        }}
                        className="text-xs text-muted-foreground hover:text-foreground"
                      >
                        {revealed.has(row.key) ? "Verbergen" : "Einblenden"}
                      </button>
                    )}
                  </span>
                </div>
              );
            })}
          </div>
        </fieldset>
      ))}

      {msg && <p className="text-sm text-muted-foreground">{msg}</p>}

      {editing && form && (
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => {
              setMsg(null);
              mutation.mutate();
            }}
            disabled={mutation.isPending}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {mutation.isPending ? "Speichern…" : "Speichern"}
          </button>
          <button
            type="button"
            onClick={() => {
              setEditing(false);
              setMsg(null);
              setForm(toFormState(data));
            }}
            className="rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground hover:bg-accent"
          >
            Abbrechen
          </button>
        </div>
      )}
    </div>
  );
}

function FieldEditor({
  label,
  type,
  value,
  onChange,
}: {
  label: string;
  type: string;
  value: string | boolean | null;
  onChange: (v: string | boolean | null) => void;
}) {
  if (type === "bool") {
    return (
      <label className="flex items-center justify-between gap-3 text-sm">
        <span className="text-muted-foreground">{label}</span>
        <select
          value={value === null ? "" : value ? "true" : "false"}
          onChange={(e) => onChange(e.target.value === "" ? null : e.target.value === "true")}
          className="rounded-md border border-input bg-background px-2 py-1 text-sm"
        >
          <option value="">—</option>
          <option value="true">ja</option>
          <option value="false">nein</option>
        </select>
      </label>
    );
  }
  if (type === "textarea") {
    return (
      <label className="block space-y-1 text-sm">
        <span className="text-muted-foreground">{label}</span>
        <textarea
          value={typeof value === "string" ? value : ""}
          onChange={(e) => onChange(e.target.value)}
          rows={3}
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
        />
      </label>
    );
  }
  return (
    <label className="flex items-center justify-between gap-3 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <input
        type={type}
        value={typeof value === "string" ? value : ""}
        onChange={(e) => onChange(e.target.value)}
        className="w-56 rounded-md border border-input bg-background px-2 py-1 text-sm"
      />
    </label>
  );
}
