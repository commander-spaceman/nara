const API_KEY = import.meta.env.VITE_OPENAI_API_KEY || "";

export const STT_MODELS = [
  { id: "gpt-4o-mini-transcribe", label: "gpt-4o-mini-transcribe" },
  { id: "gpt-4o-transcribe", label: "gpt-4o-transcribe" },
  { id: "whisper-1", label: "whisper-1" },
];

export async function transcribe(
  audioBlob: Blob,
  model = "gpt-4o-mini-transcribe",
): Promise<string> {
  if (!API_KEY) {
    throw new Error("VITE_OPENAI_API_KEY not set");
  }

  const formData = new FormData();
  formData.append("file", audioBlob, "audio.webm");
  formData.append("model", model);

  console.log(
    `%cSTT %c→ %c${(audioBlob.size / 1024).toFixed(0)}KB %c${model}`,
    "color: #f0c040; font-weight: bold",
    "color: #aaa",
    "color: #f0c040",
    "color: #aaa",
  );

  const response = await fetch(
    "https://api.openai.com/v1/audio/transcriptions",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${API_KEY}`,
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
}
