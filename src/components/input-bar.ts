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

  clearMicStatus(): void {
    if (this._mode !== "mic") return;
    this.setMode(null);
  }

  private render(mode: InputMode): void {
    if (mode === "chat") {
      this.container.innerHTML = `
        <div id="chat-input-area">
          <input type="text" id="chat-input" placeholder="type a message..." autocomplete="off" />
        </div>
      `;
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
    } else {
      this.container.innerHTML = "";
    }
  }
}
