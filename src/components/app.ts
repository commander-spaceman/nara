import { DebugPanel } from "./debug-panel";
import { ModelArea } from "./model-area";
import { SubtitleBox } from "./subtitle-box";
import { Controls } from "./controls";
import { InputBar } from "./input-bar";
import { SessionModal } from "./session-modal";
import { chat, setApiKey, getApiKey } from "../modules/llm";
import type { Message } from "../modules/llm";
import {
  startSession,
  saveMessage,
  endSession,
  getSessionId,
} from "../modules/memory";
import { synthesize, TTS_MODELS } from "../modules/tts";
import { STT_MODELS } from "../modules/stt";

export type InputMode = "chat" | "mic";

export class App {
  private container: HTMLElement;
  private debugPanel!: DebugPanel;
  private modelArea!: ModelArea;
  private subtitleBox!: SubtitleBox;
  private controls!: Controls;
  private inputBar!: InputBar;
  private sessionModal!: SessionModal;
  private history: Message[] = [];
  private totalInputTokens = 0;
  private totalOutputTokens = 0;
  private sessionStart = Date.now();
  private ttsModel: string;
  private sttModel: string;

  constructor(container: HTMLElement) {
    this.container = container;
    this.ttsModel = localStorage.getItem("nara_tts_model") || "gpt-4o-mini-tts";
    this.sttModel =
      localStorage.getItem("nara_stt_model") || "gpt-4o-mini-transcribe";
  }

  mount(): void {
    const apiKey = import.meta.env.VITE_DEEPSEEK_API_KEY;
    if (apiKey) setApiKey(apiKey);

    this.container.innerHTML = `
      <div id="debug-panel"></div>
      <div id="model-area" data-tauri-drag-region></div>
      <div id="bottom-section">
        <div id="subtitle-box"></div>
        <div id="controls"></div>
        <div id="input-bar"></div>
      </div>
      <div id="modal-overlay" class="hidden">
        <div id="modal-box">
          <div id="modal-close">&times;</div>
          <div id="modal-content"></div>
        </div>
      </div>
    `;

    this.debugPanel = new DebugPanel(
      this.el("debug-panel"),
      {
        onTtsModelChange: (model) => {
          this.ttsModel = model;
          localStorage.setItem("nara_tts_model", model);
        },
        onSttModelChange: (model) => {
          this.sttModel = model;
          localStorage.setItem("nara_stt_model", model);
        },
      },
      TTS_MODELS,
      STT_MODELS,
      this.ttsModel,
      this.sttModel,
    );
    this.debugPanel.mount();
    this.debugPanel.update({
      sent: "0",
      received: "0",
      uptime: this.formatUptime(),
      sessionId: "-",
      startedAt: new Date().toTimeString().slice(0, 8),
    });

    this.modelArea = new ModelArea(this.el("model-area"));
    this.modelArea.mount();

    this.subtitleBox = new SubtitleBox(this.el("subtitle-box"));
    this.subtitleBox.mount();
    if (!apiKey) {
      this.subtitleBox.setText("VITE_DEEPSEEK_API_KEY not set in .env");
    }

    this.sessionModal = new SessionModal(this.el("modal-overlay"), {
      onSessionLoad: (msgs) => this.onSessionLoaded(msgs),
    });
    this.sessionModal.mount();

    this.inputBar = new InputBar(this.el("input-bar"), {
      onSubmit: (text: string) => this.handleSubmit(text),
    });

    this.controls = new Controls(this.el("controls"), {
      onModeChange: (mode: InputMode) => {
        this.inputBar.setMode(mode);
      },
    });
    this.controls.mount();
    this.inputBar.mount();

    startSession()
      .then(() => {
        this.debugPanel.update({ sessionId: getSessionId().slice(0, 10) });
      })
      .catch(() => {});

    setInterval(() => {
      this.debugPanel.update({ uptime: this.formatUptime() });
    }, 1000);

    window.addEventListener("beforeunload", () => {
      endSession().catch(() => {});
    });
  }

  private async handleSubmit(text: string): Promise<void> {
    if (text === "/history" || text === "/sessions") {
      this.sessionModal.show();
      return;
    }
    if (text.startsWith("/history ") || text.startsWith("/sessions ")) {
      this.subtitleBox.setText("use /history to browse sessions");
      return;
    }

    if (!getApiKey()) {
      this.subtitleBox.setText("api key not configured — check .env");
      return;
    }

    this.subtitleBox.setLoading();

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
        uptime: this.formatUptime(),
        inputTokens: `${this.totalInputTokens}`,
        outputTokens: `${this.totalOutputTokens}`,
        cacheHits: `${result.cacheHits}`,
        latency: `${latency}ms`,
      });

      const ttsStart = performance.now();
      synthesize(result.text, this.ttsModel)
        .then((audio) => {
          const ttsTime = Math.round(performance.now() - ttsStart);
          this.debugPanel.update({ ttsLatency: `${ttsTime}ms` });
          this.playAudio(audio, result.text);
        })
        .catch((err) => console.error("TTS error:", err));

      console.log(
        `%c[LLM memory]%c ${count} msgs`,
        "color: #d0a0ff; font-weight: bold",
        "color: #aaa",
      );
    } catch (err) {
      this.subtitleBox.setText("comms error — try again");
      console.error("LLM error:", err);
    }
  }

  private onSessionLoaded(msgs: Message[]): void {
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
    this.debugPanel.update({
      sent: c,
      received: c,
      uptime: this.formatUptime(),
    });
  }

  private playAudio(arrayBuffer: ArrayBuffer, text: string): void {
    const ctx = new AudioContext();
    ctx.resume();
    console.log("[TTS] received", arrayBuffer.byteLength, "bytes");
    ctx.decodeAudioData(
      arrayBuffer.slice(0),
      (buffer) => {
        console.log("[TTS] playing", buffer.duration.toFixed(1), "s");
        this.subtitleBox.setText(text);
        const img = this.el("model-area").querySelector(
          ".placeholder-model",
        ) as HTMLElement;
        if (img) {
          img.style.setProperty("--talk-duration", `${buffer.duration / 32}s`);
          img.classList.add("talking");
        }
        this.debugPanel.update({
          audioDuration: `${buffer.duration.toFixed(1)}s`,
          audioSize: `${(arrayBuffer.byteLength / 1024).toFixed(0)}KB`,
        });
        const source = ctx.createBufferSource();
        source.buffer = buffer;
        source.connect(ctx.destination);
        source.start();
        source.onended = () => {
          if (img) img.classList.remove("talking");
          this.subtitleBox.clear();
          ctx.close();
        };
      },
      (err) => console.error("[TTS] decode error:", err),
    );
  }

  private formatUptime(): string {
    const s = Math.floor((Date.now() - this.sessionStart) / 1000);
    if (s < 60) return `${s}s`;
    const m = Math.floor(s / 60);
    if (m < 60) return `${m}m ${s % 60}s`;
    const h = Math.floor(m / 60);
    return `${h}h ${m % 60}m`;
  }

  private el(id: string): HTMLElement {
    return this.container.querySelector(`#${id}`) as HTMLElement;
  }
}
