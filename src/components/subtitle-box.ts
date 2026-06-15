export class SubtitleBox {
  private container: HTMLElement;
  private clearTimer: number | null = null;

  constructor(container: HTMLElement) {
    this.container = container;
  }

  mount(): void {
    this.container.innerHTML = `
      <div id="subtitle-text"></div>
    `;
  }

  setText(text: string): void {
    this.cancelClearTimer();
    const el = this.container.querySelector("#subtitle-text");
    if (!el) return;
    el.textContent = text;
    this.container.classList.add("visible");
  }

  setHtml(html: string, autoClearMs?: number): void {
    this.cancelClearTimer();
    const el = this.container.querySelector("#subtitle-text");
    if (!el) return;
    el.innerHTML = html;
    this.container.classList.add("visible");
    if (autoClearMs) {
      this.clearAfter(autoClearMs);
    }
  }

  clear(): void {
    this.container.classList.remove("visible");
  }

  clearAfter(ms: number): void {
    this.cancelClearTimer();
    this.clearTimer = window.setTimeout(() => {
      this.clearTimer = null;
      this.clear();
    }, ms);
  }

  private cancelClearTimer(): void {
    if (this.clearTimer !== null) {
      clearTimeout(this.clearTimer);
      this.clearTimer = null;
    }
  }
}
