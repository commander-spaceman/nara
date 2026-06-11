import quarianPlaceholder from "../assets/quarian.png";

export class ModelArea {
  private container: HTMLElement;

  constructor(container: HTMLElement) {
    this.container = container;
  }

  mount(): void {
    this.container.innerHTML = `
      <img class="placeholder-model" src="${quarianPlaceholder}" alt="Nara placeholder" />
    `;
  }
}
