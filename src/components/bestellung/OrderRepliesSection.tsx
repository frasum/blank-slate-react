// BM1 UI: Lieferanten-Antworten unter einer Bestellung anzeigen.
// Öffnen der Karte ruft markOrderReplyRead; Anhangs-URLs werden bei Klick
// per getReplyAttachmentUrl frisch signiert (10 min TTL).

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { formatShortDateTime } from "@/lib/format-date";
import {
  getReplyAttachmentUrl,
  listOrderReplies,
  markOrderReplyRead,
  type OrderReplyAttachment,
  type OrderReplyRow,
} from "@/lib/bestellung/order-replies.functions";

export function OrderRepliesSection({ orderId }: { orderId: string }) {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["bestellung", "replies", { orderId }],
    queryFn: () => listOrderReplies({ data: { orderId } }),
  });
  const callMarkRead = useServerFn(markOrderReplyRead);
  const markRead = useMutation({
    mutationFn: (replyId: string) => callMarkRead({ data: { replyId } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["bestellung", "replies"] });
    },
  });

  if (q.isLoading) {
    return <p className="mt-3 text-xs text-muted-foreground">Lade Antworten …</p>;
  }
  const rows = q.data ?? [];
  return (
    <div className="mt-4 space-y-2 text-xs">
      <p className="font-medium uppercase tracking-wide text-muted-foreground">
        Antworten vom Lieferanten
      </p>
      {rows.length === 0 ? (
        <p className="text-muted-foreground">Noch keine Antworten eingegangen.</p>
      ) : (
        <ul className="space-y-2">
          {rows.map((r) => (
            <ReplyCard
              key={r.id}
              reply={r}
              onOpen={() => {
                if (!r.read_at) markRead.mutate(r.id);
              }}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

export function ReplyCard({ reply, onOpen }: { reply: OrderReplyRow; onOpen?: () => void }) {
  return (
    <li
      className={
        "rounded border px-3 py-2 " +
        (reply.read_at
          ? "border-border bg-background"
          : "border-amber-300 bg-amber-50 dark:border-amber-700 dark:bg-amber-900/10")
      }
      onClick={onOpen}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate font-medium text-foreground">
            {reply.from_name ? `${reply.from_name} <${reply.from_email}>` : reply.from_email}
          </p>
          <p className="truncate text-muted-foreground">{reply.subject ?? "(ohne Betreff)"}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {!reply.read_at && (
            <span className="rounded bg-amber-500 px-1.5 py-0.5 text-[10px] font-semibold text-white">
              neu
            </span>
          )}
          <span className="text-muted-foreground">{formatShortDateTime(reply.received_at)}</span>
        </div>
      </div>
      {reply.body_text && (
        <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap font-sans text-foreground">
          {reply.body_text}
        </pre>
      )}
      {reply.attachments.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {reply.attachments.map((a) => (
            <AttachmentChip key={a.id} att={a} />
          ))}
        </div>
      )}
    </li>
  );
}

function AttachmentChip({ att }: { att: OrderReplyAttachment }) {
  const callUrl = useServerFn(getReplyAttachmentUrl);
  const open = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const { url } = await callUrl({ data: { attachmentId: att.id } });
      window.open(url, "_blank", "noopener");
    } catch {
      // still nothing — chip stays as-is
    }
  };
  return (
    <button
      type="button"
      onClick={open}
      className="rounded border border-input bg-background px-2 py-0.5 text-[10px] hover:bg-accent"
      title={`${(att.size_bytes / 1024).toFixed(0)} KB · ${att.content_type}`}
    >
      📎 {att.file_name}
    </button>
  );
}
