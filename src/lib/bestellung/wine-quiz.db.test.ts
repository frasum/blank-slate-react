// DB-Integrationstest für Wein-Quiz (Welle 3-B).
// Skips ohne SUPABASE_DB_TESTS.
//
// (a) Insert eines Scores klappt — org, staff snapshot, score, level.
// (b) Liste sortiert absteigend nach score.
// (c) Nach Löschen des staff bleibt der Eintrag erhalten,
//     staff_id wird NULL, staff_name bleibt (Snapshot).

import { describe, it, expect, beforeAll } from "vitest";
import { dbTestsEnabled, seedOrg, type SeededOrg, type SeededUser } from "@/test/db-setup";

describe.skipIf(!dbTestsEnabled)("wein-quiz (DB)", () => {
  let org: SeededOrg;
  let user: SeededUser;

  beforeAll(async () => {
    org = await seedOrg("wein-quiz");
    user = await org.mkUser("staff");
  });

  async function insertScore(staffId: string | null, staffName: string, score: number) {
    const { data, error } = await org.service
      .from("wine_quiz_scores")
      .insert({
        organization_id: org.orgId,
        staff_id: staffId,
        staff_name: staffName,
        score,
        questions_answered: 10,
        correct_answers: Math.min(10, Math.floor(score / 100)),
        level_reached: Math.floor(score / 300),
      })
      .select("id")
      .single();
    expect(error).toBeNull();
    return data!.id as string;
  }

  it("(a) Score speichern", async () => {
    const id = await insertScore(user.staffId, "Test Player", 500);
    const { data } = await org.service
      .from("wine_quiz_scores")
      .select("organization_id, staff_id, staff_name, score, level_reached")
      .eq("id", id)
      .single();
    expect(data!.organization_id).toBe(org.orgId);
    expect(data!.staff_id).toBe(user.staffId);
    expect(data!.staff_name).toBe("Test Player");
    expect(data!.score).toBe(500);
    expect(data!.level_reached).toBe(1);
  });

  it("(b) Liste sortiert nach score desc", async () => {
    await insertScore(user.staffId, "Player A", 200);
    await insertScore(user.staffId, "Player B", 900);
    await insertScore(user.staffId, "Player C", 400);
    const { data } = await org.service
      .from("wine_quiz_scores")
      .select("score")
      .eq("organization_id", org.orgId)
      .order("score", { ascending: false })
      .limit(3);
    expect(data!.length).toBeGreaterThanOrEqual(3);
    const scores = data!.map((r) => r.score);
    for (let i = 1; i < scores.length; i++) {
      expect(scores[i - 1]).toBeGreaterThanOrEqual(scores[i]);
    }
  });

  it("(c) staff löschen → Score bleibt, staff_id NULL, snapshot intakt", async () => {
    const tmpUser = await org.mkUser("staff");
    const scoreId = await insertScore(tmpUser.staffId, "Ephemeral Eve", 700);

    const { error: delErr } = await org.service
      .from("staff")
      .delete()
      .eq("id", tmpUser.staffId);
    expect(delErr).toBeNull();

    const { data } = await org.service
      .from("wine_quiz_scores")
      .select("staff_id, staff_name, score")
      .eq("id", scoreId)
      .single();
    expect(data).not.toBeNull();
    expect(data!.staff_id).toBeNull();
    expect(data!.staff_name).toBe("Ephemeral Eve");
    expect(data!.score).toBe(700);
  });
});