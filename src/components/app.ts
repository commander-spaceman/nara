import { DebugPanel } from "./debug-panel";
import { ModelArea } from "./model-area";
import { SubtitleBox } from "./subtitle-box";
import { Controls } from "./controls";
import { InputBar } from "./input-bar";
import { chat, setApiKey, getApiKey } from "../modules/llm";
import type { Message } from "../modules/llm";
import {
  startSession,
  saveMessage,
  endSession,
  listSessions,
  loadSession,
} from "../modules/memory";
import { synthesize } from "../modules/tts";

export type InputMode = "chat" | "mic";

export class App {
  private container: HTMLElement;
  private debugPanel!: DebugPanel;
  private modelArea!: ModelArea;
  private subtitleBox!: SubtitleBox;
  private controls!: Controls;
  private inputBar!: InputBar;
  private history: Message[] = [];

  constructor(container: HTMLElement) {
    this.container = container;
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

    this.debugPanel = new DebugPanel(this.el("debug-panel"));
    this.debugPanel.mount();
    this.debugPanel.update({ memory: "0 msgs" });

    this.modelArea = new ModelArea(this.el("model-area"));
    this.modelArea.mount();

    this.subtitleBox = new SubtitleBox(this.el("subtitle-box"));
    this.subtitleBox.mount();
    this.subtitleBox.setText(
      apiKey ? "ready" : "VITE_DEEPSEEK_API_KEY not set in .env",
    );

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

    startSession().catch(() => {});

    window.addEventListener("beforeunload", () => {
      endSession().catch(() => {});
    });
  }

  private async handleSubmit(text: string): Promise<void> {
    if (text === "/history" || text === "/sessions") {
      await this.showSessionList();
      return;
    }
    if (text.startsWith("/history ") || text.startsWith("/sessions ")) {
      const id = text.split(" ")[1];
      await this.loadSessionIntoContext(id);
      return;
    }

    if (!getApiKey()) {
      this.subtitleBox.setText("api key not configured — check .env");
      return;
    }

    this.subtitleBox.setText("...");

    try {
      const response = await chat(text, this.history);
      this.history.push({ role: "user", content: text });
      this.history.push({ role: "assistant", content: response });
      this.subtitleBox.setText(response);

      const count = this.history.length / 2;
      saveMessage("user", text).catch(() => {});
      saveMessage("assistant", response).catch(() => {});
      this.debugPanel.update({ memory: `${count} msgs` });
      synthesize(response)
        .then((audio) => this.playAudio(audio))
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

  private async showSessionList(): Promise<void> {
    try {
      const sessions = await listSessions(0);
      const content = this.el("modal-content");
      const overlay = this.el("modal-overlay");

      if (sessions.length === 0) {
        content.innerHTML =
          '<div style="color:var(--text-dim);text-align:center;padding:16px">no past sessions</div>';
      } else {
        content.innerHTML = sessions
          .map((s) => {
            const d = new Date(s.started_at * 1000).toLocaleString();
            return `
            <div class="modal-session" data-session-id="${s.id}">
              <span class="modal-session-id">${s.id.slice(0, 10)}</span>
              <span class="modal-session-date">${d}</span>
              <span class="modal-session-count">${s.msg_count} msgs</span>
            </div>`;
          })
          .join("");

        content.querySelectorAll(".modal-session").forEach((el) => {
          el.addEventListener("click", () => {
            const id = (el as HTMLElement).dataset.sessionId!;
            this.loadSessionIntoContext(id);
            overlay.classList.add("hidden");
          });
        });
      }

      overlay.classList.remove("hidden");

      const close = this.el("modal-close");
      close.onclick = () => overlay.classList.add("hidden");
      overlay.onclick = (e) => {
        if (e.target === overlay) overlay.classList.add("hidden");
      };
      document.addEventListener(
        "keydown",
        (e) => {
          if (e.key === "Escape") overlay.classList.add("hidden");
        },
        { once: true },
      );
    } catch {
      this.subtitleBox.setText("failed to load sessions");
    }
  }

  private async loadSessionIntoContext(id: string): Promise<void> {
    try {
      const msgs = await loadSession(id);
      if (msgs.length === 0) {
        this.subtitleBox.setText("session not found or empty");
        return;
      }
      this.history = msgs.map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      }));
      this.subtitleBox.setText(
        `[${msgs.length} msgs loaded from session ${id.slice(0, 10)}]`,
      );
      console.log(
        `%c[session]%c ${id.slice(0, 10)} %cloaded %c${msgs.length} msgs`,
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
      this.debugPanel.update({ memory: `${msgs.length / 2} msgs` });
    } catch {
      this.subtitleBox.setText("failed to load session");
    }
  }

  private playAudio(arrayBuffer: ArrayBuffer): void {
    const ctx = new AudioContext();
    ctx.resume();
    console.log("[TTS] received", arrayBuffer.byteLength, "bytes");
    ctx.decodeAudioData(
      arrayBuffer.slice(0),
      (buffer) => {
        console.log("[TTS] playing", buffer.duration.toFixed(1), "s");
        const source = ctx.createBufferSource();
        source.buffer = buffer;
        source.connect(ctx.destination);
        source.start();
        source.onended = () => ctx.close();
      },
      (err) => console.error("[TTS] decode error:", err),
    );
  }

  private el(id: string): HTMLElement {
    return this.container.querySelector(`#${id}`) as HTMLElement;
  }
}
