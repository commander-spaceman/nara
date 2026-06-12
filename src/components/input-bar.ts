import type { InputMode } from "./app";

interface InputBarCallbacks {
  onSubmit: (text: string) => void;
}

export class InputBar {
  private container: HTMLElement;
  private callbacks: InputBarCallbacks;
  private _mode: InputMode | null = null;

  constructor(container: HTMLElement, callbacks: InputBarCallbacks) {
    this.container = container;
    this.callbacks = callbacks;
  }

  mount(): void {
    this.container.innerHTML = "";
  }

  setMode(mode: InputMode | null): void {
    this._mode = mode;
    if (!mode) {
      this.container.innerHTML = "";
      return;
    }
    this.render(mode);
  }

  setRecordingState(recording: boolean): void {
    const indicator = this.container.querySelector(
      ".recording-indicator",
    ) as HTMLElement;
    const label = this.container.querySelector(
      ".recording-label",
    ) as HTMLElement;
    if (indicator) {
      indicator.classList.toggle("active", recording);
    }
    if (label) {
      label.textContent = recording ? "recording..." : "ready";
    }
  }

  setElapsed(ms: number): void {
    const el = this.container.querySelector(".recording-elapsed");
    if (el) {
      const s = Math.floor(ms / 1000);
      const secs = s % 60;
      const mins = Math.floor(s / 60);
      el.textContent =
        mins > 0 ? `${mins}:${secs.toString().padStart(2, "0")}` : `${secs}s`;
    }
  }

  showProcessing(): void {
    if (this._mode !== "mic") return;
    this.container.innerHTML = `
      <div id="mic-status-area">
        <div class="recording-indicator active"></div>
        <span class="recording-label">transcribing...</span>
      </div>
    `;
  }

  showTranscription(text: string): void {
    this.container.innerHTML = `
      <div id="mic-status-area">
        <span class="recording-label transcription">${text}</span>
      </div>
    `;
  }

  private render(mode: InputMode): void {
    this.container.innerHTML =
      mode === "chat"
        ? `
        <div id="chat-input-area">
          <input type="text" id="chat-input" placeholder="type a message..." autocomplete="off" />
        </div>
      `
        : `
        <div id="mic-status-area">
          <div class="recording-indicator"></div>
          <span class="recording-label">ready</span>
          <span class="recording-elapsed"></span>
        </div>
      `;

    if (mode === "chat") {
      const input = this.container.querySelector(
        "#chat-input",
      ) as HTMLInputElement;
      input.addEventListener("keydown", (e) => {
        if (e.key === "Escape") {
          input.blur();
          return;
        }
        if (e.key === "Enter" && input.value.trim()) {
          const text = input.value.trim();
          input.value = "";
          this.callbacks.onSubmit(text);
        }
      });
      input.focus();
    }
  }
}
