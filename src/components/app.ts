import { DebugPanel } from "./debug-panel";
import { ModelArea, type ModelDebugSnapshot } from "./model-area";
import { SubtitleBox } from "./subtitle-box";
import { Controls } from "./controls";
import { InputBar } from "./input-bar";
import { SessionModal } from "./session-modal";
import { AudioPlayer } from "../audio/audio-player";
import { ChatService } from "./chat-service";
import { AudioCapture } from "../modules/audio-capture";
import { transcribe } from "../modules/stt";
import { setApiKey } from "../modules/llm";
import type { Message } from "../modules/llm";
import { startSession, endSession, getSessionId } from "../modules/memory";
import { TTS_MODELS } from "../modules/tts";
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
  private audioPlayer!: AudioPlayer;
  private chatService!: ChatService;
  private audioCapture!: AudioCapture;
  private history: Message[] = [];
  private totalInputTokens = 0;
  private totalOutputTokens = 0;
  private sessionStart = Date.now();
  private ttsModel: string;
  private sttModel: string;
  private shouldRestartMic = false;

  constructor(container: HTMLElement) {
    this.container = container;
    this.ttsModel = localStorage.getItem("nara_tts_model") || "gpt-4o-mini-tts";
    this.sttModel = localStorage.getItem("nara_stt_model") || "whisper-1";
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
      <div id="modal-overlay" class="modal-overlay hidden">
        <div id="modal-box" class="modal-box">
          <div id="modal-close" class="modal-close">&times;</div>
          <div id="modal-content" class="modal-content"></div>
        </div>
      </div>
      <div id="helmet-fx-overlay" class="modal-overlay hidden"></div>
    `;

    this.debugPanel = new DebugPanel(
      this.el("debug-panel"),
      this.el("helmet-fx-overlay"),
      {
        onTtsModelChange: (model) => {
          this.ttsModel = model;
          localStorage.setItem("nara_tts_model", model);
        },
        onSttModelChange: (model) => {
          this.sttModel = model;
          localStorage.setItem("nara_stt_model", model);
        },
        onVocoderChange: (params) => {
          this.audioPlayer.setFXParams(params);
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

    this.modelArea = new ModelArea(this.el("model-area"), (snapshot) => {
      this.debugPanel.update(this.formatModelDebug(snapshot));
    });
    this.modelArea.mount();

    this.subtitleBox = new SubtitleBox(this.el("subtitle-box"));
    this.subtitleBox.mount();
    if (!apiKey) {
      this.subtitleBox.setText("VITE_DEEPSEEK_API_KEY not set in .env");
    }

    this.controls = new Controls(this.el("controls"), {
      onModeChange: (mode) => {
        this.inputBar.setMode(mode);
      },
      onMicStart: () => this.startRecording(),
      onMicStop: () => this.stopRecording(),
      onMicCancel: () => this.cancelAndRestart(),
    });
    this.controls.mount();

    this.audioPlayer = new AudioPlayer(
      this.el("model-area"),
      this.subtitleBox,
      this.debugPanel,
      this.controls,
      () => this.inputBar.setMode(null),
    );

    this.chatService = new ChatService(
      this.subtitleBox,
      this.debugPanel,
      this.controls,
      this.audioPlayer,
      this.history,
      this.totalInputTokens,
      this.totalOutputTokens,
      this.ttsModel,
    );

    this.audioCapture = new AudioCapture({
      onStateChange: (state) => {
        if (state === "recording") {
          this.controls.setRecording(true);
          this.inputBar.setRecordingState(true);
        } else if (state === "stopped") {
          this.processRecording();
        } else if (state === "idle") {
          this.controls.setRecording(false);
          this.inputBar.setRecordingState(false);
          if (this.shouldRestartMic) {
            this.shouldRestartMic = false;
            this.startRecording();
          }
        }
      },
      onElapsed: (ms) => {
        this.inputBar.setElapsed(ms);
      },
      onError: (message) => {
        this.subtitleBox.setText(message);
      },
    });

    this.sessionModal = new SessionModal(this.el("modal-overlay"), {
      onSessionLoad: (msgs) => this.chatService.loadSession(msgs),
    });
    this.sessionModal.mount();

    this.inputBar = new InputBar(this.el("input-bar"), {
      onSubmit: (text) => this.handleSubmit(text),
    });
    this.inputBar.mount();

    startSession()
      .then(() => {
        this.debugPanel.update({ sessionId: getSessionId().slice(0, 10) });
      })
      .catch(() => {});

    setInterval(() => {
      this.debugPanel.update({ uptime: this.formatUptime() });
    }, 1000);

    document.addEventListener("keydown", (e) => {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      if ((e.key === "e" || e.key === "Escape") && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        this.controls.toggleInput();
      }
    });

    window.addEventListener("beforeunload", () => {
      endSession().catch(() => {});
    });
  }

  private startRecording(): void {
    this.audioPlayer.stop();
    this.inputBar.setMode("mic");
    this.audioCapture.start();
  }

  private cancelAndRestart(): void {
    this.shouldRestartMic = true;
    this.audioCapture.cancel();
  }

  private stopRecording(): void {
    this.controls.setRecording(false);
    this.inputBar.setRecordingState(false);
    this.audioCapture.stop();
  }

  private async processRecording(): Promise<void> {
    const blob = this.audioCapture.getBlob();
    if (!blob) return;

    this.controls.setLoading(true);
    this.inputBar.showProcessing();

    try {
      const text = await transcribe(blob, this.sttModel);
      if (!text.trim()) {
        this.subtitleBox.setText("Didn't catch that, try again");
        this.controls.setLoading(false);
        return;
      }
      this.inputBar.showTranscription(text);
      this.chatService.submit(text);
    } catch (err) {
      console.error("STT error:", err);
      this.subtitleBox.setText("Didn't catch that, try again");
      this.controls.setLoading(false);
    }
  }

  private handleSubmit(text: string): void {
    if (text === "/history" || text === "/sessions") {
      this.sessionModal.show();
      return;
    }
    if (text.startsWith("/history ") || text.startsWith("/sessions ")) {
      this.subtitleBox.setText("use /history to browse sessions");
      return;
    }
    this.chatService.submit(text);
  }

  private formatUptime(): string {
    const s = Math.floor((Date.now() - this.sessionStart) / 1000);
    if (s < 60) return `${s}s`;
    const m = Math.floor(s / 60);
    if (m < 60) return `${m}m ${s % 60}s`;
    const h = Math.floor(m / 60);
    return `${h}h ${m % 60}m`;
  }

  private formatModelDebug(
    snapshot: ModelDebugSnapshot,
  ): Partial<Record<string, string>> {
    return {
      fps: snapshot.fps != null ? `${snapshot.fps}` : "-",
      activeAnimation: snapshot.activeAnimation,
      boundsMode: snapshot.boundsMode,
      modelPosition: this.formatTriple(snapshot.position),
      modelRotation: this.formatTriple(snapshot.rotation),
      modelScale: snapshot.scale != null ? snapshot.scale[0].toFixed(2) : "-",
      meshSize: this.formatTriple(snapshot.modelSize),
      frameSize: snapshot.projectedFrame
        ? `${Math.round(snapshot.projectedFrame.width)} x ${Math.round(snapshot.projectedFrame.height)} px`
        : "-",
      clipInfo:
        snapshot.clipDuration != null
          ? `${snapshot.clipDuration.toFixed(2)}s / ${snapshot.clipFrames ?? 0} keys / ${snapshot.trackCount ?? 0} tracks`
          : "-",
      referenceSize: this.formatTriple(snapshot.fitReferenceSize),
      bboxSize: this.formatTriple(snapshot.boundingBoxSize),
      bboxCenter: this.formatTriple(snapshot.boundingBoxCenter),
      bboxMin: this.formatTriple(snapshot.boundingBoxMin),
      bboxMax: this.formatTriple(snapshot.boundingBoxMax),
    };
  }

  private formatTriple(
    values: [number, number, number] | null,
    unit = "",
    trailingUnit = false,
  ): string {
    if (!values) return "-";
    const formatted = values.map((value) => value.toFixed(2)).join(", ");
    if (!unit) return formatted;
    if (trailingUnit) return `${formatted} ${unit}`;
    return values.map((value) => `${value.toFixed(2)} ${unit}`).join(", ");
  }

  private el(id: string): HTMLElement {
    return this.container.querySelector(`#${id}`) as HTMLElement;
  }
}
