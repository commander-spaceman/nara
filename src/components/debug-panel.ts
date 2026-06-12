interface DebugData {
  llmModel: string;
  ttsModel: string;
  sttModel: string;
  inputTokens: string;
  outputTokens: string;
  cacheHits: string;
  latency: string;
  sessionId: string;
  sent: string;
  received: string;
  uptime: string;
  startedAt: string;
  audioDuration: string;
  audioSize: string;
  ttsLatency: string;
}

interface ModelOption {
  id: string;
  label: string;
}

interface DebugPanelCallbacks {
  onTtsModelChange: (model: string) => void;
  onSttModelChange: (model: string) => void;
}

export class DebugPanel {
  private container: HTMLElement;
  private data: DebugData;
  private visibility: "hidden" | "expanded" | "out" = "out";
  private ttsModels: ModelOption[];
  private sttModels: ModelOption[];
  private callbacks: DebugPanelCallbacks;

  constructor(
    container: HTMLElement,
    callbacks: DebugPanelCallbacks,
    ttsModels: ModelOption[],
    sttModels: ModelOption[],
    initialTtsModel: string,
    initialSttModel: string,
  ) {
    this.container = container;
    this.callbacks = callbacks;
    this.ttsModels = ttsModels;
    this.sttModels = sttModels;
    this.data = {
      llmModel: "deepseek-v4-pro",
      ttsModel: initialTtsModel,
      sttModel: initialSttModel,
      inputTokens: "0",
      outputTokens: "0",
      cacheHits: "-",
      latency: "-",
      sessionId: "-",
      sent: "0",
      received: "0",
      uptime: "0s",
      startedAt: "-",
      audioDuration: "-",
      audioSize: "-",
      ttsLatency: "-",
    };
  }

  mount(): void {
    this.render();
    document.addEventListener("keydown", this.onKeyDown);
    this.bindEvents();
  }

  update(partial: Partial<DebugData>): void {
    Object.assign(this.data, partial);
    this.render();
    this.bindEvents();
  }

  toggle(): void {
    if (this.visibility === "hidden") {
      this.visibility = "expanded";
      console.log(
        "%c[debug]%c active",
        "color: #5fdb90; font-weight: bold",
        "color: #ccc",
      );
    } else if (this.visibility === "expanded") {
      this.visibility = "out";
      console.log(
        "%c[debug]%c out of view",
        "color: #e04444; font-weight: bold",
        "color: #ccc",
      );
    } else {
      this.visibility = "hidden";
      console.log(
        "%c[debug]%c hidden",
        "color: #f0c040; font-weight: bold",
        "color: #ccc",
      );
    }
    this.render();
    this.bindEvents();
  }

  destroy(): void {
    document.removeEventListener("keydown", this.onKeyDown);
  }

  private onKeyDown = (e: KeyboardEvent): void => {
    const tag = (e.target as HTMLElement).tagName;
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
    if (e.key === "d" && e.ctrlKey === false && e.metaKey === false) {
      e.preventDefault();
      this.toggle();
    }
  };

  private bindEvents(): void {
    const ttsSelect = this.container.querySelector(
      "#debug-tts-model",
    ) as HTMLSelectElement;
    const sttSelect = this.container.querySelector(
      "#debug-stt-model",
    ) as HTMLSelectElement;
    if (ttsSelect) {
      ttsSelect.addEventListener("change", () =>
        this.callbacks.onTtsModelChange(ttsSelect.value),
      );
    }
    if (sttSelect) {
      sttSelect.addEventListener("change", () =>
        this.callbacks.onSttModelChange(sttSelect.value),
      );
    }
  }

  private render(): void {
    const d = this.data;
    const ttsOptions = this.ttsModels
      .map(
        (m) =>
          `<option value="${m.id}" ${m.id === d.ttsModel ? "selected" : ""}>${m.label}</option>`,
      )
      .join("");
    const sttOptions = this.sttModels
      .map(
        (m) =>
          `<option value="${m.id}" ${m.id === d.sttModel ? "selected" : ""}>${m.label}</option>`,
      )
      .join("");

    if (this.visibility === "out") {
      this.container.innerHTML = "";
      return;
    }

    this.container.innerHTML =
      this.visibility === "hidden"
        ? '<div class="debug-collapsed">debug (d)</div>'
        : `
        <div class="debug-section">
          <div class="debug-section-title">status</div>
          <div class="debug-row"><span>llm</span><span>${d.llmModel.split("-").slice(0, 2).join("-")}</span></div>
          <div class="debug-row"><span>in tokens</span><span>${d.inputTokens}</span></div>
          <div class="debug-row"><span>out tokens</span><span>${d.outputTokens}</span></div>
          <div class="debug-row"><span>cache hits</span><span>${d.cacheHits}</span></div>
          <div class="debug-row"><span>latency</span><span>${d.latency}</span></div>
        </div>
        <div class="debug-section">
          <div class="debug-section-title">session</div>
          <div class="debug-row"><span>id</span><span>${d.sessionId}</span></div>
          <div class="debug-row"><span>sent</span><span>${d.sent}</span></div>
          <div class="debug-row"><span>received</span><span>${d.received}</span></div>
          <div class="debug-row"><span>started</span><span>${d.startedAt}</span></div>
          <div class="debug-row"><span>uptime</span><span>${d.uptime}</span></div>
        </div>
        <div class="debug-section">
          <div class="debug-section-title">audio</div>
          <div class="debug-row"><span>tts</span>
            <select id="debug-tts-model" class="debug-select">${ttsOptions}</select>
          </div>
          <div class="debug-row"><span>stt</span>
            <select id="debug-stt-model" class="debug-select">${sttOptions}</select>
          </div>
          <div class="debug-row"><span>duration</span><span>${d.audioDuration}</span></div>
          <div class="debug-row"><span>size</span><span>${d.audioSize}</span></div>
          <div class="debug-row"><span>tts latency</span><span>${d.ttsLatency}</span></div>
        </div>
      `;
  }
}
