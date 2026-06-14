import { getOpenAIKey } from "./keyring";

let _apiKey: string | null = null;

async function apiKey(): Promise<string> {
  if (_apiKey !== null) return _apiKey;
  _apiKey = await getOpenAIKey();
  return _apiKey;
}

export const TTS_MODELS = [
  { id: "gpt-4o-mini-tts", label: "gpt-4o-mini-tts" },
  { id: "tts-1", label: "tts-1" },
  { id: "tts-1-hd", label: "tts-1-hd" },
];

export async function synthesize(
  text: string,
  model = "gpt-4o-mini-tts",
): Promise<ArrayBuffer> {
  const key = await apiKey();
  if (!key) {
    throw new Error("OpenAI API key not set");
  }

  console.log(
    `%cTTS %c→ %c${model}`,
    "color: #5fdb90; font-weight: bold",
    "color: #aaa",
    "color: #ccc",
  );

  const response = await fetch("https://api.openai.com/v1/audio/speech", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      model,
      voice: "nova",
      input: text,
      response_format: "wav",
    }),
  });

  if (!response.ok) {
    console.error(
      `%cTTS %c← %c${response.status}`,
      "color: #e04444; font-weight: bold",
      "color: #aaa",
      "color: #e04444",
    );
    throw new Error(`TTS error: ${response.status}`);
  }

  const buffer = await response.arrayBuffer();
  console.log(
    `%cTTS %c← %c${(buffer.byteLength / 1024).toFixed(0)}KB`,
    "color: #5fdb90; font-weight: bold",
    "color: #aaa",
    "color: #5fdb90",
  );
  return buffer;
}
