import { SubtitleBox } from "../components/subtitle-box";
import { DebugPanel } from "../components/debug-panel";
import { Controls } from "../components/controls";
import { invoke } from "@tauri-apps/api/core";
import { HELMET_DEFAULTS, type HelmetFXParams } from "./audio-fx";
import type { AnimationHint } from "../3d/animation-state";

export class AudioPlayer {
  private subtitleBox: SubtitleBox;
  private debugPanel: DebugPanel;
  private controls: Controls;
  private container: HTMLElement;
  private fxParams: HelmetFXParams;
  private onPlayStart?: (hint: AnimationHint) => void;
  private onPlayEnd?: () => void;
  private currentSource: AudioBufferSourceNode | null = null;
  private ctx: AudioContext;

  constructor(
    container: HTMLElement,
    subtitleBox: SubtitleBox,
    debugPanel: DebugPanel,
    controls: Controls,
    onPlayStart?: (hint: AnimationHint) => void,
    onPlayEnd?: () => void,
  ) {
    this.container = container;
    this.subtitleBox = subtitleBox;
    this.debugPanel = debugPanel;
    this.controls = controls;
    this.fxParams = { ...HELMET_DEFAULTS };
    this.onPlayStart = onPlayStart;
    this.onPlayEnd = onPlayEnd;
    this.ctx = new AudioContext();
  }

  setFXParams(params: HelmetFXParams): void {
    this.fxParams = { ...params };
  }

  stop(): void {
    if (this.currentSource) {
      try {
        this.currentSource.stop();
      } catch {
        /* already stopped */
      }
      this.currentSource = null;
    }
    const img = this.container.querySelector(
      ".placeholder-model",
    ) as HTMLElement;
    if (img) img.classList.remove("talking");
    this.subtitleBox.clear();
    this.controls.setLoading(false);
    this.onPlayEnd?.();
  }

  async play(
    arrayBuffer: ArrayBuffer,
    text: string,
    hint?: AnimationHint,
  ): Promise<void> {
    const wav = new Uint8Array(arrayBuffer);
    const header = Array.from(wav.slice(0, 32))
      .map((byte) => byte.toString(16).padStart(2, "0"))
      .join(" ");
    const riff = new TextDecoder().decode(wav.slice(0, 4));
    const wave = new TextDecoder().decode(wav.slice(8, 12));
    console.log(
      `[FX] input ${wav.byteLength}B riff=${riff} wave=${wave} header=${header}`,
    );

    const full = await this.tryFullFx(wav);
    if (full) {
      this.playBuffer(full, text, hint);
      return;
    }

    const fast = await this.tryFastFx(wav);
    if (fast) {
      this.playBuffer(fast, text, hint);
      return;
    }

    console.log(
      `%c[FX]%c → %cfallback to raw`,
      "color: #e04444; font-weight: bold",
      "color: #888",
      "color: #e04444",
    );
    this.playBuffer(arrayBuffer, text, hint);
  }

  private async tryFastFx(wav: Uint8Array): Promise<ArrayBuffer | null> {
    try {
      const t0 = performance.now();
      const fastParams = { ...this.fxParams, pitch_semitones: 0 };
      console.log(
        `%c[FX]%c → fast %cdry:%c${fastParams.dry_gain.toFixed(2)} %cwet:%c${fastParams.wet_gain.toFixed(2)}`,
        "color: #5fdb90; font-weight: bold",
        "color: #888",
        "color: #8ab4f8",
        "color: #888",
        "color: #f0c040",
      );
      const result = await invoke<number[]>("quarian_fx", {
        wav: Array.from(wav),
        params: fastParams,
      });
      const buffer = new Uint8Array(result).buffer as ArrayBuffer;
      const ms = (performance.now() - t0).toFixed(0);
      console.log(
        `%c[FX]%c ← fast %c${ms}ms %c${(buffer.byteLength / 1024).toFixed(0)}KB`,
        "color: #5fdb90; font-weight: bold",
        "color: #888",
        "color: #5fdb90",
        "color: #aaa",
      );
      return buffer;
    } catch (err) {
      console.error(
        `%c[FX]%c ✗ fast failed`,
        "color: #e04444; font-weight: bold",
        "color: #888",
        err,
      );
      return null;
    }
  }

