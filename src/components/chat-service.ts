import type { Message } from "../modules/llm";
import { chat, getApiKey } from "../modules/llm";
import { saveMessage, getSessionId } from "../modules/memory";
import { synthesize } from "../modules/tts";
import { SubtitleBox } from "./subtitle-box";
import { DebugPanel } from "./debug-panel";
import { Controls } from "./controls";
import { AudioPlayer } from "../audio/audio-player";

export class ChatService {
  private subtitleBox: SubtitleBox;
  private debugPanel: DebugPanel;
  private controls: Controls;
  private audioPlayer: AudioPlayer;
  private history: Message[];
  private totalInputTokens: number;
  private totalOutputTokens: number;
  private ttsModel: string;

  constructor(
    subtitleBox: SubtitleBox,
    debugPanel: DebugPanel,
    controls: Controls,
    audioPlayer: AudioPlayer,
    history: Message[],
    totalInputTokens: number,
    totalOutputTokens: number,
    ttsModel: string,
  ) {
    this.subtitleBox = subtitleBox;
    this.debugPanel = debugPanel;
    this.controls = controls;
    this.audioPlayer = audioPlayer;
    this.history = history;
    this.totalInputTokens = totalInputTokens;
    this.totalOutputTokens = totalOutputTokens;
    this.ttsModel = ttsModel;
  }

  async submit(text: string): Promise<void> {
    if (!getApiKey()) {
      this.subtitleBox.setText("api key not configured — check .env");
      return;
    }

    this.controls.setLoading(true);

    try {
      const start = performance.now();
      const result = await chat(text, this.history);
      const latency = Math.round(performance.now() - start);
      this.totalInputTokens += result.promptTokens;
      this.totalOutputTokens += result.completionTokens;

      this.history.push({ role: "user", content: text });
      this.history.push({ role: "assistant", content: result.text });

      const count = this.history.length / 2;
      saveMessage("user", text).catch(() => {});
      saveMessage("assistant", result.text).catch(() => {});

      this.debugPanel.update({
        sent: `${count}`,
        received: `${count}`,
        inputTokens: `${this.totalInputTokens}`,
        outputTokens: `${this.totalOutputTokens}`,
        cacheHits: `${result.cacheHits}`,
        latency: `${latency}ms`,
      });

      const ttsStart = performance.now();
      synthesize(result.text, this.ttsModel)
        .then(async (audio) => {
          const ttsTime = Math.round(performance.now() - ttsStart);
          this.debugPanel.update({ ttsLatency: `${ttsTime}ms` });
          await this.audioPlayer.play(audio, result.text);
        })
        .catch((err) => {
          this.controls.setLoading(false);
          console.error("TTS error:", err);
        });

      console.log(
        `%c[LLM memory]%c ${count} msgs`,
        "color: #d0a0ff; font-weight: bold",
        "color: #aaa",
      );
    } catch (err) {
      this.subtitleBox.setText("comms error — try again");
      this.controls.setLoading(false);
      console.error("LLM error:", err);
    }
  }

  loadSession(msgs: Message[]): void {
    this.history = msgs;
    const id = getSessionId().slice(0, 10);
    this.subtitleBox.setText(`[${msgs.length} msgs loaded from session ${id}]`);

    console.log(
      `%c[session]%c ${id} %cloaded %c${msgs.length} msgs`,
      "color: #f0c040; font-weight: bold",
      "color: #8ab4f8",
      "color: #aaa",
      "color: #5fdb90; font-weight: bold",
    );
    const recent = msgs.slice(-10);
    for (const m of recent) {
      const label = m.role === "user" ? "user: " : "assistant: ";
      const color = m.role === "user" ? "#f0c040" : "#8ab4f8";
      console.log(
        `  %c${label}%c${m.content.slice(0, 100)}`,
        `color: ${color}`,
        "color: #aaa",
      );
    }
    const c = `${msgs.length / 2}`;
    this.debugPanel.update({ sent: c, received: c });
  }
}
