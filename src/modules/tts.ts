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
  if (!key) throw new Error("OpenAI API key not set");

  const pcm = await streamPcm(text, model, key);
  if (pcm) return pcm;

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

async function streamPcm(
  text: string,
  model: string,
  key: string,
): Promise<ArrayBuffer | null> {
  console.log(
    `%cTTS %c→ %csse+pcm %c${model}`,
    "color: #5fdb90; font-weight: bold",
    "color: #aaa",
    "color: #d0a0ff",
    "color: #ccc",
  );

  try {
    const t0 = performance.now();
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
        response_format: "pcm",
        stream_format: "sse",
      }),
    });

    if (!response.ok || !response.body) {
      if (!response.ok) {
        console.error(
          `%cTTS %c← sse status %c${response.status}`,
          "color: #e04444; font-weight: bold",
          "color: #aaa",
          "color: #e04444",
        );
      }
      return null;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    const chunks: Uint8Array[] = [];
    let buffer = "";
    let totalBytes = 0;
    let firstLineLogged = false;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        if (!firstLineLogged) {
          console.log(
            `%cTTS %c← sse first line: %c${line.slice(0, 120)}`,
            "color: #5fdb90; font-weight: bold",
            "color: #aaa",
            "color: #aaa",
          );
          firstLineLogged = true;
        }
        const payload = line.slice(6).trim();
        if (!payload || payload === "[DONE]") continue;

        try {
          const event = JSON.parse(payload);
          if (event.type !== "speech.audio.delta" || !event.audio) continue;
          const binary = atob(event.audio);
          const bytes = new Uint8Array(binary.length);
          for (let i = 0; i < binary.length; i++) {
            bytes[i] = binary.charCodeAt(i);
          }
          chunks.push(bytes);
          totalBytes += bytes.length;
        } catch {
          continue;
        }
      }
    }

    if (chunks.length === 0) return null;

    const pcm = new Uint8Array(totalBytes);
    let offset = 0;
    for (const chunk of chunks) {
      pcm.set(chunk, offset);
      offset += chunk.length;
    }

    const ms = Math.round(performance.now() - t0);
    console.log(
      `%cTTS %c← sse+pcm %c${(pcm.byteLength / 1024).toFixed(0)}KB %c${chunks.length} chunks %c${ms}ms`,
      "color: #5fdb90; font-weight: bold",
      "color: #aaa",
      "color: #5fdb90",
      "color: #aaa",
      "color: #5fdb90",
    );
    return pcm.buffer as ArrayBuffer;
  } catch (err) {
    console.error(
      `%cTTS %c← sse failed, trying wav`,
      "color: #e04444; font-weight: bold",
      "color: #aaa",
      err,
    );
    return null;
  }
}
