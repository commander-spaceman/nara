import { SubtitleBox } from "./subtitle-box";
import { DebugPanel } from "./debug-panel";
import { Controls } from "./controls";

export class AudioPlayer {
  private subtitleBox: SubtitleBox;
  private debugPanel: DebugPanel;
  private controls: Controls;
  private container: HTMLElement;

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
  }

  async play(arrayBuffer: ArrayBuffer, text: string): Promise<void> {
    const ctx = new AudioContext();
    await ctx.resume();
    console.log("[TTS] received", arrayBuffer.byteLength, "bytes");
    ctx.decodeAudioData(
      arrayBuffer.slice(0),
      (buffer) => {
        console.log("[TTS] playing", buffer.duration.toFixed(1), "s");
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
          audioSize: `${(arrayBuffer.byteLength / 1024).toFixed(0)}KB`,
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
