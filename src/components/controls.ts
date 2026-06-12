import type { InputMode } from "./app";

interface ControlsCallbacks {
  onModeChange: (mode: InputMode) => void;
}

export class Controls {
  private container: HTMLElement;
  private callbacks: ControlsCallbacks;
  private activeMode: InputMode = "chat";

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
        <button id="btn-chat" class="ctrl-btn active" title="Text input">
          <svg viewBox="0 0 24 24"><path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H6l-2 2V4h16v12z" fill="currentColor"/></svg>
        </button>
        <span class="ctrl-label">chat</span>
      </div>
    `;

    const btnMic = this.container.querySelector("#btn-mic") as HTMLElement;
    const btnChat = this.container.querySelector("#btn-chat") as HTMLElement;

    btnMic.addEventListener("click", () => this.setMode("mic"));
    btnMic.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      this.setMode("chat");
    });

    btnChat.addEventListener("click", () => this.setMode("chat"));
    btnChat.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      this.setMode("mic");
    });
  }

  setMode(mode: InputMode): void {
    this.activeMode = mode;
    const btnMic = this.container.querySelector("#btn-mic")!;
    const btnChat = this.container.querySelector("#btn-chat")!;
    btnMic.classList.toggle("active", mode === "mic");
    btnChat.classList.toggle("active", mode === "chat");
    this.callbacks.onModeChange(mode);
  }

  setLoading(loading: boolean): void {
    const btn = this.container.querySelector(
      this.activeMode === "chat" ? "#btn-chat" : "#btn-mic",
    );
    if (btn) btn.classList.toggle("loading", loading);
  }
}
