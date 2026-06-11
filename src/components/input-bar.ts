import type { InputMode } from "./app";

interface InputBarCallbacks {
  onSubmit: (text: string) => void;
}

export class InputBar {
  private container: HTMLElement;
  private callbacks: InputBarCallbacks;

  constructor(container: HTMLElement, callbacks: InputBarCallbacks) {
    this.container = container;
    this.callbacks = callbacks;
  }

  mount(): void {
    this.render("chat");
  }

  setMode(mode: InputMode): void {
    this.render(mode);
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
          <span>recording...</span>
        </div>
      `;

    if (mode === "chat") {
      const input = this.container.querySelector(
        "#chat-input",
      ) as HTMLInputElement;
      input.addEventListener("keydown", (e) => {
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
