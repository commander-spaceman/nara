import { type Message, chat, getSystemPrompt } from "./llm";
import { getProfile, searchMessages } from "./memory";
import type { ProfileEntry } from "./memory";

async function extractKeywords(text: string): Promise<string[]> {
  try {
    const result = await chat([
      {
        role: "system",
        content:
          "Extract 3-5 meaningful keywords or key phrases from this user message that would help find relevant past conversations. Focus on topics, facts, names, technologies, or specific interests mentioned. Return ONLY a comma-separated list, no explanation.",
      },
      { role: "user", content: text },
    ]);
    return result.text
      .split(/[,;\n]+/)
      .map((k) => k.trim().toLowerCase())
      .filter((k) => k.length > 2)
      .slice(0, 5);
  } catch {
    return [];
  }
}

let coldSummary: string | null = null;
let lastColdRefresh = -1;

export async function assembleContext(
  userMessage: string,
  history: Message[],
): Promise<Message[]> {
  const messages: Message[] = [];

  // Hot Memory
  messages.push({ role: "system", content: getSystemPrompt() });

  // Deep Memory
  const profile = await getProfile().catch(() => [] as ProfileEntry[]);
  if (profile.length > 0) {
    const profileText = profile.map((p) => `${p.key}=${p.value}`).join(", ");
    messages.push({ role: "system", content: `User profile: ${profileText}` });
  }

  // Cold Memory — refresh every 5 exchanges
  const exchangeCount = Math.floor(history.length / 2);
  if (exchangeCount > 0 && exchangeCount - lastColdRefresh >= 5) {
    const keywords = await extractKeywords(userMessage);
    const seen = new Set<string>();
    const relevant: string[] = [];

    for (const kw of keywords) {
      const results = await searchMessages(kw, 5).catch(() => []);
      for (const r of results) {
        const dedupe = `${r.role}:${r.content.slice(0, 50)}`;
        if (seen.has(dedupe)) continue;
        seen.add(dedupe);
        relevant.push(`${r.role}: ${r.content}`);
      }
    }

    if (relevant.length > 0) {
      const pastText = relevant.slice(0, 15).join("\n");
      const summary = await chat([
        {
          role: "system",
          content:
            "Summarize these past conversations in 2-3 sentences. Focus on facts the user shared about themselves, preferences they mentioned, and topics they care about.",
        },
        { role: "user", content: pastText },
      ]).catch(() => null);

      if (summary) {
        coldSummary = summary.text;
        lastColdRefresh = exchangeCount;
      }
    }
  }

  if (coldSummary) {
    messages.push({
      role: "system",
      content: `Relevant past conversations: ${coldSummary}`,
    });
  }

  // Recent history
  messages.push(...history.slice(-10));

  // Current message
  messages.push({ role: "user", content: userMessage });

  console.log(
    `%cCTX %c→ %c${messages.length} msgs %cassembled`,
    "color: #d0a0ff; font-weight: bold",
    "color: #aaa",
    "color: #f0c040; font-weight: bold",
    "color: #aaa",
  );

  return messages;
}

export function resetColdCache(): void {
  coldSummary = null;
  lastColdRefresh = -1;
}
