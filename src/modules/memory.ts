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
): Promise<MemoryMessage[]> {
  return invoke("memory_search", { query, limit });
}

export async function getProfile(): Promise<ProfileEntry[]> {
  return invoke("memory_get_profile");
}

export async function upsertProfile(key: string, value: string): Promise<void> {
  await invoke("memory_upsert_profile", { key, value });
}
