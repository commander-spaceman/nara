import type { InputMode } from "./app";

export class InputBar {
  private container: HTMLElement;

  constructor(container: HTMLElement) {
    this.container = container;
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
  }
}
