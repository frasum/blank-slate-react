// KI2 — Zustandsmaschine der Spracheingabe (reine Logik, testbar).
// Der Hook `useSpeechInput` bindet nur die Browser-API dünn an diesen
// Reducer an.

export type SpeechStatus = "idle" | "recording";

export type SpeechState = {
  status: SpeechStatus;
  finalText: string;
  interimText: string;
};

export type SpeechEvent =
  | { type: "start" }
  | { type: "stop" }
  | { type: "reset" }
  | { type: "result"; text: string; isFinal: boolean };

export const initialSpeechState: SpeechState = {
  status: "idle",
  finalText: "",
  interimText: "",
};

export function speechReducer(state: SpeechState, event: SpeechEvent): SpeechState {
  switch (event.type) {
    case "start":
      return { status: "recording", finalText: "", interimText: "" };
    case "stop":
      return { ...state, status: "idle", interimText: "" };
    case "reset":
      return initialSpeechState;
    case "result": {
      const text = event.text.trim();
      if (!text) return state;
      if (event.isFinal) {
        const merged = state.finalText ? `${state.finalText} ${text}` : text;
        return { ...state, finalText: merged, interimText: "" };
      }
      return { ...state, interimText: text };
    }
  }
}

/** Kombinierter Text zum Anzeigen / Senden. */
export function combinedText(state: SpeechState): string {
  const parts = [state.finalText, state.interimText].map((s) => s.trim()).filter(Boolean);
  return parts.join(" ").trim();
}

/** true, wenn beim Stopp gesendet werden soll (nicht-leeres Transkript). */
export function shouldSend(state: SpeechState): boolean {
  return combinedText(state).length > 0;
}