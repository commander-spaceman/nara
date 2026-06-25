import type { InputMode } from "./app";

export interface ControlsCallbacks {
  onModeChange: (mode: InputMode | null) => void;
  onMicStart?: () => void;
  onMicStop?: () => void;
  onMicCancel?: () => void;
  onVadToggle?: (enabled: boolean) => void;
}

export class Controls {
  private container: HTMLElement;
  private callbacks: ControlsCallbacks;
  private activeMode: InputMode | null = null;
  private lastMode: InputMode = "chat";
  private _isRecording = false;
  private _vadEnabled = false;
  private locked = false;

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
        <button id="btn-vad" class="ctrl-btn" title="Hands-free (auto voice detection)">
          <svg viewBox="0 0 24 24"><path d="M3 12h2v2H3v-2zm4-4h2v10H7V8zm4-4h2v18h-2V4zm4 4h2v10h-2V8zm4 4h2v2h-2v-2z" fill="currentColor"/></svg>
        </button>
        <span class="ctrl-label">auto</span>
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
    const btnVad = this.container.querySelector("#btn-vad") as HTMLElement;

    btnMic.addEventListener("click", () => {
      if (this.activeMode === "mic" && this._isRecording) {
        this.callbacks.onMicStop?.();
      } else {
        if (this.activeMode !== "mic") {
          this.toggleMode("mic");
        }
        this.callbacks.onMicStart?.();
      }
    });
    btnMic.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      if (this._isRecording) {
        this.callbacks.onMicCancel?.();
      } else {
        this.toggleMode("chat");
      }
    });

    btnChat.addEventListener("click", () => this.toggleMode("chat"));
    btnChat.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      this.toggleMode("mic");
    });

    btnVad.addEventListener("click", () => {
      if (this.locked) return;
      this.setVadEnabled(!this._vadEnabled);
      this.callbacks.onVadToggle?.(this._vadEnabled);
    });
  }

  get isRecording(): boolean {
    return this._isRecording;
  }

  get vadEnabled(): boolean {
    return this._vadEnabled;
  }

  setVadEnabled(enabled: boolean): void {
    this._vadEnabled = enabled;
    this.applyVadButtonState();
    if (enabled) {
      this.activeMode = null;
      this._isRecording = false;
      this.locked = false;
      const btnMic = this.container.querySelector("#btn-mic")!;
      const btnChat = this.container.querySelector("#btn-chat")!;
      btnMic.classList.remove("active", "recording", "loading");
      btnChat.classList.remove("active", "recording", "loading");
    }
  }

  private applyVadButtonState(): void {
    const btnVad = this.container.querySelector("#btn-vad");
    btnVad?.classList.toggle("active", this._vadEnabled);
  }

  setRecording(recording: boolean): void {
    this._isRecording = recording;
    const target = this._vadEnabled ? "#btn-vad" : "#btn-mic";
    const btn = this.container.querySelector(target)!;
    btn.classList.toggle("recording", recording);
  }

  private toggleMode(mode: InputMode): void {
    if (this.locked) return;

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
    this.locked = loading;
    let btn: HTMLElement | null;
    if (this._vadEnabled) {
      btn = this.container.querySelector("#btn-vad");
    } else if (this.activeMode) {
      btn = this.container.querySelector(
        this.activeMode === "chat" ? "#btn-chat" : "#btn-mic",
      );
    } else {
      return;
    }
    btn?.classList.toggle("loading", loading);
  }

  toggleInput(): void {
    if (this.activeMode) {
      this.toggleMode(this.activeMode);
    } else {
      this.toggleMode(this.lastMode);
    }
  }
}
