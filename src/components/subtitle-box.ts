export class SubtitleBox {
  private container: HTMLElement;

  constructor(container: HTMLElement) {
    this.container = container;
  }

  mount(): void {
    this.container.innerHTML = `
      <div id="subtitle-text"></div>
    `;
  }

  setText(text: string): void {
    const el = this.container.querySelector("#subtitle-text");
    if (!el) return;
    el.textContent = text;
    this.container.classList.add("visible");
  }

  clear(): void {
    this.container.classList.remove("visible");
  }
}
