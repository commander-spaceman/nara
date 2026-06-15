import { chat, getApiKey } from "./llm";
import type { Message } from "./llm";

export async function extractFacts(
  history: Message[],
): Promise<Array<{ key: string; value: string }>> {
  if (!getApiKey() || history.length < 4) return [];

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
