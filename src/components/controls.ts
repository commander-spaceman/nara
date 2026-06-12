import type { InputMode } from "./app";

interface ControlsCallbacks {
  onModeChange: (mode: InputMode | null) => void;
}

export class Controls {
  private container: HTMLElement;
  private callbacks: ControlsCallbacks;
  private activeMode: InputMode | null = null;
  private lastMode: InputMode = "chat";

  constructor(container: HTMLElement, callbacks: ControlsCallbacks) {
    this.container = container;
    this.callbacks = callbacks;
  }

  mount(): void {
    this.container.innerHTML = `
      <div class="ctrl-group">
        <button id="btn-mic" class="ctrl-btn" title="Voice input">
          <svg viewBox="0 0 24 24"><path d="M12 14a3 3 0 003-3V5a3 3 0 10-6 0v6a3 3 0 003 3zm5-3a5 5 0 01-10 0H5a7 7 0 0014 0h-2zm-4 7v3h-2v-3h2z" fill="currentColor"/></svg>
        </button>
        <span class="ctrl-label">mic</span>
      </div>
      <div class="ctrl-group">
        <button id="btn-chat" class="ctrl-btn" title="Text input">
          <svg viewBox="0 0 24 24"><path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H6l-2 2V4h16v12z" fill="currentColor"/></svg>
        </button>
        <span class="ctrl-label">chat</span>
      </div>
    `;

    const btnMic = this.container.querySelector("#btn-mic") as HTMLElement;
    const btnChat = this.container.querySelector("#btn-chat") as HTMLElement;

    btnMic.addEventListener("click", () => this.toggleMode("mic"));
    btnMic.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      this.toggleMode("chat");
    });

    btnChat.addEventListener("click", () => this.toggleMode("chat"));
    btnChat.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      this.toggleMode("mic");
    });
  }

  private toggleMode(mode: InputMode): void {
    if (this.activeMode === mode) {
      this.activeMode = null;
    } else {
      this.activeMode = mode;
      this.lastMode = mode;
    }
    const btnMic = this.container.querySelector("#btn-mic")!;
    const btnChat = this.container.querySelector("#btn-chat")!;
    btnMic.classList.toggle("active", this.activeMode === "mic");
    btnChat.classList.toggle("active", this.activeMode === "chat");
    this.callbacks.onModeChange(this.activeMode);
  }

  setLoading(loading: boolean): void {
    if (!this.activeMode) return;
    const btn = this.container.querySelector(
      this.activeMode === "chat" ? "#btn-chat" : "#btn-mic",
    );
    if (btn) btn.classList.toggle("loading", loading);
  }

  toggleInput(): void {
    if (this.activeMode) {
      this.toggleMode(this.activeMode);
    } else {
      this.toggleMode(this.lastMode);
    }
  }
}
