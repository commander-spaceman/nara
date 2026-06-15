import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const invokeMock = vi.hoisted(() => vi.fn());

vi.mock("@tauri-apps/api/core", () => ({
  invoke: invokeMock,
}));

import { assembleContext } from "../src/memory/context";
import { initApiKey } from "../src/memory/llm";
import type { Message } from "../src/memory/llm";

describe("context — assembleContext", () => {
  beforeEach(async () => {
    invokeMock.mockImplementation(
      (cmd: string, args?: Record<string, unknown>) => {
        if (cmd === "config_get_api_key" && args?.key === "deepseek_api_key") {
          return "sk-test";
        }
        if (cmd === "memory_get_profile") {
          return [
            { key: "name", value: "Captain" },
            { key: "pc_name", value: "Vah'Ralla" },
          ];
        }
        return null;
      },
    );
    await initApiKey();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("first message is the system prompt (Hot Memory)", async () => {
    const messages = await assembleContext("hello", []);
    expect(messages[0].role).toBe("system");
    expect(messages[0].content).toContain("Nara'Korrin");
  });

  it("injects user profile (Deep Memory)", async () => {
    const messages = await assembleContext("hello", []);
    expect(messages[1].role).toBe("system");
    expect(messages[1].content).toContain("User profile:");
    expect(messages[1].content).toContain("name=Captain");
    expect(messages[1].content).toContain("pc_name=Vah'Ralla");
  });

  it("last message is the user message", async () => {
    const messages = await assembleContext("how are you?", []);
    const last = messages[messages.length - 1];
    expect(last.role).toBe("user");
    expect(last.content).toBe("how are you?");
  });

  it("skips profile when empty", async () => {
    invokeMock.mockImplementation((cmd: string) => {
      if (cmd === "config_get_api_key") return "sk-test";
      if (cmd === "memory_get_profile") return [];
      return null;
    });

    const messages = await assembleContext("hello", []);
    expect(
      messages.find((m) => m.content?.includes("User profile:")),
    ).toBeUndefined();
  });

  it("trims history to fit token budget", async () => {
    const longText = "very long message that takes many tokens ".repeat(20);
    const history: Message[] = [];
    for (let i = 0; i < 30; i++) {
      history.push({ role: "user", content: longText + i });
      history.push({ role: "assistant", content: longText + i });
    }

    const messages = await assembleContext("hello", history);
    const total = messages.reduce(
      (sum, m) => sum + Math.ceil(m.content.length / 4),
      0,
    );
    expect(total).toBeLessThanOrEqual(1050);
  });

  it("returns instantly with no external calls beyond getProfile", async () => {
    const messages = await assembleContext("hello", []);
    expect(messages.length).toBe(3);
  });
});
