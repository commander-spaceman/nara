const API_KEY = import.meta.env.VITE_OPENAI_API_KEY || "";

export const TTS_MODELS = [
  { id: "gpt-4o-mini-tts", label: "gpt-4o-mini-tts" },
  { id: "tts-1", label: "tts-1" },
  { id: "tts-1-hd", label: "tts-1-hd" },
];

export async function synthesize(
  text: string,
  model = "gpt-4o-mini-tts",
): Promise<ArrayBuffer> {
  if (!API_KEY) {
    throw new Error("VITE_OPENAI_API_KEY not set");
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
      Authorization: `Bearer ${API_KEY}`,
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
