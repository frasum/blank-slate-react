// Wein-Quiz (Welle 3-B). Fragen werden client-seitig aus dem eigenen
// Wein-Katalog generiert — keine KI, keine externen Calls.

import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listArticles } from "@/lib/bestellung/articles.functions";
import { listStaff } from "@/lib/admin/staff.functions";
import {
  listWineQuizScores,
  saveWineQuizScore,
} from "@/lib/bestellung/wine-quiz.functions";

export const Route = createFileRoute("/_authenticated/admin/bestellung/wein-quiz")({
  head: () => ({ meta: [{ title: "Wein-Quiz · Bestellung" }] }),
  component: WeinQuizPage,
});

const QUESTIONS_PER_ROUND = 10;

type Wine = Awaited<ReturnType<typeof listArticles>>[number];

type Question = {
  id: string;
  prompt: string;
  choices: string[];
  correctIndex: number;
};

function shuffle<T>(arr: T[]): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function pickDistractors(pool: string[], correct: string, n: number): string[] {
  const set = new Set<string>();
  for (const v of pool) {
    if (v && v !== correct) set.add(v);
  }
  return shuffle(Array.from(set)).slice(0, n);
}

function buildQuestions(wines: Wine[], count: number): Question[] {
  const grapes = Array.from(
    new Set(wines.map((w) => w.grape_variety).filter((v): v is string => !!v && v.trim() !== "")),
  );
  const countries = Array.from(
    new Set(wines.map((w) => w.origin_country).filter((v): v is string => !!v && v.trim() !== "")),
  );
  const names = wines.map((w) => w.name);

  const candidates: Question[] = [];
  let qid = 0;

  for (const w of wines) {
    if (w.grape_variety && grapes.length >= 4) {
      const distractors = pickDistractors(grapes, w.grape_variety, 3);
      if (distractors.length === 3) {
        const choices = shuffle([w.grape_variety, ...distractors]);
        candidates.push({
          id: `g-${qid++}`,
          prompt: `Welche Rebsorte hat „${w.name}"?`,
          choices,
          correctIndex: choices.indexOf(w.grape_variety),
        });
      }
    }
    if (w.origin_country && countries.length >= 4) {
      const distractors = pickDistractors(countries, w.origin_country, 3);
      if (distractors.length === 3) {
        const choices = shuffle([w.origin_country, ...distractors]);
        candidates.push({
          id: `c-${qid++}`,
          prompt: `Woher kommt „${w.name}"?`,
          choices,
          correctIndex: choices.indexOf(w.origin_country),
        });
      }
    }
    if (w.food_pairings && w.food_pairings.trim() && names.length >= 4) {
      const pairing = w.food_pairings.trim();
      const distractors = pickDistractors(names, w.name, 3);
      if (distractors.length === 3) {
        const choices = shuffle([w.name, ...distractors]);
        candidates.push({
          id: `p-${qid++}`,
          prompt: `Welcher Wein passt zu „${pairing}"?`,
          choices,
          correctIndex: choices.indexOf(w.name),
        });
      }
    }
  }

  return shuffle(candidates).slice(0, count);
}

type StaffOption = { id: string; name: string };

type Phase = "setup" | "playing" | "done";

