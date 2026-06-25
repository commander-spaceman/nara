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
  startupGraceMs?: number;
  bufferSize?: number;
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
  private threshold: number;
  private silenceMs: number;
  private minSpeechMs: number;
  private prerollMs: number;
  private maxUtteranceMs: number;
  private startupGraceMs: number;
  private bufferSize: number;

  private stream: MediaStream | null = null;
  private ctx: AudioContext | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private processor: ScriptProcessorNode | null = null;
  private sampleRate = 48000;

  private ring: Float32Array | null = null;
  private ringWrite = 0;
  private ringFilled = 0;

  private utterance: Float32Array[] = [];
  private utteranceLen = 0;

  private graceUntil = 0;
  private running = false;
  private speaking = false;
  private voicedSince: number | null = null;
  private silentSince: number | null = null;

  constructor(events: VadEvents, options: VadOptions = {}) {
    this.events = events;
    this.threshold = options.threshold ?? 0.015;
    this.silenceMs = options.silenceMs ?? 800;
    this.minSpeechMs = options.minSpeechMs ?? 200;
    this.prerollMs = options.prerollMs ?? 1000;
    this.maxUtteranceMs = options.maxUtteranceMs ?? 30000;
    this.startupGraceMs = options.startupGraceMs ?? 800;
    this.bufferSize = options.bufferSize ?? 2048;
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
    this.sampleRate = this.ctx.sampleRate;

    const ringSamples = Math.ceil((this.prerollMs / 1000) * this.sampleRate);
    this.ring = new Float32Array(ringSamples);
    this.ringWrite = 0;
    this.ringFilled = 0;

    this.source = this.ctx.createMediaStreamSource(this.stream);
    this.processor = this.ctx.createScriptProcessor(this.bufferSize, 1, 1);
    this.processor.onaudioprocess = this.onAudio;
    this.source.connect(this.processor);
    this.processor.connect(this.ctx.destination);

    this.running = true;
    this.resetState();
    this.graceUntil = performance.now() + this.startupGraceMs;
    log("▶", GOOD, "listening", DIM, `thr=${this.threshold}`, DIM, `grace=${this.startupGraceMs}ms`);
  }

  pause(): void {
    if (!this.running) return;
    this.running = false;
    this.speaking = false;
    this.resetState();
    this.discardUtterance();
    log("⏸", DIM, "paused");
  }

  resume(): void {
    if (this.running) return;
    if (!this.processor) return;
    this.running = true;
    this.speaking = false;
    this.resetState();
    this.discardUtterance();
    this.ringFilled = 0;
    this.ringWrite = 0;
    this.graceUntil = performance.now() + this.startupGraceMs;
    log("▶", GOOD, "resumed", DIM, `grace=${this.startupGraceMs}ms`);
  }

  stop(): void {
    this.running = false;
    this.speaking = false;
    this.resetState();
    this.discardUtterance();

    if (this.processor) {
      this.processor.onaudioprocess = null;
      this.processor.disconnect();
      this.processor = null;
    }
    this.source?.disconnect();
    this.source = null;
    this.ring = null;

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
  }

  private resetState(): void {
    this.voicedSince = null;
    this.silentSince = null;
  }

  private discardUtterance(): void {
    this.utterance = [];
    this.utteranceLen = 0;
  }

  private onAudio = (e: AudioProcessingEvent): void => {
    if (!this.running || !this.ring) return;
    if (performance.now() < this.graceUntil) return;

    const input = e.inputBuffer.getChannelData(0);
    const frame = new Float32Array(input);
    this.writeRing(frame);

    if (this.speaking) {
      this.utterance.push(frame);
      this.utteranceLen += frame.length;
    }

    const rms = this.computeRms(frame);
    const now = performance.now();

    if (!this.speaking) {
      if (rms > this.threshold) {
        if (this.voicedSince == null) this.voicedSince = now;
        if (now - this.voicedSince >= this.minSpeechMs) {
          this.beginUtterance();
        }
      } else {
        this.voicedSince = null;
      }
    } else {
      if (rms > this.threshold) {
        this.silentSince = null;
      } else {
        if (this.silentSince == null) this.silentSince = now;
        if (now - this.silentSince >= this.silenceMs) {
          this.endUtterance();
          return;
        }
      }
      const maxSamples = (this.maxUtteranceMs / 1000) * this.sampleRate;
      if (this.utteranceLen >= maxSamples) {
        this.endUtterance();
      }
    }
  };

  private beginUtterance(): void {
    this.speaking = true;
    this.silentSince = null;
    const preroll = this.readRing();
    this.utterance = [preroll];
    this.utteranceLen = preroll.length;
    log("●", VAD, "speech start");
    this.events.onSpeechStart();
  }

  private endUtterance(): void {
    this.speaking = false;
    this.voicedSince = null;
    const samples = this.flattenUtterance();
    this.discardUtterance();
    const blob = this.encodeWav(samples, this.sampleRate);
    log("○", VAD, "speech end", DIM, `${(blob.size / 1024).toFixed(0)}KB`);
    this.events.onUtterance(blob);
  }

  private writeRing(frame: Float32Array): void {
    const ring = this.ring!;
    for (let i = 0; i < frame.length; i++) {
      ring[this.ringWrite] = frame[i];
      this.ringWrite = (this.ringWrite + 1) % ring.length;
    }
    this.ringFilled = Math.min(this.ringFilled + frame.length, ring.length);
  }

  private readRing(): Float32Array {
    const ring = this.ring!;
    const out = new Float32Array(this.ringFilled);
    const start = (this.ringWrite - this.ringFilled + ring.length) % ring.length;
    for (let i = 0; i < this.ringFilled; i++) {
      out[i] = ring[(start + i) % ring.length];
    }
    return out;
  }

  private flattenUtterance(): Float32Array {
    const out = new Float32Array(this.utteranceLen);
    let offset = 0;
    for (const frame of this.utterance) {
      out.set(frame, offset);
      offset += frame.length;
    }
    return out;
  }

  private computeRms(frame: Float32Array): number {
    let sum = 0;
    for (let i = 0; i < frame.length; i++) {
      sum += frame[i] * frame[i];
    }
    return Math.sqrt(sum / frame.length);
  }

  private encodeWav(samples: Float32Array, sampleRate: number): Blob {
    const buffer = new ArrayBuffer(44 + samples.length * 2);
    const view = new DataView(buffer);

    const writeString = (offset: number, str: string) => {
      for (let i = 0; i < str.length; i++) {
        view.setUint8(offset + i, str.charCodeAt(i));
      }
    };

    writeString(0, "RIFF");
    view.setUint32(4, 36 + samples.length * 2, true);
    writeString(8, "WAVE");
    writeString(12, "fmt ");
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, 1, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * 2, true);
    view.setUint16(32, 2, true);
    view.setUint16(34, 16, true);
    writeString(36, "data");
    view.setUint32(40, samples.length * 2, true);

    let offset = 44;
    for (let i = 0; i < samples.length; i++) {
      const s = Math.max(-1, Math.min(1, samples[i]));
      view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
      offset += 2;
    }

    return new Blob([buffer], { type: "audio/wav" });
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