  private async tryFullFx(wav: Uint8Array): Promise<ArrayBuffer | null> {
    try {
      const t0 = performance.now();
      console.log(
        `%c[FX]%c → +${this.fxParams.pitch_semitones}st %cdry:%c${this.fxParams.dry_gain.toFixed(2)} %cwet:%c${this.fxParams.wet_gain.toFixed(2)}`,
        "color: #5fdb90; font-weight: bold",
        "color: #888",
        "color: #d0a0ff",
        "color: #888",
        "color: #8ab4f8",
        "color: #888",
        "color: #f0c040",
      );
      const result = await invoke<number[]>("quarian_fx", {
        wav: Array.from(wav),
        params: this.fxParams,
      });
      const buffer = new Uint8Array(result).buffer as ArrayBuffer;
      const ms = (performance.now() - t0).toFixed(0);
      console.log(
        `%c[FX]%c ← %c${ms}ms %c${(buffer.byteLength / 1024).toFixed(0)}KB`,
        "color: #5fdb90; font-weight: bold",
        "color: #888",
        "color: #5fdb90",
        "color: #aaa",
      );
      return buffer;
    } catch (err) {
      console.error(
        `%c[FX]%c ✗ full failed`,
        "color: #e04444; font-weight: bold",
        "color: #888",
        err,
      );
      return null;
    }
  }

  private playBuffer(
    arrayBuffer: ArrayBuffer,
    text: string,
    hint?: AnimationHint,
  ): void {
    const bytes = new Uint8Array(arrayBuffer);
    const isPcm =
      bytes.length >= 4 &&
      new TextDecoder().decode(bytes.slice(0, 4)) !== "RIFF";

    if (isPcm) {
      this.playPcm(bytes, text, hint);
    } else {
      this.playWav(arrayBuffer, text, hint);
    }
  }

  private playPcm(pcm: Uint8Array, text: string, hint?: AnimationHint): void {
    this.ctx.resume();

    const sampleRate = 24000;
    const numSamples = pcm.length / 2;
    const buffer = this.ctx.createBuffer(1, numSamples, sampleRate);
    const channel = buffer.getChannelData(0);

    for (let i = 0; i < numSamples; i++) {
      const lo = pcm[i * 2];
      const hi = pcm[i * 2 + 1];
      const raw = (hi << 8) | lo;
      channel[i] = raw > 32767 ? (raw - 65536) / 32768 : raw / 32767;
    }

    const duration = numSamples / sampleRate;
    console.log(
      "[TTS] pcm",
      (pcm.byteLength / 1024).toFixed(0),
      "KB",
      duration.toFixed(1),
      "s",
    );

    this.subtitleBox.setText(text);
    this.controls.setLoading(false);
    this.onPlayStart?.(hint ?? "talking");

    const img = this.container.querySelector(
      ".placeholder-model",
    ) as HTMLElement;
    if (img) {
      img.style.setProperty("--talk-duration", `${duration / 32}s`);
      img.classList.add("talking");
    }

    this.debugPanel.update({
      audioDuration: `${duration.toFixed(1)}s`,
      audioSize: `${(pcm.byteLength / 1024).toFixed(0)}KB`,
    });

    const source = this.ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(this.ctx.destination);
    this.currentSource = source;
    source.start();
    source.onended = () => {
      if (img) img.classList.remove("talking");
      this.subtitleBox.clear();
      this.currentSource = null;
      this.onPlayEnd?.();
    };
  }

  private playWav(
    arrayBuffer: ArrayBuffer,
    text: string,
    hint?: AnimationHint,
  ): void {
    this.ctx.resume();

    console.log("[TTS] wav", (arrayBuffer.byteLength / 1024).toFixed(0), "KB");

    this.ctx.decodeAudioData(
      arrayBuffer.slice(0),
      (buffer) => {
        this.subtitleBox.setText(text);
        this.controls.setLoading(false);
        this.onPlayStart?.(hint ?? "talking");

        const img = this.container.querySelector(
          ".placeholder-model",
        ) as HTMLElement;
        if (img) {
          img.style.setProperty("--talk-duration", `${buffer.duration / 32}s`);
          img.classList.add("talking");
        }

        this.debugPanel.update({
          audioDuration: `${buffer.duration.toFixed(1)}s`,
          audioSize: `${(arrayBuffer.byteLength / 1024).toFixed(0)}KB`,
        });

        const source = this.ctx.createBufferSource();
        source.buffer = buffer;
        source.connect(this.ctx.destination);
        this.currentSource = source;
        source.start();
        source.onended = () => {
          if (img) img.classList.remove("talking");
          this.subtitleBox.clear();
          this.currentSource = null;
          this.onPlayEnd?.();
        };
      },
      (err) => {
        console.error("[TTS] decode error:", err);
        this.controls.setLoading(false);
      },
    );
  }
}
