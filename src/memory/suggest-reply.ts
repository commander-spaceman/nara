import { fetchLLM, getApiKey } from "./llm";
import type { Message } from "./llm";

const SUGGEST_PROMPT = `Given the conversation below, suggest a short, natural reply the user could say next. Match the user's tone and language. Return ONLY the suggested reply — no quotes, no prefixes, no explanation.`;

export async function suggestReply(history: Message[]): Promise<string> {
  if (!getApiKey()) return "";

  try {
    const data = await fetchLLM(
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
