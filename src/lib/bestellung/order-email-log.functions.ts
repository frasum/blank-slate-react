// Read-Only-Zugriff auf order_email_log — nur Manager/Admin der Caller-Org.
// listOrderEmailLog liefert die Historie ohne response_body (kann groß sein);
// getOrderEmailLogEntry gibt das Detail inkl. response_body für eine Zeile.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type OrderEmailLogRow = {
  id: string;
  sent_at: string;
  mode: "production" | "test";
  recipient_email: string;
  supplier_email_snapshot: string | null;
  subject: string;
  status: "sent" | "failed";
  http_status: number | null;
  provider_message_id: string | null;
  error_message: string | null;
  is_resend: boolean;
};

export type OrderEmailLogDetail = OrderEmailLogRow & {
  response_body: string | null;
  triggered_by_user_id: string | null;
};

export const listOrderEmailLog = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ orderId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }): Promise<OrderEmailLogRow[]> => {
    const { data: rows, error } = await context.supabase
      .from("order_email_log")
      .select(
        "id, sent_at, mode, recipient_email, supplier_email_snapshot, subject, status, http_status, provider_message_id, error_message, is_resend",
      )
      .eq("order_id", data.orderId)
      .order("sent_at", { ascending: false });
    if (error) throw error;
    return (rows ?? []) as OrderEmailLogRow[];
  });

export const getOrderEmailLogEntry = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }): Promise<OrderEmailLogDetail | null> => {
    const { data: row, error } = await context.supabase
      .from("order_email_log")
      .select(
        "id, sent_at, mode, recipient_email, supplier_email_snapshot, subject, status, http_status, provider_message_id, error_message, is_resend, response_body, triggered_by_user_id",
      )
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw error;
    return (row ?? null) as OrderEmailLogDetail | null;
  });