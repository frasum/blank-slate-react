// KI2 — Hook um die native Web Speech API (SpeechRecognition /
// webkitSpeechRecognition). Dünner Wrapper: alle Zustandsübergänge laufen
// über den reinen Reducer in `./speech-state.ts` (dort auch die Tests).
//
// Verhalten:
// - lang: "de-DE", interimResults: true, continuous: true
// - Feature-Erkennung: `isSupported === false` → UI blendet den Knopf aus.
// - Berechtigung: erste Aktivierung fragt den Browser; bei Ablehnung
//   liefert der Hook `permission: "denied"` (Tooltip auf UI-Seite).
// - Ende (manuell oder automatisch) triggert `onFinished(text)` — leerer
//   Text wird gefiltert.

import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { combinedText, initialSpeechState, shouldSend, speechReducer } from "./speech-state";

type BrowserSpeechRecognition = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((ev: SpeechResultEvent) => void) | null;
  onerror: ((ev: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
};

type SpeechResultAlt = { transcript: string };
type SpeechResultItem = { 0: SpeechResultAlt; isFinal: boolean; length: number };
type SpeechResultList = { length: number; [i: number]: SpeechResultItem };
type SpeechResultEvent = { resultIndex: number; results: SpeechResultList };

type Ctor = new () => BrowserSpeechRecognition;

function getCtor(): Ctor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: Ctor;
    webkitSpeechRecognition?: Ctor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export type SpeechPermission = "unknown" | "granted" | "denied";

export type UseSpeechInputOptions = {
  lang?: string;
  /** Wird beim Beenden mit nicht-leerem Text aufgerufen. */
  onFinished?: (text: string) => void;
};

export function useSpeechInput(opts: UseSpeechInputOptions = {}) {
  const { lang = "de-DE", onFinished } = opts;
  const [state, dispatch] = useReducer(speechReducer, initialSpeechState);
  const [permission, setPermission] = useState<SpeechPermission>("unknown");
  const recRef = useRef<BrowserSpeechRecognition | null>(null);
  const finishedCallbackRef = useRef(onFinished);
  finishedCallbackRef.current = onFinished;

  const isSupported = useMemo(() => getCtor() !== null, []);

  const cleanup = useCallback(() => {
    const r = recRef.current;
    if (!r) return;
    r.onresult = null;
    r.onerror = null;
    r.onend = null;
    recRef.current = null;
  }, []);

  // Beim Statuswechsel auf "idle" (nach stop) senden — genau einmal pro
  // Aufnahme-Zyklus.
  const wasRecordingRef = useRef(false);
  useEffect(() => {
    if (state.status === "recording") {
      wasRecordingRef.current = true;
      return;
    }
    if (state.status === "idle" && wasRecordingRef.current) {
      wasRecordingRef.current = false;
      if (shouldSend(state)) {
        finishedCallbackRef.current?.(combinedText(state));
      }
    }
  }, [state]);

  const start = useCallback(() => {
    if (!isSupported) return;
    if (state.status === "recording") return;
    const Ctor = getCtor();
    if (!Ctor) return;
    cleanup();
    const r = new Ctor();
    r.lang = lang;
    r.interimResults = true;
    r.continuous = true;
    r.onresult = (ev) => {
      for (let i = ev.resultIndex; i < ev.results.length; i++) {
        const res = ev.results[i];
        const alt = res[0];
        if (!alt) continue;
        dispatch({ type: "result", text: alt.transcript, isFinal: res.isFinal });
      }
    };
    r.onerror = (ev) => {
      if (ev.error === "not-allowed" || ev.error === "service-not-allowed") {
        setPermission("denied");
      }
      dispatch({ type: "stop" });
    };
    r.onend = () => {
      dispatch({ type: "stop" });
      cleanup();
    };
    recRef.current = r;
    try {
      r.start();
      setPermission((p) => (p === "denied" ? p : "granted"));
      dispatch({ type: "start" });
    } catch {
      dispatch({ type: "stop" });
      cleanup();
    }
  }, [cleanup, isSupported, lang, state.status]);

  const stop = useCallback(() => {
    const r = recRef.current;
    if (!r) {
      dispatch({ type: "stop" });
      return;
    }
    try {
      r.stop();
    } catch {
      dispatch({ type: "stop" });
      cleanup();
    }
  }, [cleanup]);

  const reset = useCallback(() => {
    dispatch({ type: "reset" });
  }, []);

  useEffect(() => () => cleanup(), [cleanup]);

  return {
    isSupported,
    permission,
    status: state.status,
    finalText: state.finalText,
    interimText: state.interimText,
    text: combinedText(state),
    isRecording: state.status === "recording",
    start,
    stop,
    reset,
  };
}
