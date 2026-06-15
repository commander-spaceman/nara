import type { Message } from "../memory/llm";
import { chat, getApiKey } from "../memory/llm";
import { suggestReply } from "../memory/suggest-reply";
import { extractFacts } from "../memory/extract-facts";
import { saveMessage, getSessionId, upsertProfile } from "../memory/db";
import { assembleContext } from "../memory/context";
import { synthesize } from "../modules/tts";
import { LOG, log } from "../memory/log";
import { detectHint } from "../3d/animation-state";
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
  private lastFactExtraction = 0;

  private static readonly PROFILE_WHITELIST = new Set([
    "name",
    "language",
    "pc_name",
    "tone",
    "job",
    "location",
    "interests",
    "hobbies",
    "preferred_style",
    "favorite_topics",
    "timezone",
  ]);

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
      const context = await assembleContext(text, this.history);
      const result = await chat(context);
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

      this.maybeExtractFacts(count);

      const ttsStart = performance.now();

      if (import.meta.env.DEV) {
        suggestReply(this.history).then((suggestion) => {
          if (!suggestion) return;
          const clean = suggestion.replace(/\n/g, " ");
          console.log(
            `%cReply:%c ${clean}`,
            "color: #d0a0ff; font-weight: bold",
            "color: #f0c040; font-style: italic",
          );
        });
      }

      synthesize(result.text, this.ttsModel)
        .then(async (audio) => {
          const ttsTime = Math.round(performance.now() - ttsStart);
          this.debugPanel.update({ ttsLatency: `${ttsTime}ms` });
          const hint = detectHint(text);
          await this.audioPlayer.play(audio, result.text, hint);
        })
        .catch((err) => {
          this.controls.setLoading(false);
          console.error("TTS error:", err);
        });

      log(LOG.ctx, `${count} msgs in session`);
    } catch (err) {
      this.subtitleBox.setText("comms error — try again");
      this.controls.setLoading(false);
      console.error("LLM error:", err);
    }
  }

  loadSession(msgs: Message[]): void {
    this.history = msgs;
    const id = getSessionId().slice(0, 10);
    this.subtitleBox.setHtml(
      `[${msgs.length} msgs loaded from session <span class="session-id-hl">${id}</span>]`,
      4000,
    );

    log(LOG.db, `loaded`, `${id} (${msgs.length} msgs)`);
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

  resetSession(): void {
    this.history.length = 0;
    this.totalInputTokens = 0;
    this.totalOutputTokens = 0;
    this.lastFactExtraction = 0;
    this.debugPanel.update({
      sent: "0",
      received: "0",
      inputTokens: "0",
      outputTokens: "0",
      cacheHits: "0",
      latency: "-",
      ttsLatency: "-",
    });
  }

  private maybeExtractFacts(exchangeCount: number): void {
    if (exchangeCount - this.lastFactExtraction < 5) return;
    this.lastFactExtraction = exchangeCount;
    extractFacts(this.history)
      .then((facts) => {
        for (const { key, value } of facts) {
          if (!ChatService.PROFILE_WHITELIST.has(key)) continue;
          upsertProfile(key, value).catch(() => {});
        }
      })
      .catch(() => {});
  }
}
