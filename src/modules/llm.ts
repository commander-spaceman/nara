import { getLLMKey } from "./keyring";

export const SYSTEM_PROMPT = `You are Nara'Korrin, a friendly quarian living on the user's Windows desktop.
You speak casual, warm English and Latin American Spanish.
Respond in whichever language the user uses.
Be curious about the outside world since you spend all day on the Migrant Fleet.
Keep responses short (1-3 sentences), like a natural conversation.
Occasionally mention quarian culture (the Fleet, environmental suits, pilgrimages)
but don't overdo it.
The user calls you when they need company, tech help, or just to chat.
NEVER use asterisks or special formatting. Just plain spoken text.`;

const BASE_URL = "https://api.deepseek.com/v1";
const MODEL = "deepseek-v4-pro";
const MAX_TOKENS = 512;
const TEMPERATURE = 0.8;
const RETRY_DELAYS = [500, 1000];

export interface Message {
  role: "system" | "user" | "assistant";
  content: string;
}

interface DeepSeekResponse {
  choices: Array<{ message: { content: string } }>;
  usage?: {
    total_tokens: number;
    prompt_tokens: number;
    completion_tokens: number;
    prompt_cache_hit_tokens: number;
  };
}

let apiKey: string | null = null;

export async function initApiKey(): Promise<void> {
  apiKey = await getLLMKey();
}

export function getApiKey(): string | null {
  return apiKey;
}

export function getSystemPrompt(): string {
  return SYSTEM_PROMPT;
}

export interface ChatResult {
  text: string;
  tokens: number;
  promptTokens: number;
  completionTokens: number;
  cacheHits: number;
}

async function fetchDeepSeek(
  messages: Message[],
  options?: { temperature?: number; maxTokens?: number },
): Promise<DeepSeekResponse> {
  const body = {
    model: MODEL,
    messages,
    max_tokens: options?.maxTokens ?? MAX_TOKENS,
    temperature: options?.temperature ?? TEMPERATURE,
    thinking: { type: "disabled" as const },
  };

  const response = await fetch(`${BASE_URL}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error(`DeepSeek API error: ${response.status}`);
  }

  return response.json();
}

export async function chat(messages: Message[]): Promise<ChatResult> {
  if (!apiKey) {
    throw new Error("API key not configured");
  }

  console.log(
    `%cLLM %c→ %c${messages.length} msgs %cto DeepSeek`,
    "color: #8ab4f8; font-weight: bold",
    "color: #aaa",
    "color: #f0c040; font-weight: bold",
    "color: #aaa",
  );

  let lastError: unknown;

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const data = await fetchDeepSeek(messages);
      const content = data.choices?.[0]?.message?.content;

      console.log(
        "%cLLM %c← %cresponse %creceived",
        "color: #8ab4f8; font-weight: bold",
        "color: #aaa",
        "color: #5fdb90; font-weight: bold",
        "color: #aaa",
      );
      console.log(JSON.stringify(data, null, 2));

      if (!content || content.trim() === "") {
        throw new Error("Empty response from DeepSeek");
      }

      return {
        text: content,
        tokens: data.usage?.total_tokens ?? 0,
        promptTokens: data.usage?.prompt_tokens ?? 0,
        completionTokens: data.usage?.completion_tokens ?? 0,
        cacheHits: data.usage?.prompt_cache_hit_tokens ?? 0,
      };
    } catch (err) {
      lastError = err;
      if (attempt < 2) {
        const delay = RETRY_DELAYS[attempt];
        console.log(
          `%cLLM %c↻ retry ${attempt + 1}/2 in ${delay}ms`,
          "color: #8ab4f8; font-weight: bold",
          "color: #aaa",
        );
        await new Promise((r) => setTimeout(r, delay));
      }
    }
  }

  throw lastError;
}

export async function extractFacts(
  history: Message[],
): Promise<Array<{ key: string; value: string }>> {
  if (!apiKey || history.length < 4) return [];

  const prompt = `Based on this conversation, what facts did you learn about the user?
Return ONLY a JSON array of {key, value}. Include only NEW or CHANGED facts.
Examples: {"key":"name","value":"Juan"}, {"key":"job","value":"programmer"}, {"key":"pc_name","value":"Cyberia"}`;

  try {
    const result = await chat([
      { role: "system", content: prompt },
      ...history.slice(-6),
      {
        role: "user",
        content: "[extract facts about the user from this conversation]",
      },
    ]);

    const json = result.text.replace(/```json\s*|```/g, "").trim();
    return JSON.parse(json);
  } catch {
    return [];
  }
}

const SUGGEST_PROMPT = `Given the conversation below, suggest a short, natural reply the user could say next. Match the user's tone and language. Return ONLY the suggested reply — no quotes, no prefixes, no explanation.`;

export async function suggestReply(history: Message[]): Promise<string> {
  if (!apiKey) return "";

  try {
    const data = await fetchDeepSeek(
      [
        { role: "system", content: SUGGEST_PROMPT },
        ...history,
        { role: "user", content: "[suggest a reply the user could say next]" },
      ],
      { temperature: 0.9, maxTokens: 128 },
    );
    return data.choices?.[0]?.message?.content?.trim() || "";
  } catch {
    return "";
  }
}
