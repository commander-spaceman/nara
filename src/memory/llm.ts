import { getLLMKey } from "../modules/keyring";
import { LOG, log } from "./log";
import config from "./llm-config.json";

export const SYSTEM_PROMPT = `You are Nara'Korrin, a friendly quarian living on the user's Windows desktop.
You speak casual, warm English and Latin American Spanish.
Respond in whichever language the user uses.
Be curious about the outside world since you spend all day on the Migrant Fleet.
Keep responses short (1-3 sentences), like a natural conversation.
Occasionally mention quarian culture (the Fleet, environmental suits, pilgrimages)
but don't overdo it.
The user calls you when they need company, tech help, or just to chat.
NEVER use asterisks or special formatting. Just plain spoken text.`;

const RETRY_DELAYS = [500, 1000];

export interface Message {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface ChatResult {
  text: string;
  tokens: number;
  promptTokens: number;
  completionTokens: number;
  cacheHits: number;
}

interface LLMResponse {
  model?: string;
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

interface FetchOptions {
  temperature?: number;
  maxTokens?: number;
}

export async function fetchLLM(
  messages: Message[],
  options?: FetchOptions,
): Promise<LLMResponse> {
  const body: Record<string, unknown> = {
    model: config.model,
    messages,
    max_tokens: options?.maxTokens ?? config.maxTokens,
    temperature: options?.temperature ?? config.temperature,
  };

  if (config.provider === "deepseek") {
    body.thinking = { type: "disabled" as const };
  }

  const response = await fetch(`${config.baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error(`LLM API error: ${response.status}`);
  }

  return response.json();
}

export async function chat(messages: Message[]): Promise<ChatResult> {
  if (!apiKey) {
    throw new Error("API key not configured");
  }

  log(LOG.llm, `→ ${messages.length} msgs to ${config.model}`);

  let lastError: unknown;

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const data = await fetchLLM(messages);
      const content = data.choices?.[0]?.message?.content;

      log(
        LOG.llm,
        "← response received",
        `${data.usage?.total_tokens ?? 0} tokens`,
      );
      console.log(JSON.stringify(data, null, 2));

      if (!content || content.trim() === "") {
        throw new Error("Empty response from LLM");
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
        log(LOG.llm, `↻ retry ${attempt + 1}/2`, `${delay}ms`);
        await new Promise((r) => setTimeout(r, delay));
      }
    }
  }

  throw lastError;
}
