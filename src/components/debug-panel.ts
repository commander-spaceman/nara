import { HELMET_DEFAULTS, type HelmetFXParams } from "../audio/audio-fx";

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
  onVocoderChange: (params: HelmetFXParams) => void;
}

export class DebugPanel {
  private container: HTMLElement;
  private data: DebugData;
  private vocoderParams: HelmetFXParams;
  private visibility: "expanded" | "out" = "out";
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
    this.vocoderParams = { ...HELMET_DEFAULTS };
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
    this.updateStatusDOM();
  }

  toggle(): void {
    if (this.visibility === "out") {
      this.visibility = "expanded";
      console.log(
        "%c[debug]%c active",
        "color: #5fdb90; font-weight: bold",
        "color: #ccc",
      );
    } else {
      this.visibility = "out";
      console.log(
        "%c[debug]%c hidden",
        "color: #e04444; font-weight: bold",
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

    const resetBtn = this.container.querySelector(
      "#debug-voc-reset",
    ) as HTMLButtonElement;
    if (resetBtn) {
      resetBtn.addEventListener("click", () => {
        this.vocoderParams = { ...HELMET_DEFAULTS };
        this.callbacks.onVocoderChange({ ...this.vocoderParams });
        this.render();
        this.bindEvents();
      });
    }

    const rangeIds: (keyof HelmetFXParams)[] = [
      "pitch_semitones",
      "dry_gain",
      "wet_gain",
      "hpf",
      "lpf",
      "notch",
      "drive",
    ];
    for (const id of rangeIds) {
      const input = this.container.querySelector(
        `#debug-voc-${id}`,
      ) as HTMLInputElement;
      if (input) {
        input.addEventListener("input", () => {
          const val = parseFloat(input.value);
          switch (id) {
            case "pitch_semitones":
              this.vocoderParams.pitch_semitones = val;
              break;
            case "dry_gain":
              this.vocoderParams.dry_gain = val;
              break;
            case "wet_gain":
              this.vocoderParams.wet_gain = val;
              break;
            case "hpf":
              this.vocoderParams.hpf = val;
              break;
            case "lpf":
              this.vocoderParams.lpf = val;
              break;
            case "notch":
              this.vocoderParams.notch = val;
              break;
            case "drive":
              this.vocoderParams.drive = val;
              break;
          }
          const display = this.container.querySelector(
            `[data-voc-val="${id}"]`,
          );
          const unit = input.dataset.unit || "";
          if (display) display.textContent = val + unit;

          this.callbacks.onVocoderChange({ ...this.vocoderParams });
        });
      }
    }
  }

  private updateStatusDOM(): void {
    const fields: Record<string, string> = {
      "in-tokens": this.data.inputTokens,
      "out-tokens": this.data.outputTokens,
      "cache-hits": this.data.cacheHits,
      latency: this.data.latency,
      "session-id": this.data.sessionId,
      sent: this.data.sent,
      received: this.data.received,
      started: this.data.startedAt,
      uptime: this.data.uptime,
      "audio-duration": this.data.audioDuration,
      "audio-size": this.data.audioSize,
      "tts-latency": this.data.ttsLatency,
    };
    for (const [field, value] of Object.entries(fields)) {
      const el = this.container.querySelector(`[data-debug="${field}"]`);
      if (el) el.textContent = value;
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

    this.container.innerHTML = `
        <div class="debug-top">
          <div class="debug-section">
            <div class="debug-section-title">status</div>
            <div class="debug-row"><span>llm</span><span>${d.llmModel.split("-").slice(0, 2).join("-")}</span></div>
            <div class="debug-row"><span>in tokens</span><span data-debug="in-tokens">${d.inputTokens}</span></div>
            <div class="debug-row"><span>out tokens</span><span data-debug="out-tokens">${d.outputTokens}</span></div>
            <div class="debug-row"><span>cache hits</span><span data-debug="cache-hits">${d.cacheHits}</span></div>
            <div class="debug-row"><span>latency</span><span data-debug="latency">${d.latency}</span></div>
          </div>
          <div class="debug-section">
            <div class="debug-section-title">model</div>
            <div class="debug-row"><span>id</span><span data-debug="session-id">${d.sessionId}</span></div>
            <div class="debug-row"><span>sent</span><span data-debug="sent">${d.sent}</span></div>
            <div class="debug-row"><span>received</span><span data-debug="received">${d.received}</span></div>
            <div class="debug-row"><span>started</span><span data-debug="started">${d.startedAt}</span></div>
            <div class="debug-row"><span>uptime</span><span data-debug="uptime">${d.uptime}</span></div>
          </div>
          <div class="debug-section">
            <div class="debug-section-title">audio</div>
            <div class="debug-row"><span>tts</span>
              <select id="debug-tts-model" class="debug-select">${ttsOptions}</select>
            </div>
            <div class="debug-row"><span>stt</span>
              <select id="debug-stt-model" class="debug-select">${sttOptions}</select>
            </div>
            <div class="debug-row"><span>duration</span><span data-debug="audio-duration">${d.audioDuration}</span></div>
            <div class="debug-row"><span>size</span><span data-debug="audio-size">${d.audioSize}</span></div>
            <div class="debug-row"><span>tts latency</span><span data-debug="tts-latency">${d.ttsLatency}</span></div>
          </div>
        </div>
        <div class="debug-section debug-section--bottom">
          <div class="debug-section-title">
            helmet fx
            <button id="debug-voc-reset" class="debug-reset-btn" title="Restore default settings">reset</button>
          </div>
          ${this.vocoderSlider("dry", "dry_gain", 0, 1, 0.05, "", "Dry voice level. Keep this dominant (0.70-0.90).")}
          ${this.vocoderSlider("wet", "wet_gain", 0, 0.6, 0.05, "", "Processed layer level. Subtle (0.10-0.40).")}
          ${this.vocoderSlider("pitch", "pitch_semitones", 0, 6, 0.5, "st", "Pitch shift on the wet layer. +2 st = classic Quarian tone.")}
          ${this.vocoderSlider("hpf", "hpf", 50, 500, 10, "Hz", "Highpass cutoff on wet layer. Removes low rumble.")}
          ${this.vocoderSlider("lpf", "lpf", 2000, 12000, 100, "Hz", "Lowpass cutoff on wet layer. Radio/helmet roll-off.")}
          ${this.vocoderSlider("notch", "notch", 300, 3000, 50, "Hz", "Notch filter frequency. Helmet cavity resonance.")}
          ${this.vocoderSlider("drive", "drive", 0, 0.3, 0.01, "", "Soft saturation amount. Adds subtle grit.")}
        </div>
      `;
  }

  private vocoderSlider(
    label: string,
    id: keyof HelmetFXParams,
    min: number,
    max: number,
    step: number,
    unit: string,
    tooltip: string,
  ): string {
    const val = this.vocoderParams[id];
    return `
      <div class="debug-row">
        <span title="${tooltip}">${label}</span>
        <span class="debug-value" data-voc-val="${id}">${val}${unit}</span>
        <input type="range" id="debug-voc-${id}" class="debug-range"
          min="${min}" max="${max}" step="${step}" value="${val}" data-unit="${unit}">
      </div>`;
  }
}
