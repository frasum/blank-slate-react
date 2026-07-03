// Wiederverwendbare Admin-Upload-Komponente für staff_documents.
// Prop `defaultDocType` erlaubt Vorbelegung (z. B. "contract" für den
// Vertrags-Scan im Stammblatt). In dieser Welle nur im Stammblatt-Bereich
// „Dokumente" eingesetzt; die Einbindung in /admin/personal-antraege ist
// bewusst NICHT Teil dieser Welle.

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { adminUploadStaffDocument } from "@/lib/profile/profile-admin.functions";
import { DOC_TYPES, type StaffDocumentType } from "@/lib/profile/staff-document-path";

const DOC_TYPE_LABEL: Record<StaffDocumentType, string> = {
  passport: "Pass",
  visa: "Visum",
  work_permit: "Arbeitserlaubnis",
  health_certificate: "Gesundheitszeugnis",
  contract: "Vertrag",
  other: "Sonstiges",
};

export function AdminDocumentUpload({
  staffId,
  defaultDocType = "other",
  invalidateKeys = [],
  onUploaded,
  label,
}: {
  staffId: string;
  defaultDocType?: StaffDocumentType;
  invalidateKeys?: unknown[][];
  onUploaded?: () => void;
  label?: string;
}) {
  const queryClient = useQueryClient();
  const callUpload = useServerFn(adminUploadStaffDocument);
  const [docType, setDocType] = useState<StaffDocumentType>(defaultDocType);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: async (file: File) => {
      const dataUrl: string = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onerror = () => reject(reader.error ?? new Error("Lesefehler"));
        reader.onload = () => resolve(String(reader.result));
        reader.readAsDataURL(file);
      });
      const contentBase64 = dataUrl.split(",")[1] ?? "";
      return callUpload({
        data: {
          staffId,
          docType,
          fileName: file.name,
          contentBase64,
          mimeType: file.type,
        },
      });
    },
    onSuccess: async () => {
      setMsg("Hochgeladen.");
      setErr(null);
      for (const key of invalidateKeys) {
        await queryClient.invalidateQueries({ queryKey: key });
      }
      onUploaded?.();
    },
    onError: (e: unknown) => {
      setErr(e instanceof Error ? e.message : "Upload fehlgeschlagen.");
      setMsg(null);
    },
  });

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setBusy(true);
    setMsg(null);
    setErr(null);
    try {
      await mutation.mutateAsync(file);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <label className="text-xs font-medium text-muted-foreground">Typ</label>
        <select
          value={docType}
          onChange={(e) => setDocType(e.target.value as StaffDocumentType)}
          disabled={busy}
          className="rounded-md border border-input bg-background px-2 py-1 text-sm disabled:opacity-60"
        >
          {DOC_TYPES.map((t) => (
            <option key={t} value={t}>
              {DOC_TYPE_LABEL[t]}
            </option>
          ))}
        </select>
        <label className="inline-flex items-center gap-2">
          <span className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-accent">
            {busy ? "Lädt…" : (label ?? "Datei wählen")}
          </span>
          <input
            type="file"
            accept="image/jpeg,image/png,application/pdf"
            disabled={busy}
            onChange={onFile}
            className="hidden"
          />
        </label>
      </div>
      {msg && <p className="text-xs text-muted-foreground">{msg}</p>}
      {err && <p className="text-xs text-destructive">{err}</p>}
    </div>
  );
}