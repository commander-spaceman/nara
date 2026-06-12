import { SubtitleBox } from "../components/subtitle-box";
import { DebugPanel } from "../components/debug-panel";
import { Controls } from "../components/controls";
import { invoke } from "@tauri-apps/api/core";
import { HELMET_DEFAULTS, type HelmetFXParams } from "./audio-fx";

export class AudioPlayer {
  private subtitleBox: SubtitleBox;
  private debugPanel: DebugPanel;
  private controls: Controls;
  private container: HTMLElement;
  private fxParams: HelmetFXParams;

  constructor(
    container: HTMLElement,
    subtitleBox: SubtitleBox,
    debugPanel: DebugPanel,
    controls: Controls,
  ) {
    this.container = container;
    this.subtitleBox = subtitleBox;
    this.debugPanel = debugPanel;
    this.controls = controls;
    this.fxParams = { ...HELMET_DEFAULTS };
  }

  setFXParams(params: HelmetFXParams): void {
    this.fxParams = { ...params };
  }

  async play(arrayBuffer: ArrayBuffer, text: string): Promise<void> {
    let processed: ArrayBuffer;

    try {
      const wav = new Uint8Array(arrayBuffer);
      const result = await invoke<number[]>("quarian_fx", {
        wav: Array.from(wav),
        params: this.fxParams,
      });
      processed = new Uint8Array(result).buffer as ArrayBuffer;
      console.log(
        "[FX] librosa processed | pitch: +" +
          this.fxParams.pitch_semitones +
          " dry:" +
          this.fxParams.dry_gain.toFixed(2) +
          " wet:" +
          this.fxParams.wet_gain.toFixed(2) +
          " hpf:" +
          this.fxParams.hpf +
          " lpf:" +
          this.fxParams.lpf,
      );
    } catch (err) {
      console.error("[FX] librosa failed, using raw audio:", err);
      processed = arrayBuffer;
    }

    const ctx = new AudioContext();
    await ctx.resume();

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
        source.start();
        source.onended = () => {
          if (img) img.classList.remove("talking");
          this.subtitleBox.clear();
          ctx.close();
        };
      },
      (err) => {
        console.error("[TTS] decode error:", err);
        this.controls.setLoading(false);
      },
    );
  }
}
