// Mitarbeiter-Selbstservice „Meine Daten" (SP2).
// Reine UI — nutzt ausschließlich SP1-Server-Functions aus src/lib/profile.
// Keine Änderungen an Server-Layer, Feldkatalogen oder Validatoren.

import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  getMyProfile,
  updateMyContact,
  submitChangeRequest,
  listMyChangeRequests,
  listMyDocuments,
  uploadMyDocument,
  getMyDocumentUrl,
  type MyProfile,
  type MyChangeRequest,
  type MyDocument,
} from "@/lib/profile/profile.functions";
import {
  validateIban,
  validateSvNumber,
  validateTaxId,
  validateTaxClass,
  validateChildrenCount,
  validateChildTaxAllowances,
} from "@/lib/profile/profile-fields";
import { DOC_TYPES, type StaffDocumentType } from "@/lib/profile/staff-document-path";

export const Route = createFileRoute("/_authenticated/profil")({
  head: () => ({
    meta: [{ title: "Meine Daten · COCO" }, { name: "robots", content: "noindex" }],
  }),
  component: ProfilPage,
});

const DOC_TYPE_LABEL: Record<StaffDocumentType, string> = {
  passport: "Pass",
  visa: "Visum",
  work_permit: "Arbeitserlaubnis",
  health_certificate: "Gesundheitszeugnis",
  contract: "Vertrag",
  other: "Sonstiges",
};

const REQUEST_FIELD_LABEL: Record<string, string> = {
  first_name: "Vorname",
  last_name: "Nachname",
  salutation: "Anrede",
  date_of_birth: "Geburtsdatum",
  place_of_birth: "Geburtsort",
  nationality: "Nationalität",
  bank_name: "Bank",
  iban: "IBAN",
  account_holder: "Kontoinhaber",
  social_security_number: "SV-Nummer",
  tax_id: "Steuer-ID",
  tax_class: "Steuerklasse",
  church_tax_liable: "Kirchensteuerpflichtig",
  konfession: "Konfession",
  children_count: "Anzahl Kinder",
  child_tax_allowances: "Kinderfreibeträge",
  health_insurance: "Krankenkasse",
};

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso.length === 10 ? iso + "T00:00:00Z" : iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("de-DE", { year: "numeric", month: "2-digit", day: "2-digit" });
}

function todayIso(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const s = String(reader.result ?? "");
      const comma = s.indexOf(",");
      resolve(comma >= 0 ? s.slice(comma + 1) : s);
    };
    reader.onerror = () => reject(reader.error ?? new Error("Datei-Lesefehler."));
    reader.readAsDataURL(file);
  });
}

function ProfilPage() {
  const qc = useQueryClient();
  const profileQ = useQuery({ queryKey: ["profile", "me"], queryFn: () => getMyProfile() });
  const requestsQ = useQuery({
    queryKey: ["profile", "requests"],
    queryFn: () => listMyChangeRequests(),
  });
  const docsQ = useQuery({ queryKey: ["profile", "documents"], queryFn: () => listMyDocuments() });

  const hasPending = (requestsQ.data ?? []).some((r) => r.status === "pending");

  return (
    <div className="mx-auto max-w-2xl space-y-6 px-4 py-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Meine Daten</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Kontaktdaten kannst du direkt ändern. Lohnrelevante Daten laufen über einen Antrag, den
          ein Administrator freigibt.
        </p>
      </header>

      {profileQ.isLoading ? (
        <p className="text-sm text-muted-foreground">Lade…</p>
      ) : profileQ.isError || !profileQ.data ? (
        <p className="text-sm text-destructive">
          Fehler beim Laden:{" "}
          {profileQ.error instanceof Error ? profileQ.error.message : "Unbekannter Fehler."}
        </p>
      ) : (
        <>
          <PersonCard profile={profileQ.data} />
          <ContactCard
            profile={profileQ.data}
            onSaved={() => qc.invalidateQueries({ queryKey: ["profile", "me"] })}
          />
          <PayrollDataCard
            profile={profileQ.data}
            hasPending={hasPending}
            onSubmitted={() => {
              qc.invalidateQueries({ queryKey: ["profile", "requests"] });
            }}
          />
          <MyRequestsCard q={requestsQ} />
          <DocumentsCard
            q={docsQ}
            onChanged={() => qc.invalidateQueries({ queryKey: ["profile", "documents"] })}
          />
        </>
      )}
    </div>
  );
}

