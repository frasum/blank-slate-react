import { describe, it, expect } from "vitest";
import { parseStartCommand } from "@/routes/api/public/telegram/webhook";

describe("parseStartCommand", () => {
  it("erkennt /start <token>", () => {
    expect(parseStartCommand("/start abcDEF123456_-abc")).toBe("abcDEF123456_-abc");
  });
  it("erkennt /start@BotName <token>", () => {
    expect(parseStartCommand("/start@Coco_Bot abcDEF123456_-abc")).toBe("abcDEF123456_-abc");
  });
  it("gibt null bei /start ohne Payload", () => {
    expect(parseStartCommand("/start")).toBeNull();
  });
  it("gibt null bei Freitext", () => {
    expect(parseStartCommand("hallo bot")).toBeNull();
  });
  it("gibt null bei zu kurzem Token", () => {
    expect(parseStartCommand("/start short")).toBeNull();
  });
  it("gibt null bei ungültigen Zeichen", () => {
    expect(parseStartCommand("/start abc$def%%%%%%%%%%%%")).toBeNull();
  });
});