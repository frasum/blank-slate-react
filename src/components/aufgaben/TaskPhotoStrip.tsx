// Foto-Leiste an einer Aufgabe (AF1). Wird sowohl im Portal (Zeit/Aufgaben)
// als auch in der Admin-Aufgaben-Ansicht benutzt — einmal bauen, zweimal
// einbinden.
//
// - Kamera am Handy: <input capture="environment"> öffnet direkt die Kamera.
// - Kompression: Canvas, längste Kante 1600 px, JPEG ~0.8. Fällt bei nicht
//   dekodierbarem Bild auf das Original zurück, sofern ≤ 8 MB.
// - Thumbnails: Tap → Vollbild-Overlay. Papierkorb sichtbar für Uploader oder
//   Manager+ (Server prüft die Rechte final; UI dient nur der Führung).

import { useMemo, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Trash2, Camera, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  deleteTaskPhoto,
  listTaskPhotos,
  uploadTaskPhoto,
  type TaskPhoto,
} from "@/lib/aufgaben/task-photos.functions";

const MAX_BYTES = 8 * 1024 * 1024;
const MAX_EDGE = 1600;

type Props = {
  taskId: string;
  /** Effektive Staff-Id des Aufrufers (für „eigenes Foto löschen"). */
  currentStaffId: string | null;
  /** Manager/Admin sehen den Papierkorb an jedem Foto. */
  canManage: boolean;
};

const PHOTOS_KEY = (taskId: string) => ["task-photos", taskId] as const;

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = () => reject(new Error("Bild konnte nicht gelesen werden."));
    r.readAsDataURL(file);
  });
}

function stripDataUrlPrefix(dataUrl: string): string {
  const i = dataUrl.indexOf(",");
  return i >= 0 ? dataUrl.slice(i + 1) : dataUrl;
}

async function compressImage(
  file: File,
): Promise<{ base64: string; mimeType: string } | null> {
  try {
    const url = URL.createObjectURL(file);
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("decode failed"));
      el.src = url;
    });
    const longest = Math.max(img.width, img.height);
    const scale = longest > MAX_EDGE ? MAX_EDGE / longest : 1;
    const w = Math.round(img.width * scale);
    const h = Math.round(img.height * scale);
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("no ctx");
    ctx.drawImage(img, 0, 0, w, h);
    URL.revokeObjectURL(url);
    const dataUrl = canvas.toDataURL("image/jpeg", 0.8);
    return { base64: stripDataUrlPrefix(dataUrl), mimeType: "image/jpeg" };
  } catch {
    return null;
  }
}

export function TaskPhotoStrip({ taskId, currentStaffId, canManage }: Props) {
  const qc = useQueryClient();
  const listFn = useServerFn(listTaskPhotos);
  const uploadFn = useServerFn(uploadTaskPhoto);
  const deleteFn = useServerFn(deleteTaskPhoto);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [busy, setBusy] = useState<number>(0);
  const [lightbox, setLightbox] = useState<TaskPhoto | null>(null);

  const q = useQuery({
    queryKey: PHOTOS_KEY(taskId),
    queryFn: () => listFn({ data: { taskId } }),
  });

  const del = useMutation({
    mutationFn: (photoId: string) => deleteFn({ data: { photoId } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: PHOTOS_KEY(taskId) }),
    onError: (e) => toast.error(e instanceof Error ? e.message : "Löschen fehlgeschlagen."),
  });

  const photos = q.data ?? [];
  const countLabel = useMemo(() => `${photos.length}/10`, [photos.length]);

  async function handleFiles(fileList: FileList | null) {
    if (!fileList || fileList.length === 0) return;
    const files = Array.from(fileList);
    setBusy((n) => n + files.length);
    for (const file of files) {
      try {
        let base64: string;
        let mimeType: string;
        const compressed = await compressImage(file);
        if (compressed) {
          base64 = compressed.base64;
          mimeType = compressed.mimeType;
        } else {
          if (file.size > MAX_BYTES) throw new Error("Bild ist zu groß (max. 8 MB).");
          const allowed = ["image/jpeg", "image/png", "image/webp"];
          if (!allowed.includes(file.type)) throw new Error("Nur JPG, PNG oder WEBP.");
          const dataUrl = await fileToDataUrl(file);
          base64 = stripDataUrlPrefix(dataUrl);
          mimeType = file.type;
        }
        await uploadFn({
          data: { taskId, base64, mimeType, fileName: file.name.slice(0, 200) },
        });
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Foto-Upload fehlgeschlagen.");
      } finally {
        setBusy((n) => Math.max(0, n - 1));
      }
    }
    await qc.invalidateQueries({ queryKey: PHOTOS_KEY(taskId) });
  }

  return (
    <div className="grid gap-2">
      <div className="flex items-center justify-between">
        <div className="text-xs font-medium text-muted-foreground">📷 Fotos ({countLabel})</div>
        <div className="flex items-center gap-2">
          {busy > 0 ? (
            <span className="text-xs text-muted-foreground">Lade {busy}…</span>
          ) : null}
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => inputRef.current?.click()}
            disabled={photos.length >= 10}
          >
            <Camera className="mr-1 h-4 w-4" /> Foto hinzufügen
          </Button>
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            capture="environment"
            multiple
            className="hidden"
            onChange={(e) => {
              void handleFiles(e.target.files);
              e.target.value = "";
            }}
          />
        </div>
      </div>
      {q.isLoading ? (
        <p className="text-xs text-muted-foreground">Lade Fotos…</p>
      ) : photos.length === 0 ? (
        <p className="text-xs text-muted-foreground">Noch keine Fotos.</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {photos.map((p) => {
            const canDelete = canManage || p.uploadedByStaffId === currentStaffId;
            return (
              <div
                key={p.id}
                className="group relative h-20 w-20 overflow-hidden rounded-md border border-border bg-muted"
              >
                <button
                  type="button"
                  onClick={() => setLightbox(p)}
                  className="block h-full w-full"
                  aria-label="Foto vergrößern"
                >
                  <img
                    src={p.url}
                    alt="Task-Foto"
                    className="h-full w-full object-cover"
                    loading="lazy"
                  />
                </button>
                {canDelete ? (
                  <button
                    type="button"
                    onClick={() => {
                      if (window.confirm("Dieses Foto löschen?")) del.mutate(p.id);
                    }}
                    disabled={del.isPending}
                    className="absolute right-1 top-1 rounded-full bg-background/90 p-1 text-destructive shadow-sm opacity-0 transition group-hover:opacity-100 focus:opacity-100 disabled:opacity-40"
                    aria-label="Foto löschen"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                ) : null}
              </div>
            );
          })}
        </div>
      )}

      {lightbox ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
          onClick={() => setLightbox(null)}
        >
          <button
            type="button"
            onClick={() => setLightbox(null)}
            className="absolute right-4 top-4 rounded-full bg-background/90 p-2 text-foreground shadow"
            aria-label="Schließen"
          >
            <X className="h-5 w-5" />
          </button>
          <img
            src={lightbox.url}
            alt="Task-Foto"
            className="max-h-full max-w-full rounded-md object-contain"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      ) : null}
    </div>
  );
}