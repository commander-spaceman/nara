import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const invokeMock = vi.hoisted(() => vi.fn());

vi.mock("@tauri-apps/api/core", () => ({
  invoke: invokeMock,
}));

import { assembleContext, resetColdCache } from "../src/modules/context";
import { initApiKey } from "../src/modules/llm";
import type { Message } from "../src/modules/llm";

function mockDeepSeekReply(text: string) {
  return new Response(
    JSON.stringify({
      choices: [{ message: { content: text } }],
      usage: { total_tokens: 20, prompt_tokens: 10, completion_tokens: 10 },
    }),
    { status: 200 },
  );
}

describe("context — assembleContext structure", () => {
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
    vi.spyOn(global, "fetch");
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
    expect(messages[1].content).toContain("pc_name=Vah'Ralla");
  });

  it("last message is the user message", async () => {
    const messages = await assembleContext("how are you?", []);
    const last = messages[messages.length - 1];
    expect(last.role).toBe("user");
    expect(last.content).toBe("how are you?");
  });

  it("includes recent history (last 10 messages)", async () => {
    const history: Message[] = [];
    for (let i = 0; i < 14; i++) {
      history.push({ role: "user", content: `msg ${i}` });
      history.push({ role: "assistant", content: `reply ${i}` });
    }

    const messages = await assembleContext("latest", history);

    const historyMessages = messages.filter(
      (m) => m.role === "user" && m.content.startsWith("msg"),
    );
    expect(historyMessages.length).toBeLessThanOrEqual(5);
  });
});

describe("context — Deep Memory", () => {
  beforeEach(async () => {
    invokeMock.mockImplementation(
      (cmd: string, args?: Record<string, unknown>) => {
        if (cmd === "config_get_api_key" && args?.key === "deepseek_api_key") {
          return "sk-test";
        }
        if (cmd === "memory_get_profile") {
          return [];
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

  it("does not inject profile section when empty", async () => {
    const messages = await assembleContext("hello", []);
    const profileMsg = messages.find((m) =>
      m.content?.includes("User profile:"),
    );
    expect(profileMsg).toBeUndefined();
  });
});

describe("context — Cold Memory cache", () => {
  beforeEach(async () => {
    invokeMock.mockImplementation(
      (cmd: string, args?: Record<string, unknown>) => {
        if (cmd === "config_get_api_key" && args?.key === "deepseek_api_key") {
          return "sk-test";
        }
        if (cmd === "memory_get_profile") {
          return [];
        }
        if (cmd === "memory_search") {
          return [
            {
              session_id: "abc",
              role: "user",
              content: "I like Rust programming",
              created_at: 1,
            },
          ];
        }
        return null;
      },
    );
    await initApiKey();
    vi.spyOn(global, "fetch").mockImplementation(() =>
      Promise.resolve(mockDeepSeekReply("test summary")),
    );
    resetColdCache();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("cold summary not injected when no search results", async () => {
    invokeMock.mockImplementation(
      (cmd: string, args?: Record<string, unknown>) => {
        if (cmd === "config_get_api_key") return "sk-test";
        if (cmd === "memory_get_profile") return [];
        if (cmd === "memory_search") return [];
        return null;
      },
    );

    const history: Message[] = [];
    for (let i = 0; i < 6; i++) {
      history.push({ role: "user", content: `msg ${i}` });
      history.push({ role: "assistant", content: `reply ${i}` });
    }

    const messages = await assembleContext("hello", history);
    expect(
      messages.some((m) => m.content?.includes("Relevant past conversations:")),
    ).toBe(false);
  });

  it("cold summary injected when past messages found", async () => {
    const history: Message[] = [];
    for (let i = 0; i < 6; i++) {
      history.push({ role: "user", content: `msg ${i}` });
      history.push({ role: "assistant", content: `reply ${i}` });
    }

    const messages = await assembleContext("hello", history);
    expect(
      messages.some((m) => m.content?.includes("Relevant past conversations:")),
    ).toBe(true);
    expect(messages.some((m) => m.content?.includes("test summary"))).toBe(
      true,
    );
  });
});

describe("context — resetColdCache", () => {
  it("resets the cold summary", async () => {
    invokeMock.mockImplementation(
      (cmd: string, args?: Record<string, unknown>) => {
        if (cmd === "config_get_api_key" && args?.key === "deepseek_api_key") {
          return "sk-test";
        }
        if (cmd === "memory_get_profile") return [];
        if (cmd === "memory_search") return [];
        return null;
      },
    );
    await initApiKey();
    resetColdCache();

    const messages = await assembleContext("test", []);
    expect(
      messages.some((m) => m.content?.includes("Relevant past conversations:")),
    ).toBe(false);
  });
});
