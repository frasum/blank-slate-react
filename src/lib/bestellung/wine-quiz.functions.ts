// Server-Functions für das Wein-Quiz (Welle 3-B).
// Jede:r angemeldete Mitarbeiter:in (Rolle "staff" oder höher) darf einen
// Score speichern. Listing zeigt die Top-N-Einträge der Organisation.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { loadAdminCaller } from "@/lib/admin/admin-context";

const SaveInput = z.object({
  staffId: z.string().uuid().nullable().optional(),
  staffName: z.string().trim().min(1).max(200),
  score: z.number().int().min(0).max(1_000_000),
  questionsAnswered: z.number().int().min(0).max(10_000),
  correctAnswers: z.number().int().min(0).max(10_000),
  levelReached: z.number().int().min(0).max(1000),
});

export const saveWineQuizScore = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => SaveInput.parse(input))
  .handler(async ({ data, context }) => {
    const caller = await loadAdminCaller(context.supabase, context.userId, "staff");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row, error } = await supabaseAdmin
      .from("wine_quiz_scores")
      .insert({
        organization_id: caller.organizationId,
        staff_id: data.staffId ?? null,
        staff_name: data.staffName,
        score: data.score,
        questions_answered: data.questionsAnswered,
        correct_answers: data.correctAnswers,
        level_reached: data.levelReached,
      })
      .select("id")
      .single();
    if (error) throw error;
    return { id: row.id };
  });

export const listWineQuizScores = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({ limit: z.number().int().min(1).max(100).optional() })
      .partial()
      .parse(input ?? {}),
  )
  .handler(async ({ data, context }) => {
    const caller = await loadAdminCaller(context.supabase, context.userId, "staff");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows, error } = await supabaseAdmin
      .from("wine_quiz_scores")
      .select(
        "id, staff_id, staff_name, score, questions_answered, correct_answers, level_reached, played_at",
      )
      .eq("organization_id", caller.organizationId)
      .order("score", { ascending: false })
      .order("played_at", { ascending: false })
      .limit(data.limit ?? 20);
    if (error) throw error;
    return rows ?? [];
  });
