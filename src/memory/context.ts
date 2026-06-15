import { type Message, getSystemPrompt } from "./llm";
import { getProfile } from "./db";
import type { ProfileEntry } from "./db";
import { LOG, log } from "./log";

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
