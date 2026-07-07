import { describe, expect, it } from "vitest";
import {
  combinedText,
  initialSpeechState,
  shouldSend,
  speechReducer,
} from "./speech-state";

describe("speechReducer", () => {
  it("startet leer im Recording-Zustand", () => {
    const s = speechReducer(initialSpeechState, { type: "start" });
    expect(s.status).toBe("recording");
    expect(s.finalText).toBe("");
    expect(s.interimText).toBe("");
  });

  it("übernimmt Interim-Ergebnisse ohne Final-Text zu verändern", () => {
    let s = speechReducer(initialSpeechState, { type: "start" });
    s = speechReducer(s, { type: "result", text: "wie viele", isFinal: false });
    expect(s.interimText).toBe("wie viele");
    expect(s.finalText).toBe("");
  });

  it("hängt Final-Ergebnisse an und leert Interim", () => {
    let s = speechReducer(initialSpeechState, { type: "start" });
    s = speechReducer(s, { type: "result", text: "wie viele", isFinal: false });
    s = speechReducer(s, { type: "result", text: "Wie viele Flaschen", isFinal: true });
    s = speechReducer(s, { type: "result", text: "Chardonnay", isFinal: true });
    expect(s.finalText).toBe("Wie viele Flaschen Chardonnay");
    expect(s.interimText).toBe("");
  });

  it("ignoriert leere Ergebnisse", () => {
    let s = speechReducer(initialSpeechState, { type: "start" });
    s = speechReducer(s, { type: "result", text: "   ", isFinal: true });
    expect(s.finalText).toBe("");
  });

  it("stop wechselt zu idle und leert Interim, hält Final", () => {
    let s = speechReducer(initialSpeechState, { type: "start" });
    s = speechReducer(s, { type: "result", text: "Hallo", isFinal: true });
    s = speechReducer(s, { type: "result", text: "Welt", isFinal: false });
    s = speechReducer(s, { type: "stop" });
    expect(s.status).toBe("idle");
    expect(s.finalText).toBe("Hallo");
    expect(s.interimText).toBe("");
  });

  it("reset setzt komplett zurück", () => {
    let s = speechReducer(initialSpeechState, { type: "start" });
    s = speechReducer(s, { type: "result", text: "Hallo", isFinal: true });
    s = speechReducer(s, { type: "reset" });
    expect(s).toEqual(initialSpeechState);
  });
});

describe("combinedText / shouldSend", () => {
  it("kombiniert Final + Interim", () => {
    const s = { status: "recording" as const, finalText: "Hallo", interimText: "Welt" };
    expect(combinedText(s)).toBe("Hallo Welt");
    expect(shouldSend(s)).toBe(true);
  });

  it("leeres Transkript sendet nicht", () => {
    expect(shouldSend(initialSpeechState)).toBe(false);
    expect(shouldSend({ status: "idle", finalText: "   ", interimText: "" })).toBe(false);
  });
});