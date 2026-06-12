import { useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { createStaff } from "@/lib/admin/staff.functions";

export const Route = createFileRoute("/_authenticated/admin/staff/new")({
  head: () => ({ meta: [{ title: "Neuer Mitarbeiter · Verwaltung" }] }),
  component: NewStaffPage,
});

function NewStaffPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const callCreate = useServerFn(createStaff);
  const [form, setForm] = useState({
    firstName: "",
    lastName: "",
    displayName: "",
    email: "",
    phone: "",
  });
  const [err, setErr] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: () =>
      callCreate({
        data: {
          firstName: form.firstName,
          lastName: form.lastName,
          displayName: form.displayName || `${form.firstName} ${form.lastName}`.trim(),
          email: form.email || null,
          phone: form.phone || null,
        },
      }),
    onSuccess: async ({ id }) => {
      await queryClient.invalidateQueries({ queryKey: ["admin", "staff"] });
      await navigate({ to: "/admin/staff/$staffId", params: { staffId: id } });
    },
    onError: (e: unknown) => {
      setErr(e instanceof Error ? e.message : "Fehler beim Anlegen.");
    },
  });

  return (
    <div className="max-w-lg space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight text-foreground">Neuer Mitarbeiter</h1>
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          setErr(null);
          mutation.mutate();
        }}
      >
        <Field label="Vorname" value={form.firstName} onChange={(v) => setForm({ ...form, firstName: v })} required />
        <Field label="Nachname" value={form.lastName} onChange={(v) => setForm({ ...form, lastName: v })} required />
        <Field
          label="Anzeigename (optional)"
          value={form.displayName}
          onChange={(v) => setForm({ ...form, displayName: v })}
        />
        <Field label="E-Mail" value={form.email} onChange={(v) => setForm({ ...form, email: v })} type="email" />
        <Field label="Telefon" value={form.phone} onChange={(v) => setForm({ ...form, phone: v })} />
        {err && <p className="text-sm text-destructive">{err}</p>}
        <button
          type="submit"
          disabled={mutation.isPending}
          className="w-full rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          {mutation.isPending ? "Anlegen…" : "Anlegen"}
        </button>
      </form>
    </div>
  );
}

function Field(props: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  required?: boolean;
  type?: string;
}) {
  return (
    <label className="block space-y-1">
      <span className="text-xs font-medium text-muted-foreground">{props.label}</span>
      <input
        type={props.type ?? "text"}
        required={props.required}
        value={props.value}
        onChange={(e) => props.onChange(e.target.value)}
        className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
      />
    </label>
  );
}