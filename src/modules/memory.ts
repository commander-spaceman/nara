import { invoke } from "@tauri-apps/api/core";

export interface ProfileEntry {
  key: string;
  value: string;
}

export interface MemoryMessage {
  session_id: string;
  role: string;
  content: string;
  created_at: number;
}

let sessionId: string | null = null;

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

export function getSessionId(): string {
  if (!sessionId) {
    sessionId = generateId();
  }
  return sessionId;
}

export async function startSession(): Promise<void> {
  sessionId = generateId();
  await invoke("memory_start_session", { sessionId });
  console.log(
    `%c[session]%c ${sessionId}`,
    "color: #f0c040; font-weight: bold",
    "color: #8ab4f8",
  );
}

export async function endSession(): Promise<void> {
  if (!sessionId) return;
  await invoke("memory_end_session");
  console.log(
    `%c[session]%c ${sessionId} %cended`,
    "color: #f0c040; font-weight: bold",
    "color: #8ab4f8",
    "color: #e04444",
  );
}

export async function saveMessage(
  role: "user" | "assistant",
  content: string,
): Promise<void> {
  await invoke("memory_save_message", {
    sessionId: getSessionId(),
    role,
    content,
  });
}

export async function searchMessages(
  query: string,
  limit = 20,
  since?: number,
): Promise<MemoryMessage[]> {
  return invoke("memory_search", { query, limit, since });
}

export interface SessionInfo {
  id: string;
  started_at: number;
  ended_at: number | null;
  msg_count: number;
}

export interface SessionMessage {
  role: string;
  content: string;
  created_at: number;
}

export async function listSessions(limit = 5): Promise<SessionInfo[]> {
  return invoke("memory_list_sessions", { limit });
}

export async function loadSession(
  sessionId: string,
): Promise<SessionMessage[]> {
  return invoke("memory_load_session", { sessionId });
}

export async function getProfile(): Promise<ProfileEntry[]> {
  return invoke("memory_get_profile");
}

export async function upsertProfile(key: string, value: string): Promise<void> {
  await invoke("memory_upsert_profile", { key, value });
}
