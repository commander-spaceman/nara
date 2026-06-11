import { DebugPanel } from "./debug-panel";
import { ModelArea } from "./model-area";
import { SubtitleBox } from "./subtitle-box";
import { Controls } from "./controls";
import { InputBar } from "./input-bar";
import { chat, setApiKey, getApiKey } from "../modules/llm";
import type { Message } from "../modules/llm";
import { startSession, saveMessage } from "../modules/memory";

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
  }

  private async handleSubmit(text: string): Promise<void> {
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

      saveMessage("user", text).catch(() => {});
      saveMessage("assistant", response).catch(() => {});
      this.debugPanel.update({ memory: `${this.history.length / 2} msgs` });
    } catch (err) {
      this.subtitleBox.setText("comms error — try again");
      console.error("LLM error:", err);
    }
  }

  private el(id: string): HTMLElement {
    return this.container.querySelector(`#${id}`) as HTMLElement;
  }
}
