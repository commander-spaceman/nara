import { chat, getApiKey } from "./llm";
import type { Message } from "./llm";

const BLOCKED_FACTS = new Set([
  "nara",
  "nara'korrin",
  "narakorrin",
  "quarian",
  "quarian ai",
  "ai assistant",
  "migrant fleet",
]);

function isBlockedFact(key: string, value: string): boolean {
  const lowerValue = value.toLowerCase().trim();
  if (BLOCKED_FACTS.has(lowerValue)) return true;
  if (key === "name" && lowerValue.startsWith("nara")) return true;
  return false;
}

export async function extractFacts(
  history: Message[],
): Promise<Array<{ key: string; value: string }>> {
  if (!getApiKey() || history.length < 4) return [];

  const prompt = `Based ONLY on what the USER said in this conversation, extract facts about the USER.
The user is the HUMAN you are talking to, NOT the AI assistant.
Ignore facts about the AI character (Nara'Korrin, the quarian assistant).
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
    const facts: Array<{ key: string; value: string }> = JSON.parse(json);
    return facts.filter((f) => !isBlockedFact(f.key, f.value));
  } catch {
    return [];
  }
}
