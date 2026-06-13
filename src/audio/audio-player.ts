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
  private currentCtx: AudioContext | null = null;

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
    if (this.currentCtx) {
      this.currentCtx.close();
      this.currentCtx = null;
    }
    const img = this.container.querySelector(
      ".placeholder-model",
    ) as HTMLElement;
    if (img) img.classList.remove("talking");
    this.subtitleBox.clear();
    this.controls.setLoading(false);
  }

  async play(
    arrayBuffer: ArrayBuffer,
    text: string,
    hint?: AnimationHint,
  ): Promise<void> {
    let processed: ArrayBuffer;

    try {
      const wav = new Uint8Array(arrayBuffer);
      const t0 = performance.now();
      console.log(
        `%c[FX]%c → %c+${this.fxParams.pitch_semitones}st %cdry:%c${this.fxParams.dry_gain.toFixed(2)} %cwet:%c${this.fxParams.wet_gain.toFixed(2)}`,
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
      const ms = (performance.now() - t0).toFixed(0);
      processed = new Uint8Array(result).buffer as ArrayBuffer;
      console.log(
        `%c[FX]%c ← %c${ms}ms %c${(processed.byteLength / 1024).toFixed(0)}KB`,
        "color: #5fdb90; font-weight: bold",
        "color: #888",
        "color: #5fdb90",
        "color: #aaa",
      );
    } catch (err) {
      console.error(
        `%c[FX]%c ✗ %cfallback to raw`,
        "color: #e04444; font-weight: bold",
        "color: #888",
        "color: #e04444",
        err,
      );
      processed = arrayBuffer;
    }

    const ctx = new AudioContext();
    await ctx.resume();
    this.currentCtx = ctx;

    console.log("[TTS] received", processed.byteLength, "bytes");

    ctx.decodeAudioData(
      processed.slice(0),
      (buffer) => {
        console.log(
          "[TTS] decoded",
          buffer.duration.toFixed(1),
          "s",
          buffer.numberOfChannels,
          "ch",
          buffer.sampleRate,
          "Hz",
        );

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
          audioSize: `${(processed.byteLength / 1024).toFixed(0)}KB`,
        });

        const source = ctx.createBufferSource();
        source.buffer = buffer;
        source.connect(ctx.destination);
        this.currentSource = source;
        source.start();
        source.onended = () => {
          if (img) img.classList.remove("talking");
          this.subtitleBox.clear();
          this.currentSource = null;
          this.currentCtx = null;
          ctx.close();
          this.onPlayEnd?.();
        };
      },
      (err) => {
        console.error("[TTS] decode error:", err);
        this.controls.setLoading(false);
        this.currentCtx = null;
      },
    );
  }
}
