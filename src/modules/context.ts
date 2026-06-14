import { type Message, chat, getSystemPrompt } from "./llm";
import { getProfile, searchMessages } from "./memory";
import type { ProfileEntry } from "./memory";

let coldSummary: string | null = null;
let lastColdRefresh = -1;
let refreshLock = false;

const TOKEN_BUDGET = 1000;
const CHARS_PER_TOKEN = 4;

function estimateTokens(messages: Message[]): number {
  let total = 0;
  for (const m of messages) {
    total += Math.ceil(m.content.length / CHARS_PER_TOKEN);
  }
  return total;
}

function trimHistory(historyMessages: Message[], maxTokens: number): Message[] {
  if (historyMessages.length === 0) return [];
  const kept: Message[] = [];
  let tokenCount = 0;
  for (let i = historyMessages.length - 1; i >= 0; i--) {
    const msgTokens = Math.ceil(
      historyMessages[i].content.length / CHARS_PER_TOKEN,
    );
    if (tokenCount + msgTokens > maxTokens && kept.length > 0) break;
    tokenCount += msgTokens;
    kept.unshift(historyMessages[i]);
  }
  return kept;
}

const COLD_RECENCY_SECS = 30 * 24 * 60 * 60;

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

export async function assembleContext(
  userMessage: string,
  history: Message[],
): Promise<Message[]> {
  const messages: Message[] = [];

  messages.push({ role: "system", content: getSystemPrompt() });

  const profile = await getProfile().catch(() => [] as ProfileEntry[]);
  if (profile.length > 0) {
    const profileText = profile.map((p) => `${p.key}=${p.value}`).join(", ");
    messages.push({ role: "system", content: `User profile: ${profileText}` });
  }

  if (coldSummary) {
    messages.push({
      role: "system",
      content: `Relevant past conversations: ${coldSummary}`,
    });
  }

  const fixedTokens = estimateTokens(messages);
  const userTokenEstimate = Math.ceil(userMessage.length / CHARS_PER_TOKEN);
  const historyBudget = TOKEN_BUDGET - fixedTokens - userTokenEstimate - 50;

  const trimmedHistory = trimHistory(history, Math.max(historyBudget, 200));
  messages.push(...trimmedHistory);

  messages.push({ role: "user", content: userMessage });

  const total = estimateTokens(messages);
  console.log(
    `%cCTX %c→ %c${messages.length} msgs %c~${total} tokens`,
    "color: #d0a0ff; font-weight: bold",
    "color: #aaa",
    "color: #f0c040; font-weight: bold",
    "color: #aaa",
  );

  return messages;
}

export async function refreshColdMemory(
  userMessage: string,
  exchangeCount: number,
): Promise<void> {
  if (exchangeCount <= 0) return;
  if (exchangeCount - lastColdRefresh < 5) return;
  if (refreshLock) return;
  refreshLock = true;

  try {
    const keywords = await extractKeywords(userMessage);
    if (keywords.length === 0) return;

    const seen = new Set<string>();
    const relevant: string[] = [];

    for (const kw of keywords) {
      const since = Math.floor(Date.now() / 1000) - COLD_RECENCY_SECS;
      const results = await searchMessages(kw, 5, since).catch(() => []);
      for (const r of results) {
        const dedupe = `${r.role}:${r.content.slice(0, 50)}`;
        if (seen.has(dedupe)) continue;
        seen.add(dedupe);
        relevant.push(`${r.role}: ${r.content}`);
      }
    }

    if (relevant.length > 0) {
      const pastText = relevant.slice(0, 15).join("\n");
      const promptParts: Message[] = [
        {
          role: "system",
          content: coldSummary
            ? "Update this running summary of past conversations by incorporating the new ones below. Keep it to 2-4 sentences. Focus on facts about the user, preferences, and recurring topics."
            : "Summarize these past conversations in 2-3 sentences. Focus on facts the user shared about themselves, preferences they mentioned, and topics they care about.",
        },
      ];

      if (coldSummary) {
        promptParts.push({
          role: "user",
          content: `Current summary:\n${coldSummary}\n\nNew conversations:\n${pastText}`,
        });
      } else {
        promptParts.push({ role: "user", content: pastText });
      }

      const summary = await chat(promptParts).catch(() => null);

      if (summary) {
        coldSummary = summary.text;
        lastColdRefresh = exchangeCount;
        console.log(
          "%cCTX %ccold memory refreshed",
          "color: #d0a0ff; font-weight: bold",
          "color: #aaa",
        );
      }
    }
  } finally {
    refreshLock = false;
  }
}

export function resetColdCache(): void {
  coldSummary = null;
  lastColdRefresh = -1;
  refreshLock = false;
}
