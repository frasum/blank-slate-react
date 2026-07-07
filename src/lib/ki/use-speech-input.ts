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
  onstart: (() => void) | null;
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

/**
 * Übersetzt die `SpeechRecognitionErrorEvent.error`-Codes in nutzerfreundliche
 * Hinweise. Reine Funktion, damit sie in Tests abgedeckt werden kann.
 */
export function mapSpeechErrorMessage(code: string): string {
  switch (code) {
    case "not-allowed":
    case "audio-capture":
      return "Mikrofon-Zugriff verweigert — in Safari: Einstellungen → Websites → Mikrofon erlauben.";
    case "service-not-allowed":
    case "no-start":
      return 'Spracherkennung des Browsers nicht verfügbar — auf dem Mac „Siri & Diktat" aktivieren oder die Diktat-Taste der Tastatur nutzen.';
    default:
      return `Spracherkennung fehlgeschlagen (${code}).`;
  }
}

const START_TIMEOUT_MS = 2000;

export type UseSpeechInputOptions = {
  lang?: string;
  /** Wird beim Beenden mit nicht-leerem Text aufgerufen. */
  onFinished?: (text: string) => void;
  /** Wird bei Fehlern (Berechtigung, Dienst, Nicht-Start) mit einer deutschen Meldung aufgerufen. */
  onError?: (message: string) => void;
};

export function useSpeechInput(opts: UseSpeechInputOptions = {}) {
  const { lang = "de-DE", onFinished, onError } = opts;
  const [state, dispatch] = useReducer(speechReducer, initialSpeechState);
  const [permission, setPermission] = useState<SpeechPermission>("unknown");
  const recRef = useRef<BrowserSpeechRecognition | null>(null);
  const finishedCallbackRef = useRef(onFinished);
  finishedCallbackRef.current = onFinished;
  const errorCallbackRef = useRef(onError);
  errorCallbackRef.current = onError;
  const startTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isSupported = useMemo(() => getCtor() !== null, []);

  const clearStartTimer = useCallback(() => {
    if (startTimerRef.current !== null) {
      clearTimeout(startTimerRef.current);
      startTimerRef.current = null;
    }
  }, []);

  const cleanup = useCallback(() => {
    clearStartTimer();
    const r = recRef.current;
    if (!r) return;
    r.onresult = null;
    r.onerror = null;
    r.onstart = null;
    r.onend = null;
    recRef.current = null;
  }, [clearStartTimer]);

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
    r.onstart = () => {
      clearStartTimer();
    };
    r.onerror = (ev) => {
      clearStartTimer();
      if (ev.error === "not-allowed" || ev.error === "service-not-allowed") {
        setPermission("denied");
      }
      errorCallbackRef.current?.(mapSpeechErrorMessage(ev.error));
      dispatch({ type: "stop" });
    };
    r.onend = () => {
      clearStartTimer();
      dispatch({ type: "stop" });
      cleanup();
    };
    recRef.current = r;
    try {
      r.start();
      setPermission((p) => (p === "denied" ? p : "granted"));
      dispatch({ type: "start" });
      startTimerRef.current = setTimeout(() => {
        startTimerRef.current = null;
        // Kein onstart innerhalb von 2 s → gleicher Hinweis wie bei
        // service-not-allowed (typisch, wenn macOS-Diktat deaktiviert ist).
        errorCallbackRef.current?.(mapSpeechErrorMessage("no-start"));
        try {
          recRef.current?.abort();
        } catch {
          /* ignore */
        }
        dispatch({ type: "stop" });
        cleanup();
      }, START_TIMEOUT_MS);
    } catch {
      clearStartTimer();
      errorCallbackRef.current?.(mapSpeechErrorMessage("no-start"));
      dispatch({ type: "stop" });
      cleanup();
    }
  }, [cleanup, clearStartTimer, isSupported, lang, state.status]);

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
