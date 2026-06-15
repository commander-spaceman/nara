import { listSessions, loadSession } from "./db";
import type { Message } from "./llm";

export interface RecallResult {
  messages: Message[];
  sessionId: string;
  summary: string;
}

export async function recallPrevious(): Promise<RecallResult | null> {
  const sessions = await listSessions(5);
  if (sessions.length === 0) return null;

  const msgs = await loadSession(sessions[0].id);
  if (msgs.length === 0) return null;

  const text = msgs.map((m) => `${m.role}: ${m.content}`).join("\n");

  return {
    messages: [
      {
        role: "user",
        content: `[Recall: previous session from ${new Date(sessions[0].started_at * 1000).toLocaleString()}]`,
      },
      {
        role: "assistant",
        content: `Here's what we talked about last time:\n\n${text}`,
      },
    ],
    sessionId: sessions[0].id,
    summary: `${msgs.length} msgs from ${new Date(sessions[0].started_at * 1000).toLocaleString()}`,
  };
}
