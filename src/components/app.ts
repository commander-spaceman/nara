import { DebugPanel } from "./debug-panel";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { invoke } from "@tauri-apps/api/core";
import type { ModelArea, ModelDebugSnapshot } from "./model-area";
import { SubtitleBox } from "./subtitle-box";
import { Controls } from "./controls";
import { InputBar } from "./input-bar";
import { SessionModal } from "./session-modal";
import { AudioPlayer } from "../audio/audio-player";
import { ChatService } from "./chat-service";
import { AudioCapture } from "../modules/audio-capture";
import { VadDetector } from "../modules/vad";
import { transcribe } from "../modules/stt";
import { initApiKey } from "../memory/llm";
import type { Message } from "../memory/llm";
import { startSession, endSession, getSessionId, getProfile, deleteProfile, clearProfile } from "../memory/db";
import { recallPrevious } from "../memory/recall";
import { TTS_MODELS } from "../modules/tts";
import { STT_MODELS } from "../modules/stt";

export type InputMode = "chat" | "mic";

const AI_IDENTITY_VALUES = new Set([
  "nara",
  "nara'korrin",
  "narakorrin",
  "quarian",
]);

async function cleanupContaminatedProfile(): Promise<void> {
  try {
    const profile = await getProfile();
    for (const { key, value } of profile) {
      if (AI_IDENTITY_VALUES.has(value.toLowerCase().trim())) {
        await deleteProfile(key);
        console.log(`[profile] removed contaminated entry: ${key}=${value}`);
      }
      if (key === "name" && value.toLowerCase().trim().startsWith("nara")) {
        await deleteProfile(key);
        console.log(`[profile] removed contaminated name: ${value}`);
      }
    }
  } catch {
    // non-critical
  }
}

export class App {
  private container: HTMLElement;
  private debugPanel!: DebugPanel;
  private modelArea: ModelArea | null = null;
  private subtitleBox!: SubtitleBox;
  private controls!: Controls;
  private inputBar!: InputBar;
  private sessionModal!: SessionModal;
  private audioPlayer!: AudioPlayer;
  private chatService!: ChatService;
  private audioCapture!: AudioCapture;
  private vadDetector: VadDetector | null = null;
  private vadEnabled: boolean;
  private vadThreshold = 0.015;
  private vadPlaybackThreshold = 0.045;
  private history: Message[] = [];
  private totalInputTokens = 0;
  private totalOutputTokens = 0;
  private sessionStart = Date.now();
  private ttsModel: string;
  private sttModel: string;
  private shouldRestartMic = false;
  private transcriptionHideTimer: ReturnType<typeof setTimeout> | null = null;
  private modelAreaProbeObserver: ResizeObserver | null = null;
  private idleFrameWidthPx: number | null = null;

  constructor(container: HTMLElement) {
    this.container = container;
    this.ttsModel = localStorage.getItem("nara_tts_model") || "gpt-4o-mini-tts";
    this.sttModel = localStorage.getItem("nara_stt_model") || "whisper-1";
    this.vadEnabled = false;
  }

