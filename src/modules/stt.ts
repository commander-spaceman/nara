const API_KEY = import.meta.env.VITE_OPENAI_API_KEY || "";

export async function transcribe(audioBlob: Blob): Promise<string> {
  if (!API_KEY) {
    throw new Error("VITE_OPENAI_API_KEY not set");
  }

  const formData = new FormData();
  formData.append("file", audioBlob, "audio.webm");
  formData.append("model", "gpt-4o-mini-transcribe");

  console.log(
    `%cSTT %c→ %c${(audioBlob.size / 1024).toFixed(0)}KB audio`,
    "color: #f0c040; font-weight: bold",
    "color: #aaa",
    "color: #f0c040",
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