function PersonCard({ profile }: { profile: MyProfile }) {
  return (
    <Card className="space-y-3 p-4">
      <h2 className="text-base font-semibold text-foreground">Person</h2>
      <dl className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
        <Field label="Vorname" value={profile.staff.firstName} />
        <Field label="Nachname" value={profile.staff.lastName} />
        <Field label="Spitzname" value={profile.staff.displayName} />
      </dl>
      <p className="text-xs text-muted-foreground">Namensänderungen kannst du unten beantragen.</p>
    </Card>
  );
}

function Field({ label, value }: { label: string; value: string | number | boolean | null }) {
  const display =
    value === null || value === undefined || value === ""
      ? null
      : typeof value === "boolean"
        ? value
          ? "Ja"
          : "Nein"
        : String(value);
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="text-sm text-foreground">
        {display ?? <span className="text-muted-foreground italic">— noch nicht hinterlegt</span>}
      </dd>
    </div>
  );
}

function ContactCard({ profile, onSaved }: { profile: MyProfile; onSaved: () => void }) {
  const initialAddress = (profile.details.address as string | null) ?? "";
  const initialPhone = (profile.details.phone as string | null) ?? "";
  const initialEmail = (profile.details.email as string | null) ?? "";
  const [address, setAddress] = useState(initialAddress);
  const [phone, setPhone] = useState(initialPhone);
  const [email, setEmail] = useState(initialEmail);
  const [saving, setSaving] = useState(false);
  const call = useServerFn(updateMyContact);

  const dirty = address !== initialAddress || phone !== initialPhone || email !== initialEmail;

  async function save() {
    const payload: Record<string, string> = {};
    if (address !== initialAddress) payload.address = address;
    if (phone !== initialPhone) payload.phone = phone;
    if (email !== initialEmail) payload.email = email;
    if (Object.keys(payload).length === 0) return;
    setSaving(true);
    try {
      await call({ data: payload });
      toast.success("Kontaktdaten gespeichert");
      onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Speichern fehlgeschlagen.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="space-y-4 p-4">
      <div>
        <h2 className="text-base font-semibold text-foreground">Kontaktdaten</h2>
        <p className="text-xs text-muted-foreground">
          Änderungen werden sofort übernommen (mit Audit-Eintrag).
        </p>
      </div>
      <div className="space-y-3">
        <div>
          <Label htmlFor="addr">Adresse</Label>
          <Textarea
            id="addr"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            rows={3}
            placeholder="Straße Nr., PLZ Ort"
          />
        </div>
        <div>
          <Label htmlFor="phone">Telefon</Label>
          <Input
            id="phone"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            inputMode="tel"
            autoComplete="tel"
          />
        </div>
        <div>
          <Label htmlFor="email">E-Mail</Label>
          <Input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
          />
        </div>
      </div>
      <div className="flex justify-end">
        <Button type="button" onClick={save} disabled={!dirty || saving}>
          {saving ? "Speichere…" : "Speichern"}
        </Button>
      </div>
    </Card>
  );
}

type PayrollGroup = { title: string; fields: { key: string; label: string }[] };

const PAYROLL_GROUPS: PayrollGroup[] = [
  {
    title: "Persönlich",
    fields: [
      { key: "salutation", label: "Anrede" },
      { key: "date_of_birth", label: "Geburtsdatum" },
      { key: "place_of_birth", label: "Geburtsort" },
      { key: "nationality", label: "Nationalität" },
    ],
  },
  {
    title: "Steuer & Kirche",
    fields: [
      { key: "tax_id", label: "Steuer-ID" },
      { key: "tax_class", label: "Steuerklasse" },
      { key: "church_tax_liable", label: "Kirchensteuerpflichtig" },
      { key: "konfession", label: "Konfession" },
    ],
  },
  {
    title: "Sozialversicherung",
    fields: [
      { key: "social_security_number", label: "SV-Nummer" },
      { key: "health_insurance", label: "Krankenkasse" },
    ],
  },
  {
    title: "Kinder",
    fields: [
      { key: "children_count", label: "Anzahl Kinder" },
      { key: "child_tax_allowances", label: "Kinderfreibeträge" },
    ],
  },
  {
    title: "Bank",
    fields: [
      { key: "bank_name", label: "Bank" },
      { key: "iban", label: "IBAN" },
      { key: "account_holder", label: "Kontoinhaber" },
    ],
  },
];

function PayrollDataCard({
  profile,
  hasPending,
  onSubmitted,
}: {
  profile: MyProfile;
  hasPending: boolean;
  onSubmitted: () => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Card className="space-y-4 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-foreground">Lohnrelevante Daten</h2>
          <p className="text-xs text-muted-foreground">
            Änderungen werden von einem Administrator geprüft, bevor sie wirksam werden.
          </p>
        </div>
        <Button
          type="button"
          size="sm"
          onClick={() => setOpen(true)}
          disabled={hasPending}
          title={hasPending ? "Es liegt bereits ein offener Antrag vor." : undefined}
        >
          Änderung beantragen
        </Button>
      </div>
      {hasPending && (
        <p className="text-xs text-amber-600">
          Es liegt bereits ein offener Antrag vor. Neue Anträge sind erst möglich, wenn dieser
          entschieden ist.
        </p>
      )}
      <div className="space-y-4">
        {PAYROLL_GROUPS.map((g) => (
          <div key={g.title}>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {g.title}
            </h3>
            <dl className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {g.fields.map((f) => (
                <Field
                  key={f.key}
                  label={f.label}
                  value={
                    (profile.details as Record<string, string | number | boolean | null>)[f.key] ??
                    null
                  }
                />
              ))}
            </dl>
          </div>
        ))}
      </div>
      {open && (
        <RequestDialog
          profile={profile}
          onClose={() => setOpen(false)}
          onSubmitted={() => {
            setOpen(false);
            onSubmitted();
          }}
        />
      )}
    </Card>
  );
}

type FormState = Record<string, string>;

const ALL_REQUEST_FIELDS: { key: string; label: string; group: string }[] = [
  { key: "first_name", label: "Vorname", group: "Name" },
  { key: "last_name", label: "Nachname", group: "Name" },
  ...PAYROLL_GROUPS.flatMap((g) => g.fields.map((f) => ({ ...f, group: g.title }))),
];

function initialForm(profile: MyProfile): FormState {
  const f: FormState = {
    first_name: profile.staff.firstName ?? "",
    last_name: profile.staff.lastName ?? "",
  };
  for (const key of Object.keys(profile.details)) {
    const v = (profile.details as Record<string, unknown>)[key];
    f[key] = v === null || v === undefined ? "" : String(v);
  }
  return f;
}

function validateField(field: string, value: string): string | null {
  if (value === "") return null;
  switch (field) {
    case "iban":
      return validateIban(value);
    case "social_security_number":
      return validateSvNumber(value);
    case "tax_id":
      return validateTaxId(value);
    case "tax_class":
      return validateTaxClass(value);
    case "children_count":
      return validateChildrenCount(value);
    case "child_tax_allowances":
      return validateChildTaxAllowances(value);
    default:
      return null;
  }
}

function RequestDialog({
  profile,
  onClose,
  onSubmitted,
}: {
  profile: MyProfile;
  onClose: () => void;
  onSubmitted: () => void;
}) {
  const initial = useMemo(() => initialForm(profile), [profile]);
  const [form, setForm] = useState<FormState>(initial);
  const [church, setChurch] = useState<boolean>(
    profile.details.church_tax_liable === true || profile.details.church_tax_liable === "true",
  );
  const [note, setNote] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const call = useServerFn(submitChangeRequest);

  function setField(k: string, v: string) {
    setForm((s) => ({ ...s, [k]: v }));
    const err = validateField(k, v);
    setErrors((e) => ({ ...e, [k]: err ?? "" }));
  }

  function buildPayload(): Record<string, unknown> {
    const payload: Record<string, unknown> = {};
    for (const { key } of ALL_REQUEST_FIELDS) {
      if (key === "church_tax_liable") continue;
      const cur = form[key] ?? "";
      const orig = initial[key] ?? "";
      if (cur === orig) continue;
      if (cur === "") continue;
      if (key === "tax_class" || key === "children_count") {
        const n = Number(cur);
        if (!Number.isFinite(n)) continue;
        payload[key] = n;
      } else if (key === "child_tax_allowances") {
        const n = Number(cur.replace(",", "."));
        if (!Number.isFinite(n)) continue;
        payload[key] = n;
      } else {
        payload[key] = cur;
      }
    }
    const initialChurch =
      profile.details.church_tax_liable === true || profile.details.church_tax_liable === "true";
    if (church !== initialChurch) payload.church_tax_liable = church;
    return payload;
  }

  async function submit() {
    const payload = buildPayload();
    if (Object.keys(payload).length === 0) {
      toast.error("Bitte mindestens ein Feld ändern.");
      return;
    }
    // Vorvalidierung
    const localErrors: Record<string, string> = {};
    for (const [k, v] of Object.entries(payload)) {
      if (typeof v === "boolean") continue;
      const err = validateField(k, String(v));
      if (err) localErrors[k] = err;
    }
    if (Object.keys(localErrors).length > 0) {
      setErrors((e) => ({ ...e, ...localErrors }));
      toast.error("Bitte Eingaben prüfen.");
      return;
    }
    setSubmitting(true);
    try {
      await call({ data: { payload, note: note.trim() || undefined } });
      toast.success("Antrag abgeschickt");
      onSubmitted();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Antrag fehlgeschlagen.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Änderung beantragen</DialogTitle>
          <DialogDescription>
            Nur geänderte Felder werden an den Admin übermittelt.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-5">
          {["Name", ...PAYROLL_GROUPS.map((g) => g.title)].map((groupTitle) => (
            <div key={groupTitle}>
              <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {groupTitle}
              </h4>
              <div className="space-y-3">
                {ALL_REQUEST_FIELDS.filter((f) => f.group === groupTitle).map((f) => (
                  <FieldEditor
                    key={f.key}
                    fieldKey={f.key}
                    label={f.label}
                    value={form[f.key] ?? ""}
                    onChange={(v) => setField(f.key, v)}
                    error={errors[f.key]}
                    church={church}
                    onChurchChange={setChurch}
                  />
                ))}
              </div>
            </div>
          ))}
          <div>
            <Label htmlFor="req-note">Anmerkung (optional)</Label>
            <Textarea
              id="req-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              maxLength={2000}
            />
          </div>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose} disabled={submitting}>
            Abbrechen
          </Button>
          <Button type="button" onClick={submit} disabled={submitting}>
            {submitting ? "Sende…" : "Antrag absenden"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function FieldEditor({
  fieldKey,
  label,
  value,
  onChange,
  error,
  church,
  onChurchChange,
}: {
  fieldKey: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  error: string | undefined;
  church: boolean;
  onChurchChange: (v: boolean) => void;
}) {
  if (fieldKey === "church_tax_liable") {
    return (
      <div className="flex items-center gap-2">
        <Checkbox
          id="church"
          checked={church}
          onCheckedChange={(v) => onChurchChange(v === true)}
        />
        <Label htmlFor="church" className="cursor-pointer">
          {label}
        </Label>
      </div>
    );
  }
  if (fieldKey === "tax_class") {
    return (
      <div>
        <Label>{label}</Label>
        <Select value={value || undefined} onValueChange={(v) => onChange(v)}>
          <SelectTrigger>
            <SelectValue placeholder="—" />
          </SelectTrigger>
          <SelectContent>
            {[1, 2, 3, 4, 5, 6].map((n) => (
              <SelectItem key={n} value={String(n)}>
                {n}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {error && <p className="mt-1 text-xs text-destructive">{error}</p>}
      </div>
    );
  }
  const inputType =
    fieldKey === "date_of_birth"
      ? "date"
      : fieldKey === "children_count" || fieldKey === "child_tax_allowances"
        ? "text"
        : "text";
  return (
    <div>
      <Label htmlFor={`f-${fieldKey}`}>{label}</Label>
      <Input
        id={`f-${fieldKey}`}
        type={inputType}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        inputMode={
          fieldKey === "iban"
            ? "text"
            : fieldKey === "children_count" || fieldKey === "child_tax_allowances"
              ? "decimal"
              : undefined
        }
        autoComplete="off"
      />
      {error && <p className="mt-1 text-xs text-destructive">{error}</p>}
    </div>
  );
}

function MyRequestsCard({ q }: { q: ReturnType<typeof useQuery<MyChangeRequest[]>> }) {
  const items = q.data ?? [];
  return (
    <Card className="space-y-3 p-4">
      <h2 className="text-base font-semibold text-foreground">Meine Anträge</h2>
      {q.isLoading ? (
        <p className="text-sm text-muted-foreground">Lade…</p>
      ) : items.length === 0 ? (
        <p className="text-sm text-muted-foreground">Keine Anträge.</p>
      ) : (
        <ul className="divide-y divide-border">
          {items.map((r) => (
            <li key={r.id} className="space-y-1 py-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm text-foreground">{fmtDate(r.createdAt)}</p>
                <StatusBadge status={r.status} />
              </div>
              <p className="text-xs text-muted-foreground">
                {r.fields.map((f) => REQUEST_FIELD_LABEL[f] ?? f).join(", ") || "—"}
              </p>
              {r.reviewNote && (
                <p className="text-xs text-muted-foreground">Anmerkung Admin: {r.reviewNote}</p>
              )}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function StatusBadge({ status }: { status: MyChangeRequest["status"] }) {
  if (status === "approved") return <Badge className="bg-emerald-600 text-white">genehmigt</Badge>;
  if (status === "rejected") return <Badge variant="destructive">abgelehnt</Badge>;
  return <Badge variant="secondary">offen</Badge>;
}

function DocumentsCard({
  q,
  onChanged,
}: {
  q: ReturnType<typeof useQuery<MyDocument[]>>;
  onChanged: () => void;
}) {
  const items = q.data ?? [];
  const callOpen = useServerFn(getMyDocumentUrl);
  const callUpload = useServerFn(uploadMyDocument);

  const [docType, setDocType] = useState<StaffDocumentType | "">("");
  const [file, setFile] = useState<File | null>(null);
  const [validUntil, setValidUntil] = useState("");
  const [note, setNote] = useState("");
  const [uploading, setUploading] = useState(false);
  const today = todayIso();

  async function open(id: string) {
    const win = window.open("about:blank", "_blank", "noopener");
    try {
      const res = await callOpen({ data: { documentId: id } });
      if (win && !win.closed) win.location.href = res.url;
      else window.location.href = res.url;
    } catch (e) {
      if (win && !win.closed) win.close();
      toast.error(e instanceof Error ? e.message : "Öffnen fehlgeschlagen.");
    }
  }

  async function upload() {
    if (!docType) return toast.error("Bitte Dokument-Typ wählen.");
    if (!file) return toast.error("Bitte Datei auswählen.");
    if (file.size > 10 * 1024 * 1024) return toast.error("Datei ist zu groß (max. 10 MB).");
    if (!["image/jpeg", "image/png", "application/pdf"].includes(file.type)) {
      return toast.error("Nur JPG, PNG oder PDF erlaubt.");
    }
    setUploading(true);
    try {
      const contentBase64 = await fileToBase64(file);
      await callUpload({
        data: {
          docType,
          fileName: file.name,
          contentBase64,
          mimeType: file.type,
          validUntil: validUntil || undefined,
          note: note.trim() || undefined,
        },
      });
      toast.success("Dokument hochgeladen");
      setDocType("");
      setFile(null);
      setValidUntil("");
      setNote("");
      onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload fehlgeschlagen.");
    } finally {
      setUploading(false);
    }
  }

  const needsExpiry =
    docType === "visa" || docType === "work_permit" || docType === "health_certificate";

  return (
    <Card className="space-y-4 p-4">
      <div>
        <h2 className="text-base font-semibold text-foreground">Dokumente</h2>
        <p className="text-xs text-muted-foreground">
          Zum Ändern eines Dokuments einfach eine neue Version hochladen — Löschen ist Admin-Sache.
        </p>
      </div>
      {q.isLoading ? (
        <p className="text-sm text-muted-foreground">Lade…</p>
      ) : items.length === 0 ? (
        <p className="text-sm text-muted-foreground">Noch keine Dokumente hochgeladen.</p>
      ) : (
        <ul className="divide-y divide-border">
          {items.map((d) => {
            const expired = d.validUntil ? d.validUntil < today : false;
            return (
              <li key={d.id} className="flex items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium text-foreground">
                      {DOC_TYPE_LABEL[d.docType]}
                    </span>
                    {d.verifiedAt && <Badge className="bg-emerald-600 text-white">geprüft</Badge>}
                    {expired && <Badge variant="destructive">abgelaufen</Badge>}
                  </div>
                  <p className="truncate text-xs text-muted-foreground">
                    {d.originalFilename} · {fmtDate(d.createdAt)}
                    {d.validUntil ? ` · gültig bis ${fmtDate(d.validUntil)}` : ""}
                  </p>
                </div>
                <Button size="sm" variant="outline" onClick={() => open(d.id)}>
                  Ansehen
                </Button>
              </li>
            );
          })}
        </ul>
      )}
      <div className="space-y-3 rounded-md border border-border p-3">
        <h3 className="text-sm font-semibold text-foreground">Neues Dokument hochladen</h3>
        <div className="space-y-3">
          <div>
            <Label>Typ</Label>
            <Select
              value={docType || undefined}
              onValueChange={(v) => setDocType(v as StaffDocumentType)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Bitte wählen" />
              </SelectTrigger>
              <SelectContent>
                {DOC_TYPES.map((t) => (
                  <SelectItem key={t} value={t}>
                    {DOC_TYPE_LABEL[t]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="doc-file">Datei (JPG/PNG/PDF, max. 10 MB)</Label>
            <input
              id="doc-file"
              type="file"
              accept="image/jpeg,image/png,application/pdf"
              capture="environment"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="block w-full text-sm text-foreground file:mr-3 file:rounded-md file:border file:border-border file:bg-background file:px-3 file:py-1.5 file:text-sm"
            />
          </div>
          <div>
            <Label htmlFor="valid-until">
              Gültig bis {needsExpiry ? "(empfohlen)" : "(optional)"}
            </Label>
            <Input
              id="valid-until"
              type="date"
              value={validUntil}
              onChange={(e) => setValidUntil(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="doc-note">Notiz (optional)</Label>
            <Input
              id="doc-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={1000}
            />
          </div>
          <div className="flex justify-end">
            <Button type="button" onClick={upload} disabled={uploading}>
              {uploading ? "Lade hoch…" : "Hochladen"}
            </Button>
          </div>
        </div>
      </div>
    </Card>
  );
}
