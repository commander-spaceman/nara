import { invoke } from "@tauri-apps/api/core";

async function resolveKey(
  keyringName: string,
  envVar: string,
): Promise<string> {
  try {
    const stored = await invoke<string | null>("config_get_api_key", {
      key: keyringName,
    });
    if (stored) return stored;
  } catch {
    // keystore not available (browser / SSR), fall through
  }

  return (import.meta as any).env?.[envVar] || "";
}

let llmKey: string | null = null;
let openaiKey: string | null = null;

export async function getLLMKey(): Promise<string> {
  if (llmKey !== null) return llmKey;
  llmKey = await resolveKey("deepseek_api_key", "VITE_DEEPSEEK_API_KEY");
  return llmKey;
}

export async function getOpenAIKey(): Promise<string> {
  if (openaiKey !== null) return openaiKey;
  openaiKey = await resolveKey("openai_api_key", "VITE_OPENAI_API_KEY");
  return openaiKey;
}
