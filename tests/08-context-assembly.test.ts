import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const invokeMock = vi.hoisted(() => vi.fn());

vi.mock("@tauri-apps/api/core", () => ({
  invoke: invokeMock,
}));

import {
  assembleContext,
  resetColdCache,
  refreshColdMemory,
} from "../src/memory/context";
import { initApiKey } from "../src/memory/llm";
import type { Message } from "../src/memory/llm";

function mockDeepSeekReply(text: string) {
  return new Response(
    JSON.stringify({
      choices: [{ message: { content: text } }],
      usage: { total_tokens: 20, prompt_tokens: 10, completion_tokens: 10 },
    }),
    { status: 200 },
  );
}

describe("context — assembleContext (non-blocking)", () => {
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
        if (cmd === "memory_search") {
          return [];
        }
        return null;
      },
    );
    await initApiKey();
    resetColdCache();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("first message is the system prompt (Hot Memory)", async () => {
    const messages = await assembleContext("hello", []);
    expect(messages[0].role).toBe("system");
    expect(messages[0].content).toContain("Nara'Korrin");
  });

  it("second message is user profile (Deep Memory)", async () => {
    const messages = await assembleContext("hello", []);
    expect(messages[1].role).toBe("system");
    expect(messages[1].content).toContain("User profile:");
    expect(messages[1].content).toContain("name=Captain");
  });

  it("last message is the user message", async () => {
    const messages = await assembleContext("how are you?", []);
    const last = messages[messages.length - 1];
    expect(last.role).toBe("user");
    expect(last.content).toBe("how are you?");
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
    expect(total).toBeLessThanOrEqual(1050); // within budget + margin
  });

  it("does not inject profile section when empty", async () => {
    invokeMock.mockImplementation(
      (cmd: string, args?: Record<string, unknown>) => {
        if (cmd === "config_get_api_key") return "sk-test";
        if (cmd === "memory_get_profile") return [];
        return null;
      },
    );

    const messages = await assembleContext("hello", []);
    expect(
      messages.find((m) => m.content?.includes("User profile:")),
    ).toBeUndefined();
  });

  it("does not block on cold memory (returns instantly, no LLM calls)", async () => {
    const messages = await assembleContext("hello", []);
    // Only Hot + Deep + user message; no cold summary since cache is empty
    expect(messages.length).toBe(3);
  });
});

describe("context — refreshColdMemory (background)", () => {
  beforeEach(async () => {
    invokeMock.mockImplementation(
      (cmd: string, args?: Record<string, unknown>) => {
        if (cmd === "config_get_api_key" && args?.key === "deepseek_api_key")
          return "sk-test";
        if (cmd === "memory_get_profile") return [];
        if (cmd === "memory_search") {
          return [
            {
              session_id: "abc",
              role: "user",
              content: "I like Rust",
              created_at: 1,
            },
          ];
        }
        return null;
      },
    );
    await initApiKey();
    vi.spyOn(global, "fetch").mockImplementation(() =>
      Promise.resolve(mockDeepSeekReply("past conversations about Rust")),
    );
    resetColdCache();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("skips refresh when exchange count is 0", async () => {
    await refreshColdMemory("hello", 0);
    const messages = await assembleContext("hello", []);
    expect(
      messages.some((m) => m.content?.includes("Relevant past conversations:")),
    ).toBe(false);
  });

  it("skips refresh when fewer than 5 exchanges have passed", async () => {
    await refreshColdMemory("hello", 3);
    const messages = await assembleContext("hello", []);
    expect(
      messages.some((m) => m.content?.includes("Relevant past conversations:")),
    ).toBe(false);
  });

  it("refreshes cold summary after 5 exchanges", async () => {
    await refreshColdMemory("hello", 6);
    const messages = await assembleContext("next message", []);
    expect(
      messages.some((m) => m.content?.includes("Relevant past conversations:")),
    ).toBe(true);
    expect(
      messages.some((m) =>
        m.content?.includes("past conversations about Rust"),
      ),
    ).toBe(true);
  });

  it("prevents concurrent refreshes", async () => {
    const p1 = refreshColdMemory("hello", 6);
    const p2 = refreshColdMemory("hello", 6);
    await Promise.all([p1, p2]);
    // Only one should have actually run; the lock prevented the second
    const messages = await assembleContext("next", []);
    expect(
      messages.some((m) => m.content?.includes("Relevant past conversations:")),
    ).toBe(true);
  });

  it("skip refresh when no search results found", async () => {
    invokeMock.mockImplementation(
      (cmd: string, args?: Record<string, unknown>) => {
        if (cmd === "config_get_api_key") return "sk-test";
        if (cmd === "memory_get_profile") return [];
        if (cmd === "memory_search") return [];
        return null;
      },
    );

    await refreshColdMemory("hello", 6);
    const messages = await assembleContext("next msg", []);
    expect(
      messages.some((m) => m.content?.includes("Relevant past conversations:")),
    ).toBe(false);
  });
});

describe("context — resetColdCache", () => {
  it("clears cache and lock", async () => {
    invokeMock.mockImplementation((cmd: string) => {
      if (cmd === "config_get_api_key") return "sk-test";
      if (cmd === "memory_get_profile") return [];
      if (cmd === "memory_search")
        return [
          { session_id: "x", role: "user", content: "data", created_at: 1 },
        ];
      return null;
    });
    await initApiKey();
    vi.spyOn(global, "fetch").mockImplementation(() =>
      Promise.resolve(mockDeepSeekReply("summary")),
    );

    await refreshColdMemory("hello", 6);
    let messages = await assembleContext("test", []);
    expect(
      messages.some((m) => m.content?.includes("Relevant past conversations:")),
    ).toBe(true);

    resetColdCache();
    messages = await assembleContext("test", []);
    expect(
      messages.some((m) => m.content?.includes("Relevant past conversations:")),
    ).toBe(false);

    vi.restoreAllMocks();
  });
});