  mount(): void {
    void initApiKey();

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
        onModelGuidesToggle: (visible) => {
          this.modelArea?.setGuidesVisible(visible);
        },
        onModelHeavyBoundsToggle: (enabled) => {
          this.modelArea?.setHeavyBoundsEnabled(enabled);
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

    void this.loadModelArea();
    this.bindModelAreaProbe();

    this.subtitleBox = new SubtitleBox(this.el("subtitle-box"));
    this.subtitleBox.mount();

    this.controls = new Controls(this.el("controls"), {
      onModeChange: (mode) => {
        this.inputBar.setMode(mode);
        if (mode === "chat") this.audioPlayer.stop();
      },
      onMicStart: () => this.startRecording(),
      onMicStop: () => this.stopRecording(),
      onMicCancel: () => this.cancelAndRestart(),
      onVadToggle: (enabled) => this.setVadEnabled(enabled),
    });
    this.controls.mount();
    if (this.vadEnabled) this.startVad();

    this.audioPlayer = new AudioPlayer(
      this.el("model-area"),
      this.subtitleBox,
      this.debugPanel,
      this.controls,
      (hint) => {
        this.modelArea?.startSpeaking(hint);
        this.scheduleTranscriptionHide();
        this.resumeVadForPlayback();
      },
      () => {
        this.clearTranscriptionHideTimer();
        this.inputBar.clearMicStatus();
        this.modelArea?.stopSpeaking();
        this.resumeVadIfEnabled();
      },
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
        } else if (state === "stopped") {
          this.processRecording();
        } else if (state === "idle") {
          this.controls.setRecording(false);
          if (this.shouldRestartMic) {
            this.shouldRestartMic = false;
            this.startRecording();
          }
        }
      },
      onElapsed: (ms) => {
        const s = Math.floor(ms / 1000);
        const secs = s % 60;
        const mins = Math.floor(s / 60);
        const elapsed =
          mins > 0 ? `${mins}:${secs.toString().padStart(2, "0")}` : `${secs}s`;
        this.subtitleBox.setStatus("active", `recording... ${elapsed}`);
      },
      onError: (message) => {
        this.subtitleBox.setText(message);
      },
    });

    this.sessionModal = new SessionModal(this.el("modal-overlay"), {
      onSessionLoad: (msgs) => {
        this.history = msgs;
        this.chatService.loadSession(msgs);
      },
    });
    this.sessionModal.mount();

    this.inputBar = new InputBar(this.el("input-bar"), {
      onSubmit: (text) => this.handleSubmit(text),
    });
    this.inputBar.mount();

    startSession()
      .then(() => {
        this.debugPanel.update({ sessionId: getSessionId().slice(0, 10) });
        return cleanupContaminatedProfile();
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

  private setVadEnabled(enabled: boolean): void {
    this.vadEnabled = enabled;
    if (enabled) {
      this.startVad();
    } else {
      this.stopVad();
    }
  }

  private startVad(): void {
    if (this.vadDetector) return;
    this.vadDetector = new VadDetector(
      {
        onSpeechStart: () => {
          if (this.controls.isRecording) return;
          this.beginVadUtterance();
        },
        onUtterance: (blob) => {
          this.controls.setRecording(false);
          void this.processRecording(blob);
        },
        onError: (message) => {
          this.subtitleBox.setText(message);
        },
      },
      { threshold: this.vadThreshold },
    );
    void this.vadDetector.start();
  }

  private beginVadUtterance(): void {
    this.clearTranscriptionHideTimer();
    this.vadDetector?.setThreshold(this.vadThreshold);
    this.audioPlayer.stop();
    this.subtitleBox.clear();
    this.inputBar.setMode("mic");
    this.controls.setRecording(true);
    this.subtitleBox.setStatus("active", "recording...");
  }

  private stopVad(): void {
    this.vadDetector?.stop();
    this.vadDetector = null;
  }

  private resumeVadIfEnabled(): void {
    if (!this.vadEnabled) return;
    this.vadDetector?.setThreshold(this.vadThreshold);
    this.vadDetector?.resume();
  }

  private resumeVadForPlayback(): void {
    if (!this.vadEnabled || !this.vadDetector) return;
    this.vadDetector.setThreshold(this.vadPlaybackThreshold);
    this.vadDetector.resume();
  }

  private startRecording(): void {
    this.clearTranscriptionHideTimer();
    this.vadDetector?.setThreshold(this.vadThreshold);
    this.audioPlayer.stop();
    this.subtitleBox.clear();
    this.inputBar.setMode("mic");
    this.audioCapture.start();
    this.subtitleBox.setStatus("active", "recording...");
  }

  private cancelAndRestart(): void {
    this.clearTranscriptionHideTimer();
    this.subtitleBox.clear();
    this.shouldRestartMic = true;
    this.audioCapture.cancel();
  }

  private stopRecording(): void {
    this.clearTranscriptionHideTimer();
    this.controls.setRecording(false);
    this.audioCapture.stop();
  }

  private async processRecording(blob?: Blob): Promise<void> {
    const audio = blob ?? this.audioCapture.getBlob();
    if (!audio) {
      this.resumeVadIfEnabled();
      return;
    }

    this.vadDetector?.pause();
    this.controls.setLoading(true);
    this.subtitleBox.setStatus("transcribing", "transcribing...");

    try {
      const text = await transcribe(audio, this.sttModel);
      if (!text.trim()) {
        this.subtitleBox.setText("Didn't catch that, try again");
        this.controls.setLoading(false);
        this.resumeVadIfEnabled();
        return;
      }
      this.subtitleBox.setTranscription(text);
      this.chatService.submit(text);
    } catch (err) {
      console.error("STT error:", err);
      this.subtitleBox.setText("Didn't catch that, try again");
      this.controls.setLoading(false);
      this.resumeVadIfEnabled();
    }
  }

  private async handleSubmit(text: string): Promise<void> {
    if (text === "/help") {
      this.sessionModal.showHelp();
      return;
    }
    if (text === "/history") {
      this.sessionModal.show();
      return;
    }
    if (text === "/new") {
      await this.startFreshSession();
      return;
    }
    if (text === "/debug") {
      this.debugPanel.toggle();
      return;
    }
    if (text === "/session") {
      const messageCount = this.history.length;
      const sid = getSessionId().slice(0, 10);
      this.subtitleBox.setHtml(
        `session <span class="session-id-hl">${sid}</span>: ${messageCount} msgs, ${this.formatUptime()}`,
        4000,
      );
      return;
    }
    if (text === "/recall") {
      await this.handleRecall();
      return;
    }
    if (text === "/clearprofile") {
      clearProfile()
        .then(() => {
          this.subtitleBox.setText("profile cleared");
        })
        .catch(() => {
          this.subtitleBox.setText("failed to clear profile");
        });
      return;
    }
    if (text === "/exit") {
      await endSession().catch(() => {});
      await getCurrentWindow().close();
      return;
    }
    if (
      text.startsWith("/help ") ||
      text.startsWith("/history ") ||
      text.startsWith("/new ") ||
      text.startsWith("/debug ") ||
      text.startsWith("/session ") ||
      text.startsWith("/exit ") ||
      text.startsWith("/recall ")
    ) {
      this.subtitleBox.setText(
        "use /help, /history, /new, /debug, /session, /recall, /clearprofile, or /exit",
      );
      return;
    }
    this.chatService.submit(text);
  }

  private async startFreshSession(): Promise<void> {
    await endSession().catch(() => {});
    this.audioPlayer.stop();
    this.modelArea?.stopSpeaking();
    this.clearTranscriptionHideTimer();
    this.inputBar.clearMicStatus();
    this.history.length = 0;
    this.totalInputTokens = 0;
    this.totalOutputTokens = 0;
    this.sessionStart = Date.now();
    this.chatService.resetSession();
    await startSession().catch(() => {});
    this.debugPanel.update({
      uptime: this.formatUptime(),
      sessionId: getSessionId().slice(0, 10),
      startedAt: new Date().toTimeString().slice(0, 8),
    });
    const sid = getSessionId().slice(0, 10);
    this.subtitleBox.setHtml(
      `[started new session <span class="session-id-hl">${sid}</span>]`,
      4000,
    );
  }

  private async handleRecall(): Promise<void> {
    try {
      const result = await recallPrevious();
      if (!result) {
        this.subtitleBox.setText("no previous sessions found");
        return;
      }

      this.history.push(...result.messages);

      const count = this.history.length / 2;
      this.debugPanel.update({ sent: `${count}`, received: `${count}` });
      this.subtitleBox.setHtml(
        `[recalled session <span class="session-id-hl">${result.sessionId.slice(0, 10)}</span> — ${result.summary}]`,
        4000,
      );
    } catch {
      this.subtitleBox.setText("could not recall previous session");
    }
  }

  setTheme(theme: string): void {
    this.modelArea?.setTheme(theme);
  }

  private async loadModelArea(): Promise<void> {
    try {
      const { ModelArea } = await import("./model-area");
      const modelArea = new ModelArea(this.el("model-area"), (snapshot) => {
        this.debugPanel.update(this.formatModelDebug(snapshot));
        this.syncBottomSectionWidth(snapshot);
      });

      this.modelArea = modelArea;
      modelArea.mount();

      const theme = document.documentElement.getAttribute("data-theme");
      if (theme) {
        modelArea.setTheme(theme);
      }
    } catch (error) {
      console.error("Failed to load model area:", error);
      this.subtitleBox?.setText("Failed to load 3D model area");
    }
  }

  private bindModelAreaProbe(): void {
    const modelArea = this.el("model-area");
    const updateProbe = () => {
      const rect = modelArea.getBoundingClientRect();
      const x = rect.left + rect.width / 2;
      const y = rect.top + rect.height / 2;
      invoke("background_set_probe", {
        x,
        y,
        width: rect.width,
        height: rect.height,
      }).catch(() => {});
    };

    updateProbe();
    this.modelAreaProbeObserver?.disconnect();
    this.modelAreaProbeObserver = new ResizeObserver(() => updateProbe());
    this.modelAreaProbeObserver.observe(modelArea);
  }

  private formatUptime(): string {
    const s = Math.floor((Date.now() - this.sessionStart) / 1000);
    if (s < 60) return `${s}s`;
    const m = Math.floor(s / 60);
    if (m < 60) return `${m}m ${s % 60}s`;
    const h = Math.floor(m / 60);
    return `${h}h ${m % 60}m`;
  }

  private scheduleTranscriptionHide(): void {
    this.clearTranscriptionHideTimer();
    this.transcriptionHideTimer = setTimeout(() => {
      this.transcriptionHideTimer = null;
      this.inputBar.clearMicStatus();
    }, 2000);
  }

  private clearTranscriptionHideTimer(): void {
    if (!this.transcriptionHideTimer) return;
    clearTimeout(this.transcriptionHideTimer);
    this.transcriptionHideTimer = null;
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
      meshSize: this.formatTriple(snapshot.fitReferenceSize),
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

  private syncBottomSectionWidth(snapshot: ModelDebugSnapshot): void {
    if (
      this.idleFrameWidthPx == null &&
      snapshot.activeAnimation === "idle" &&
      snapshot.projectedFrame
    ) {
      this.idleFrameWidthPx = Math.round(snapshot.projectedFrame.width);
      this.el("bottom-section").style.setProperty(
        "--chat-width",
        `${this.idleFrameWidthPx}px`,
      );
    }
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