function WeinQuizPage() {
  const qc = useQueryClient();
  const callSave = useServerFn(saveWineQuizScore);

  const winesQ = useQuery({
    queryKey: ["bestellung", "wines", { onlyWine: true }],
    queryFn: () => listArticles({ data: { onlyWine: true } }),
  });
  const staffQ = useQuery({
    queryKey: ["admin", "staff"],
    queryFn: () => listStaff(),
  });
  const boardQ = useQuery({
    queryKey: ["bestellung", "wine-quiz", "leaderboard"],
    queryFn: () => listWineQuizScores({ data: { limit: 20 } }),
  });

  const activeStaff: StaffOption[] = useMemo(
    () =>
      (staffQ.data ?? [])
        .filter((s) => s.isActive)
        .map((s) => ({
          id: s.id,
          name: s.displayName || `${s.firstName ?? ""} ${s.lastName ?? ""}`.trim() || "—",
        })),
    [staffQ.data],
  );

  const [phase, setPhase] = useState<Phase>("setup");
  const [staff, setStaff] = useState<StaffOption | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [idx, setIdx] = useState(0);
  const [score, setScore] = useState(0);
  const [correct, setCorrect] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const wines = winesQ.data ?? [];
  const enoughWines = wines.length >= 4;

  const saveMut = useMutation({
    mutationFn: (input: {
      staffId: string | null;
      staffName: string;
      score: number;
      questionsAnswered: number;
      correctAnswers: number;
      levelReached: number;
    }) => callSave({ data: input }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["bestellung", "wine-quiz", "leaderboard"] }),
    onError: (e) => setMsg(e instanceof Error ? e.message : "Speichern fehlgeschlagen."),
  });

  const startQuiz = () => {
    if (!staff) {
      setMsg("Bitte zuerst Mitarbeiter:in auswählen.");
      return;
    }
    const qs = buildQuestions(wines, QUESTIONS_PER_ROUND);
    if (qs.length === 0) {
      setMsg("Zu wenige Wein-Daten für Fragen. Bitte Rebsorte/Herkunft/Pairings ergänzen.");
      return;
    }
    setQuestions(qs);
    setIdx(0);
    setScore(0);
    setCorrect(0);
    setPicked(null);
    setMsg(null);
    setPhase("playing");
  };

  const answer = (choice: number) => {
    if (picked != null) return;
    setPicked(choice);
    const q = questions[idx];
    if (choice === q.correctIndex) {
      setCorrect((c) => c + 1);
      setScore((s) => s + 100);
    }
  };

  const next = () => {
    if (idx + 1 >= questions.length) {
      const level = Math.floor(correct / 3);
      const correctSnapshot = correct;
      const scoreSnapshot = score;
      setPhase("done");
      if (staff) {
        saveMut.mutate({
          staffId: staff.id,
          staffName: staff.name,
          score: scoreSnapshot,
          questionsAnswered: questions.length,
          correctAnswers: correctSnapshot,
          levelReached: level,
        });
      }
      return;
    }
    setIdx((i) => i + 1);
    setPicked(null);
  };

  const resetAll = () => {
    setPhase("setup");
    setStaff(null);
    setQuestions([]);
    setIdx(0);
    setScore(0);
    setCorrect(0);
    setPicked(null);
    setMsg(null);
  };

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_320px]">
      <div className="space-y-4">
        {!enoughWines && (
          <p className="rounded-md border border-border bg-muted/40 p-3 text-sm text-muted-foreground">
            Es sind erst {wines.length} Weine im Katalog. Lege mindestens 4 Weine mit Rebsorte
            und Herkunft an, damit Quiz-Fragen erzeugt werden können.
          </p>
        )}

        {phase === "setup" && (
          <div className="space-y-3 rounded-md border border-border bg-card p-4">
            <h2 className="text-lg font-semibold">Bereit für eine Runde?</h2>
            <label className="block text-xs">
              <span className="block uppercase tracking-wide text-muted-foreground">
                Mitarbeiter:in
              </span>
              <select
                value={staff?.id ?? ""}
                onChange={(e) => {
                  const id = e.target.value;
                  setStaff(activeStaff.find((s) => s.id === id) ?? null);
                }}
                className={selectCls}
              >
                <option value="">— wählen —</option>
                {activeStaff.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>
            {msg && <p className="text-sm text-destructive">{msg}</p>}
            <button
              onClick={startQuiz}
              disabled={!enoughWines}
              className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              Quiz starten
            </button>
          </div>
        )}

        {phase === "playing" && questions[idx] && (
          <div className="space-y-3 rounded-md border border-border bg-card p-4">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>
                Frage {idx + 1} / {questions.length}
              </span>
              <span>Punkte: {score}</span>
            </div>
            <h3 className="text-lg font-medium">{questions[idx].prompt}</h3>
            <ul className="space-y-2">
              {questions[idx].choices.map((c, i) => {
                const isCorrect = i === questions[idx].correctIndex;
                const isPicked = picked === i;
                let cls =
                  "w-full rounded-md border border-input bg-background px-3 py-2 text-left text-sm hover:bg-accent";
                if (picked != null) {
                  if (isCorrect)
                    cls =
                      "w-full rounded-md border border-green-500 bg-green-50 px-3 py-2 text-left text-sm text-green-900 dark:bg-green-900/30 dark:text-green-200";
                  else if (isPicked)
                    cls =
                      "w-full rounded-md border border-destructive bg-destructive/10 px-3 py-2 text-left text-sm text-destructive";
                }
                return (
                  <li key={i}>
                    <button onClick={() => answer(i)} className={cls} disabled={picked != null}>
                      {c}
                    </button>
                  </li>
                );
              })}
            </ul>
            {picked != null && (
              <div className="flex justify-end">
                <button
                  onClick={next}
                  className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
                >
                  {idx + 1 >= questions.length ? "Beenden" : "Weiter"}
                </button>
              </div>
            )}
          </div>
        )}

        {phase === "done" && (
          <div className="space-y-3 rounded-md border border-border bg-card p-4">
            <h2 className="text-lg font-semibold">Fertig!</h2>
            <p className="text-sm">
              {staff?.name}: <strong>{correct}</strong> von {questions.length} richtig —{" "}
              <strong>{score} Punkte</strong>.
            </p>
            {saveMut.isPending && (
              <p className="text-xs text-muted-foreground">Speichere Score …</p>
            )}
            {msg && <p className="text-sm text-destructive">{msg}</p>}
            <div className="flex gap-2">
              <button
                onClick={resetAll}
                className="rounded-md border border-input bg-background px-3 py-2 text-sm hover:bg-accent"
              >
                Neue Runde
              </button>
            </div>
          </div>
        )}
      </div>

      <aside className="space-y-3 rounded-md border border-border bg-card p-4">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Bestenliste
        </h3>
        {boardQ.isLoading && <p className="text-xs text-muted-foreground">Lädt …</p>}
        {boardQ.data && boardQ.data.length === 0 && (
          <p className="text-xs text-muted-foreground">Noch keine Einträge.</p>
        )}
        <ol className="space-y-1 text-sm">
          {(boardQ.data ?? []).map((row, i) => (
            <li key={row.id} className="flex items-center justify-between gap-2">
              <span className="truncate">
                <span className="mr-2 text-xs text-muted-foreground">{i + 1}.</span>
                {row.staff_name}
              </span>
              <span className="font-mono text-xs">
                {row.score} ({row.correct_answers}/{row.questions_answered})
              </span>
            </li>
          ))}
        </ol>
      </aside>
    </div>
  );
}

const inputCls =
  "mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring";
const selectCls = inputCls;