import { getLLMKey } from "./keyring";

const SYSTEM_PROMPT = `You are Nara'Korrin, a friendly quarian living on the user's Windows desktop.
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

export async function chat(
  userMessage: string,
  history: Message[] = [],
): Promise<ChatResult> {
  if (!apiKey) {
    throw new Error("API key not configured");
  }

  const messages: Message[] = [
    { role: "system", content: SYSTEM_PROMPT },
    ...history,
    { role: "user", content: userMessage },
  ];

  const requestBody = {
    model: MODEL,
    messages,
    max_tokens: MAX_TOKENS,
    temperature: TEMPERATURE,
    thinking: { type: "disabled" },
  };

  console.log(
    `%cLLM %c→ %c${messages.length} msgs %cto DeepSeek`,
    "color: #8ab4f8; font-weight: bold",
    "color: #aaa",
    "color: #f0c040; font-weight: bold",
    "color: #aaa",
  );
  console.log(JSON.stringify(requestBody, null, 2));

  const response = await fetch(`${BASE_URL}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    throw new Error(`DeepSeek API error: ${response.status}`);
  }

  const data: DeepSeekResponse = await response.json();
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
}

const SUGGEST_PROMPT = `Given the conversation below, suggest a short, natural reply the user could say next. Match the user's tone and language. Return ONLY the suggested reply — no quotes, no prefixes, no explanation.`;

export async function suggestReply(history: Message[]): Promise<string> {
  if (!apiKey) return "";

  const messages: Message[] = [
    { role: "system", content: SUGGEST_PROMPT },
    ...history,
    { role: "user", content: "[suggest a reply the user could say next]" },
  ];

  try {
    const response = await fetch(`${BASE_URL}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: MODEL,
        messages,
        max_tokens: 128,
        temperature: 0.9,
        thinking: { type: "disabled" },
      }),
    });

    if (!response.ok) return "";

    const data: DeepSeekResponse = await response.json();
    return data.choices?.[0]?.message?.content?.trim() || "";
  } catch {
    return "";
  }
}
