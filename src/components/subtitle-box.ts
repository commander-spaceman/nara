export class SubtitleBox {
  private container: HTMLElement;

  constructor(container: HTMLElement) {
    this.container = container;
  }

  mount(): void {
    this.container.innerHTML = `
      <div id="subtitle-text">subtitles appear here</div>
    `;
  }

  setText(text: string): void {
    const el = this.container.querySelector("#subtitle-text");
    if (el) el.textContent = text;
  }
}
