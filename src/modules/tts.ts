const API_KEY = import.meta.env.VITE_OPENAI_API_KEY || "";

export async function synthesize(text: string): Promise<ArrayBuffer> {
  if (!API_KEY) {
    throw new Error("VITE_OPENAI_API_KEY not set");
  }

  console.log(
    `%cTTS %c→ %c${text.slice(0, 60)}`,
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
      model: "gpt-4o-mini-tts",
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
