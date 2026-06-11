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
const MAX_TOKENS = 256;
const TEMPERATURE = 0.8;

export interface Message {
  role: "system" | "user" | "assistant";
  content: string;
}

interface DeepSeekResponse {
  choices: Array<{ message: { content: string } }>;
}

let apiKey: string | null = null;

export function setApiKey(key: string): void {
  apiKey = key;
}

export function getApiKey(): string | null {
  return apiKey;
}

export function getSystemPrompt(): string {
  return SYSTEM_PROMPT;
}

export async function chat(
  userMessage: string,
  history: Message[] = [],
): Promise<string> {
  if (!apiKey) {
    throw new Error("API key not configured");
  }

  const messages: Message[] = [
    { role: "system", content: SYSTEM_PROMPT },
    ...history,
    { role: "user", content: userMessage },
  ];

  const response = await fetch(`${BASE_URL}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: MODEL,
      messages,
      max_tokens: MAX_TOKENS,
      temperature: TEMPERATURE,
      thinking: { type: "disabled" },
    }),
  });

  if (!response.ok) {
    throw new Error(`DeepSeek API error: ${response.status}`);
  }

  const data: DeepSeekResponse = await response.json();
  const content = data.choices?.[0]?.message?.content;

  if (!content || content.trim() === "") {
    throw new Error("Empty response from DeepSeek");
  }

  return content;
}
