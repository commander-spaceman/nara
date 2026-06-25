export interface VadEvents {
  onSpeechStart: () => void;
  onUtterance: (blob: Blob) => void;
  onError?: (message: string) => void;
}

export interface VadOptions {
  threshold?: number;
  silenceMs?: number;
  minSpeechMs?: number;
  prerollMs?: number;
  maxUtteranceMs?: number;
  denoise?: boolean;
}

const VAD = "color: #8ab4f8; font-weight: bold";
const DIM = "color: #666";
const GOOD = "color: #5fdb90";
const BAD = "color: #e04444";

function log(tag: string, color: string, ...args: unknown[]) {
  const styles: string[] = [color, DIM];
  let fmt = `%c[vad]%c ${tag}`;
  for (const arg of args) {
    if (typeof arg === "string" && arg.startsWith("color:")) {
      styles.push(arg);
      fmt += "%c";
    } else {
      fmt += ` ${arg}`;
    }
  }
  console.log(fmt, ...styles);
}

export class VadDetector {
  private events: VadEvents;
  private stream: MediaStream | null = null;
  private ctx: AudioContext | null = null;
  private workletNode: AudioWorkletNode | null = null;
  private sink: GainNode | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private running = false;
  private threshold: number;
  private silenceMs: number;
  private minSpeechMs: number;
  private prerollMs: number;
  private maxUtteranceMs: number;
  private denoise: boolean;

  constructor(events: VadEvents, options: VadOptions = {}) {
    this.events = events;
    this.threshold = options.threshold ?? 0.015;
    this.silenceMs = options.silenceMs ?? 800;
    this.minSpeechMs = options.minSpeechMs ?? 200;
    this.prerollMs = options.prerollMs ?? 1000;
    this.maxUtteranceMs = options.maxUtteranceMs ?? 30000;
    this.denoise = options.denoise ?? true;
  }

  async start(): Promise<void> {
    if (this.running) return;

    try {
      this.stream = await this.requestStream();
    } catch (err) {
      const message =
        err instanceof DOMException && err.name === "NotAllowedError"
          ? "mic permission denied"
          : `mic error: ${err}`;
      log("✗", BAD, message);
      this.events.onError?.(message);
      return;
    }

    this.ctx = new AudioContext();
    if (this.ctx.state === "suspended") {
      await this.ctx.resume();
    }
    const sampleRate = this.ctx.sampleRate;

    try {
      await this.ctx.audioWorklet.addModule("/vad-worklet.js");
    } catch (err) {
      const message = `worklet failed to load: ${err}`;
      log("✗", BAD, message);
      this.events.onError?.(message);
      this.ctx.close().catch(() => {});
      this.ctx = null;
      this.stream.getTracks().forEach((t) => t.stop());
      this.stream = null;
      return;
    }

    this.workletNode = new AudioWorkletNode(this.ctx, "vad-processor", {
      processorOptions: {
        threshold: this.threshold,
        silenceMs: this.silenceMs,
        minSpeechMs: this.minSpeechMs,
        prerollMs: this.prerollMs,
        maxUtteranceMs: this.maxUtteranceMs,
        denoise: this.denoise,
        sampleRate,
      },
    });

    this.workletNode.port.onmessage = (e: MessageEvent) => {
      const msg = e.data;
      if (msg.type === "speechStart") {
        this.events.onSpeechStart();
      } else if (msg.type === "utterance") {
        const blob = new Blob([msg.wav], { type: "audio/wav" });
        log("○", VAD, "utterance", DIM, `${(blob.size / 1024).toFixed(0)}KB`);
        this.events.onUtterance(blob);
      }
    };

    this.workletNode.port.onmessageerror = () => {
      log("✗", BAD, "worklet message error");
    };

    this.source = this.ctx.createMediaStreamSource(this.stream);
    this.source.connect(this.workletNode);

    const sink = this.ctx.createGain();
    sink.gain.value = 0;
    this.workletNode.connect(sink);
    sink.connect(this.ctx.destination);
    this.sink = sink;

    this.running = true;
    this.resumeWorklet();
    log(
      "▶",
      GOOD,
      "listening",
      DIM,
      `thr=${this.threshold}`,
      this.denoise ? DIM : "",
      this.denoise ? "rnnoise" : "",
    );
  }

  pause(): void {
    if (!this.running || !this.workletNode) return;
    this.running = false;
    this.workletNode.port.postMessage({ type: "pause" });
    log("⏸", DIM, "paused");
  }

  resume(): void {
    if (this.running) return;
    if (!this.workletNode) return;
    this.resumeWorklet();
  }

  private resumeWorklet(): void {
    this.running = true;
    this.workletNode!.port.postMessage({ type: "resume" });
    log("▶", GOOD, "resumed");
  }

  stop(): void {
    this.running = false;

    if (this.workletNode) {
      this.workletNode.port.postMessage({ type: "stop" });
      this.workletNode.port.onmessage = null;
      this.workletNode.disconnect();
      this.workletNode = null;
    }

    this.source?.disconnect();
    this.source = null;

    this.sink?.disconnect();
    this.sink = null;

    if (this.ctx) {
      this.ctx.close().catch(() => {});
      this.ctx = null;
    }
    if (this.stream) {
      this.stream.getTracks().forEach((t) => t.stop());
      this.stream = null;
    }
    log("■", DIM, "stopped");
  }

  isRunning(): boolean {
    return this.running;
  }

  setThreshold(threshold: number): void {
    this.threshold = threshold;
    this.workletNode?.port.postMessage({ type: "threshold", value: threshold });
  }

  setDenoise(enabled: boolean): void {
    this.denoise = enabled;
    this.workletNode?.port.postMessage({ type: "denoise", enabled });
  }

  private async requestStream(): Promise<MediaStream> {
    try {
      return await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: { ideal: 1 },
          sampleRate: { ideal: 16000 },
          echoCancellation: { ideal: true },
          noiseSuppression: { ideal: true },
        },
      });
    } catch {
      return await navigator.mediaDevices.getUserMedia({ audio: true });
    }
  }
}
