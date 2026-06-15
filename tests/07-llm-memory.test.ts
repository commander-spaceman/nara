import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const invokeMock = vi.hoisted(() => vi.fn());

vi.mock("@tauri-apps/api/core", () => ({
  invoke: invokeMock,
}));

import {
  getSystemPrompt,
  getApiKey,
  initApiKey,
  chat,
  extractFacts,
  suggestReply,
} from "../src/memory/llm";

describe("llm — Hot Memory", () => {
  it("system prompt defines Nara'Korrin identity", () => {
    const prompt = getSystemPrompt();
    expect(prompt).toContain("Nara'Korrin");
    expect(prompt).toContain("quarian");
    expect(prompt).toContain("Fleet");
    expect(prompt).toContain("1-3 sentences");
    expect(prompt).toContain("asterisks");
  });

  it("system prompt includes Spanish", () => {
    expect(getSystemPrompt()).toContain("Spanish");
  });
});

describe("llm — API key", () => {
  it("returns null before init", () => {
    expect(getApiKey()).toBeNull();
  });

  it("loads key from keystore via initApiKey", async () => {
    invokeMock.mockResolvedValueOnce("sk-test-deepseek");

    await initApiKey();

    expect(getApiKey()).toBe("sk-test-deepseek");
  });
});

describe("llm — Retry", () => {
  beforeEach(async () => {
    invokeMock.mockResolvedValue("sk-test");
    await initApiKey();
    vi.spyOn(global, "fetch");
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("retries twice then succeeds", async () => {
    vi.mocked(global.fetch)
      .mockRejectedValueOnce(new Error("network error"))
      .mockRejectedValueOnce(new Error("timeout"))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            choices: [{ message: { content: "Hello!" } }],
            usage: { total_tokens: 10, prompt_tokens: 5, completion_tokens: 5 },
          }),
          { status: 200 },
        ),
      );

    const result = await chat([
      { role: "system", content: "test" },
      { role: "user", content: "hi" },
    ]);

    expect(result.text).toBe("Hello!");
    expect(global.fetch).toHaveBeenCalledTimes(3);
  });

  it("throws after 3 failed attempts", async () => {
    vi.mocked(global.fetch)
      .mockRejectedValueOnce(new Error("fail 1"))
      .mockRejectedValueOnce(new Error("fail 2"))
      .mockRejectedValueOnce(new Error("fail 3"));

    await expect(chat([{ role: "user", content: "test" }])).rejects.toThrow();
    expect(global.fetch).toHaveBeenCalledTimes(3);
  });

  it("retries on HTTP error status", async () => {
    vi.mocked(global.fetch)
      .mockResolvedValueOnce(new Response(null, { status: 429 }))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            choices: [{ message: { content: "recovered" } }],
            usage: {},
          }),
          { status: 200 },
        ),
      );

    const result = await chat([{ role: "user", content: "hello" }]);

    expect(result.text).toBe("recovered");
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  it("retries on empty response", async () => {
    vi.mocked(global.fetch)
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            choices: [{ message: { content: "" } }],
            usage: {},
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            choices: [{ message: { content: "got it" } }],
            usage: {},
          }),
          { status: 200 },
        ),
      );

    const result = await chat([{ role: "user", content: "test" }]);

    expect(result.text).toBe("got it");
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });
});

describe("llm — extractFacts", () => {
  it("returns empty when history has fewer than 4 messages", async () => {
    const facts = await extractFacts([
      { role: "user", content: "hi" },
      { role: "assistant", content: "hello" },
    ]);
    expect(facts).toEqual([]);
  });

  it("returns empty when API key is not set", async () => {
    const facts = await extractFacts([
      { role: "user", content: "a" },
      { role: "assistant", content: "b" },
      { role: "user", content: "c" },
      { role: "assistant", content: "d" },
    ]);
    expect(facts).toEqual([]);
  });
});

describe("llm — suggestReply", () => {
  it("returns empty string when API key is null", async () => {
    const result = await suggestReply([]);
    expect(result).toBe("");
  });

  it("returns empty string on fetch error", async () => {
    invokeMock.mockResolvedValue("sk-test");
    await initApiKey();
    vi.spyOn(global, "fetch").mockRejectedValue(new Error("offline"));

    const result = await suggestReply([{ role: "user", content: "hello" }]);

    expect(result).toBe("");
    vi.restoreAllMocks();
  });
});
