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
  fps: string;
  activeAnimation: string;
  boundsMode: string;
  modelPosition: string;
  modelRotation: string;
  modelScale: string;
  meshSize: string;
  frameSize: string;
  clipInfo: string;
  referenceSize: string;
  bboxSize: string;
  bboxCenter: string;
  bboxMin: string;
  bboxMax: string;
}

interface ModelOption {
  id: string;
  label: string;
}

interface DebugPanelCallbacks {
  onTtsModelChange: (model: string) => void;
  onSttModelChange: (model: string) => void;
  onVocoderChange: (params: HelmetFXParams) => void;
  onModelGuidesToggle: (visible: boolean) => void;
  onModelHeavyBoundsToggle: (enabled: boolean) => void;
}

export class DebugPanel {
  private container: HTMLElement;
  private modalContainer: HTMLElement;
  private data: DebugData;
  private vocoderParams: HelmetFXParams;
  private visibility: "expanded" | "out" = "out";
  private helmetFxVisible = false;
  private ttsModels: ModelOption[];
  private sttModels: ModelOption[];
  private callbacks: DebugPanelCallbacks;
  private modelGuidesVisible = true;
  private modelHeavyBoundsEnabled = false;

  constructor(
    container: HTMLElement,
    modalContainer: HTMLElement,
    callbacks: DebugPanelCallbacks,
    ttsModels: ModelOption[],
    sttModels: ModelOption[],
    initialTtsModel: string,
    initialSttModel: string,
  ) {
    this.container = container;
    this.modalContainer = modalContainer;
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
      fps: "-",
      activeAnimation: "-",
      boundsMode: "normal",
      modelPosition: "-",
      modelRotation: "-",
      modelScale: "-",
      meshSize: "-",
      frameSize: "-",
      clipInfo: "-",
      referenceSize: "-",
      bboxSize: "-",
      bboxCenter: "-",
      bboxMin: "-",
      bboxMax: "-",
    };
  }

  mount(): void {
    this.render();
    this.renderHelmetFxModal();
    document.addEventListener("keydown", this.onKeyDown);
    this.bindEvents();
    this.bindHelmetFxEvents();
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

  toggleHelmetFxModal(): void {
    this.helmetFxVisible = !this.helmetFxVisible;
    this.renderHelmetFxModal();
    this.bindHelmetFxEvents();
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
      return;
    }
    if (e.key === "v" && e.ctrlKey === false && e.metaKey === false) {
      e.preventDefault();
      this.toggleHelmetFxModal();
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
    const guidesToggle = this.container.querySelector(
      "#debug-model-guides",
    ) as HTMLInputElement | null;
    if (guidesToggle) {
      guidesToggle.addEventListener("change", () => {
        this.modelGuidesVisible = guidesToggle.checked;
        this.callbacks.onModelGuidesToggle(this.modelGuidesVisible);
        if (!this.modelGuidesVisible) {
          this.modelHeavyBoundsEnabled = false;
          this.callbacks.onModelHeavyBoundsToggle(false);
        }
        this.render();
        this.bindEvents();
      });
    }
    const boundsModeSelect = this.container.querySelector(
      "#debug-bounds-mode",
    ) as HTMLSelectElement | null;
    if (boundsModeSelect) {
      boundsModeSelect.addEventListener("change", () => {
        this.modelHeavyBoundsEnabled = boundsModeSelect.value === "heavy";
        this.callbacks.onModelHeavyBoundsToggle(this.modelHeavyBoundsEnabled);
      });
    }
  }

  private bindHelmetFxEvents(): void {
    const close = this.modalContainer.querySelector(
      "#helmet-fx-close",
    ) as HTMLElement | null;
    if (close) {
      close.onclick = () => {
        this.helmetFxVisible = false;
        this.renderHelmetFxModal();
      };
    }

    this.modalContainer.onclick = (e) => {
      if (e.target === this.modalContainer) {
        this.helmetFxVisible = false;
        this.renderHelmetFxModal();
      }
    };

    const resetBtn = this.modalContainer.querySelector(
      "#debug-voc-reset",
    ) as HTMLButtonElement | null;
    if (resetBtn) {
      resetBtn.addEventListener("click", () => {
        this.vocoderParams = { ...HELMET_DEFAULTS };
        this.callbacks.onVocoderChange({ ...this.vocoderParams });
        this.renderHelmetFxModal();
        this.bindHelmetFxEvents();
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
      const input = this.modalContainer.querySelector(
        `#debug-voc-${id}`,
      ) as HTMLInputElement | null;
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
          const display = this.modalContainer.querySelector(
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
      fps: this.data.fps,
      "active-animation": this.data.activeAnimation,
      "model-position": this.data.modelPosition,
      "model-rotation": this.data.modelRotation,
      "model-scale": this.data.modelScale,
      "mesh-size": this.data.meshSize,
      "frame-size": this.data.frameSize,
      "clip-info": this.data.clipInfo,
      "reference-size": this.data.referenceSize,
      "bbox-size": this.data.bboxSize,
      "bbox-center": this.data.bboxCenter,
      "bbox-min": this.data.bboxMin,
      "bbox-max": this.data.bboxMax,
    };
    for (const [field, value] of Object.entries(fields)) {
      const el = this.container.querySelector(`[data-debug="${field}"]`);
      if (el) el.textContent = value;
    }
    const boundsModeSelect = this.container.querySelector(
      "#debug-bounds-mode",
    ) as HTMLSelectElement | null;
    if (boundsModeSelect) {
      boundsModeSelect.value = this.modelHeavyBoundsEnabled
        ? "heavy"
        : "normal";
      boundsModeSelect.disabled = !this.modelGuidesVisible;
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
    const boundsModeOptions = ["normal", "heavy"]
      .map(
        (mode) =>
          `<option value="${mode}" ${mode === d.boundsMode ? "selected" : ""}>${mode}</option>`,
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
          <div class="debug-section-title">model 3d</div>
          <div class="debug-model-columns">
            <div class="debug-model-column">
              ${this.debugField("fps", "fps", d.fps, "Current render frames per second.")}
              ${this.debugField("anim", "active-animation", d.activeAnimation, "Current active animation clip.")}
              ${this.debugField("position", "model-position", d.modelPosition, "Model world position on the X, Y, and Z axes.")}
              ${this.debugField("rotation", "model-rotation", d.modelRotation, "Model rotation on the X, Y, and Z axes.")}
              ${this.debugField("scale", "model-scale", d.modelScale, "Uniform scale factor applied to the model.")}
              ${this.debugSwitch("guides", "debug-model-guides", this.modelGuidesVisible, "Show or hide the scene background and bounds overlays.")}
            </div>
            <div class="debug-model-column debug-model-column--bounds">
              <div class="debug-row">
                <span title="Select the bounds rendering mode.">bounds mode</span>
                <select id="debug-bounds-mode" class="debug-select" ${this.modelGuidesVisible ? "" : "disabled"}>${boundsModeOptions}</select>
              </div>
              ${this.debugField("frame", "frame-size", d.frameSize, "Projected on-screen frame size in pixels.")}
              ${this.debugField("bbox size", "bbox-size", d.bboxSize, "Bounding box size across X, Y, and Z.")}
              ${this.debugField("bbox ctr", "bbox-center", d.bboxCenter, "Bounding box center point.")}
              ${this.debugField("bbox min", "bbox-min", d.bboxMin, "Bounding box minimum corner.")}
              ${this.debugField("bbox max", "bbox-max", d.bboxMax, "Bounding box maximum corner.")}
            </div>
          </div>
        </div>
      `;
  }

  private debugField(
    label: string,
    key: string,
    value: string,
    tooltip: string,
  ): string {
    return `<div class="debug-row"><span title="${tooltip}">${label}</span><span data-debug="${key}">${value}</span></div>`;
  }

  private debugSwitch(
    label: string,
    id: string,
    checked: boolean,
    tooltip: string,
  ): string {
    return `
      <label class="debug-row debug-row--switch" title="${tooltip}">
        <span>${label}</span>
        <span class="debug-switch-wrap">
          <input
            id="${id}"
            class="debug-switch-input"
            type="checkbox"
            ${checked ? "checked" : ""}
          >
          <span class="debug-switch" aria-hidden="true"></span>
        </span>
      </label>
    `;
  }

  private renderHelmetFxModal(): void {
    this.modalContainer.classList.toggle("hidden", !this.helmetFxVisible);
    this.modalContainer.innerHTML = `
      <div id="helmet-fx-box" class="modal-box modal-box--wide">
        <div class="modal-header">
          <div class="modal-title">helmet fx</div>
          <button id="helmet-fx-close" class="modal-close-btn" aria-label="Close helmet fx modal">&times;</button>
        </div>
        <div class="modal-content modal-content--compact">
          <div class="debug-section debug-section--modal">
            <div class="debug-modal-toolbar">
              <div class="debug-hint">press <span>v</span> to close</div>
              <button id="debug-voc-reset" class="debug-reset-btn" title="Restore default settings">reset</button>
            </div>
            <div class="debug-modal-grid">
              ${this.vocoderSlider("dry", "dry_gain", 0, 1, 0.05, "", "Dry voice level. Keep this dominant (0.70-0.90).")}
              ${this.vocoderSlider("wet", "wet_gain", 0, 0.6, 0.05, "", "Processed layer level. Subtle (0.10-0.40).")}
              ${this.vocoderSlider("pitch", "pitch_semitones", 0, 6, 0.5, "st", "Pitch shift on the wet layer. +2 st = classic Quarian tone.")}
              ${this.vocoderSlider("hpf", "hpf", 50, 500, 10, "Hz", "Highpass cutoff on wet layer. Removes low rumble.")}
              ${this.vocoderSlider("lpf", "lpf", 2000, 12000, 100, "Hz", "Lowpass cutoff on wet layer. Radio/helmet roll-off.")}
              ${this.vocoderSlider("notch", "notch", 300, 3000, 50, "Hz", "Notch filter frequency. Helmet cavity resonance.")}
              ${this.vocoderSlider("drive", "drive", 0, 0.3, 0.01, "", "Soft saturation amount. Adds subtle grit.")}
            </div>
          </div>
        </div>
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
      <div class="debug-row debug-row--modal">
        <div class="debug-row-meta">
          <span class="debug-row-label" title="${tooltip}">${label}</span>
          <span class="debug-value" data-voc-val="${id}">${val}${unit}</span>
        </div>
        <div class="debug-row-control">
          <input type="range" id="debug-voc-${id}" class="debug-range"
            min="${min}" max="${max}" step="${step}" value="${val}" data-unit="${unit}">
        </div>
      </div>`;
  }
}
