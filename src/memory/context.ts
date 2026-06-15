import { type Message, chat, getSystemPrompt } from "./llm";
import { getProfile, searchMessages } from "./db";
import type { ProfileEntry } from "./db";
import { LOG, log } from "./log";

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
  log(LOG.ctx, `→ ${messages.length} msgs assembled`, `~${total} tokens`);

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
    const since = Math.floor(Date.now() / 1000) - COLD_RECENCY_SECS;

    const allResults = await Promise.all(
      keywords.map((kw) => searchMessages(kw, 5, since).catch(() => [])),
    );

    for (const results of allResults) {
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
            ? "Merge this previous summary with the new conversations below into 2 short sentences max. Focus ONLY on facts about the user — name, preferences, job, tech stack, location, interests. Ignore the assistant's persona and conversational banter. Keep it tight."
            : "Summarize these past conversations in 2 short sentences max. Focus ONLY on facts about the user — name, preferences, job, tech stack, location, interests. Ignore chit-chat and roleplay. Keep it tight.",
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
        log(LOG.cold, "memory refreshed");
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
