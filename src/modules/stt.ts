import { getOpenAIKey } from "./keyring";

let _apiKey: string | null = null;

async function apiKey(): Promise<string> {
  if (_apiKey !== null) return _apiKey;
  _apiKey = await getOpenAIKey();
  return _apiKey;
}

export const STT_MODELS = [
  { id: "whisper-1", label: "whisper-1" },
  { id: "gpt-4o-mini-transcribe", label: "gpt-4o-mini-transcribe" },
  { id: "gpt-4o-transcribe", label: "gpt-4o-transcribe" },
];

async function request(audioBlob: Blob, model: string): Promise<string> {
  const key = await apiKey();
  if (!key) {
    throw new Error("OpenAI API key not set");
  }

  const formData = new FormData();
  formData.append("file", audioBlob, "audio.webm");
  formData.append("model", model);

  console.log(
    `%cSTT %c→ %c${model} %c${(audioBlob.size / 1024).toFixed(0)}KB`,
    "color: #f0c040; font-weight: bold",
    "color: #aaa",
    "color: #f0c040",
    "color: #aaa",
  );

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);

  try {
    const response = await fetch(
      "https://api.openai.com/v1/audio/transcriptions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${key}`,
        },
        body: formData,
      },
    );

    if (!response.ok) {
      console.error(
        `%cSTT %c← %c${response.status}`,
        "color: #e04444; font-weight: bold",
        "color: #aaa",
        "color: #e04444",
      );
      throw new Error(`STT error: ${response.status}`);
    }

    const data = await response.json();
    const text = data.text || "";

    console.log(
      `%cSTT %c← %c${text.slice(0, 80)}`,
      "color: #f0c040; font-weight: bold",
      "color: #aaa",
      "color: #ccc",
    );

    return text;
  } finally {
    clearTimeout(timeout);
  }
}

export async function transcribe(
  audioBlob: Blob,
  model = "whisper-1",
): Promise<string> {
  let lastError: unknown;

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await request(audioBlob, model);
    } catch (err) {
      lastError = err;
      if (attempt < 2) {
        const delay = [1000, 2000][attempt];
        console.log(
          `%cSTT %c↻ retry ${attempt + 1}/2 in ${delay}ms`,
          "color: #f0c040; font-weight: bold",
          "color: #aaa",
        );
        await new Promise((r) => setTimeout(r, delay));
      }
    }
  }

  throw lastError;
}
