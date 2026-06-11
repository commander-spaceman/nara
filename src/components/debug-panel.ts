interface DebugData {
  health: string;
  state: string;
  session: string;
  memory: string;
  fps: string;
  position: string;
  rotation: string;
  scale: string;
  animation: string;
  blend: string;
  pitch: string;
  speed: string;
  dryWet: string;
  fxActive: string;
  output: string;
}

export class DebugPanel {
  private container: HTMLElement;
  private data: DebugData;
  private collapsed = false;

  constructor(container: HTMLElement) {
    this.container = container;
    this.data = {
      health: "ok",
      state: "active",
      session: "idle",
      memory: "0 msgs",
      fps: "60",
      position: "0.0, -0.3, 0.0",
      rotation: "0\u00B0, 0\u00B0, 0\u00B0",
      scale: "0.99",
      animation: "idle",
      blend: "0.00",
      pitch: "+2 st",
      speed: "0.95x",
      dryWet: "70% / 20%",
      fxActive: "yes",
      output: "speakers",
    };
  }

  mount(): void {
    this.render();
    document.addEventListener("keydown", this.onKeyDown);
  }

  update(partial: Partial<DebugData>): void {
    Object.assign(this.data, partial);
    this.render();
  }

  toggle(): void {
    this.collapsed = !this.collapsed;
    this.render();
  }

  destroy(): void {
    document.removeEventListener("keydown", this.onKeyDown);
  }

  private onKeyDown = (e: KeyboardEvent): void => {
    const tag = (e.target as HTMLElement).tagName;
    if (tag === "INPUT" || tag === "TEXTAREA") return;
    if (e.key === "d" && e.ctrlKey === false && e.metaKey === false) {
      e.preventDefault();
      this.toggle();
    }
  };

  private render(): void {
    const d = this.data;
    this.container.innerHTML = this.collapsed
      ? '<div class="debug-collapsed">debug (D)</div>'
      : `
        <div class="debug-section">
          <div class="debug-section-title">status</div>
          <div class="debug-row"><span>health</span><span>${d.health}</span></div>
          <div class="debug-row"><span>state</span><span>${d.state}</span></div>
          <div class="debug-row"><span>session</span><span>${d.session}</span></div>
          <div class="debug-row"><span>memory</span><span>${d.memory}</span></div>
          <div class="debug-row"><span>fps</span><span>${d.fps}</span></div>
        </div>
        <div class="debug-section">
          <div class="debug-section-title">model</div>
          <div class="debug-row"><span>position</span><span>${d.position}</span></div>
          <div class="debug-row"><span>rotation</span><span>${d.rotation}</span></div>
          <div class="debug-row"><span>scale</span><span>${d.scale}</span></div>
          <div class="debug-row"><span>animation</span><span>${d.animation}</span></div>
          <div class="debug-row"><span>blend</span><span>${d.blend}</span></div>
        </div>
        <div class="debug-section">
          <div class="debug-section-title">audio</div>
          <div class="debug-row"><span>pitch</span><span>${d.pitch}</span></div>
          <div class="debug-row"><span>speed</span><span>${d.speed}</span></div>
          <div class="debug-row"><span>dry / wet</span><span>${d.dryWet}</span></div>
          <div class="debug-row"><span>fx active</span><span>${d.fxActive}</span></div>
          <div class="debug-row"><span>output</span><span>${d.output}</span></div>
        </div>
      `;
  }
}
