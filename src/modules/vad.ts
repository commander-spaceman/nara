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

const WORKLET_CODE = `
var rnnoiseReady = false;
var denoiseState = 0;
var tmpIn = 0;
var tmpOut = 0;
var denoiseEnabled = false;

try {
  var rnnoiseModule = createRNNWasmModuleSync();
  denoiseState = rnnoiseModule._rnnoise_create(0);
  tmpIn = rnnoiseModule._malloc(480 * 4);
  tmpOut = rnnoiseModule._malloc(480 * 4);
  rnnoiseReady = true;
  denoiseEnabled = true;
} catch (_) { /* rnnoise unavailable — passthrough */ }

var threshold = 0.015;
var silenceMs = 800;
var minSpeechMs = 200;
var prerollMs = 1000;
var maxUtteranceMs = 30000;
var sampleRate = 48000;

var running = false;
var speaking = false;
var voicedSince = null;
var silentSince = null;

var acc = new Float32Array(480);
var accPos = 0;

var ring = null;
var ringWrite = 0;
var ringFilled = 0;

var utterance = [];
var utteranceLen = 0;

function denoiseFrame(frame) {
  if (!denoiseEnabled || !rnnoiseReady) return frame;
  rnnoiseModule.HEAPF32.set(frame, tmpIn >> 2);
  rnnoiseModule._rnnoise_process_frame(denoiseState, tmpIn, tmpOut);
  return new Float32Array(rnnoiseModule.HEAPF32.buffer, tmpOut, 480);
}

function computeRms(frame) {
  var sum = 0;
  for (var i = 0; i < frame.length; i++) sum += frame[i] * frame[i];
  return Math.sqrt(sum / frame.length);
}

function writeRing(frame) {
  for (var i = 0; i < frame.length; i++) {
    ring[ringWrite] = frame[i];
    ringWrite = (ringWrite + 1) % ring.length;
    ringFilled = Math.min(ringFilled + 1, ring.length);
  }
}

function readRing() {
  var out = new Float32Array(ringFilled);
  var start = (ringWrite - ringFilled + ring.length) % ring.length;
  for (var i = 0; i < ringFilled; i++) out[i] = ring[(start + i) % ring.length];
  return out;
}

function writeUtterance(frame) {
  utterance.push(new Float32Array(frame));
  utteranceLen += frame.length;
}

function flattenUtterance() {
  var out = new Float32Array(utteranceLen);
  var offset = 0;
  for (var i = 0; i < utterance.length; i++) {
    out.set(utterance[i], offset);
    offset += utterance[i].length;
  }
  return out;
}

function discardUtterance() {
  utterance = [];
  utteranceLen = 0;
}

function resetState() {
  voicedSince = null;
  silentSince = null;
}

function encodeWav(samples, sr) {
  var len = samples.length;
  var buf = new ArrayBuffer(44 + len * 2);
  var v = new DataView(buf);
  var write = function(o, s) { for (var i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  write(0, "RIFF");
  v.setUint32(4, 36 + len * 2, true);
  write(8, "WAVE");
  write(12, "fmt ");
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, 1, true);
  v.setUint32(24, sr, true);
  v.setUint32(28, sr * 2, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  write(36, "data");
  v.setUint32(40, len * 2, true);
  var offset = 44;
  for (var i = 0; i < len; i++) {
    var s = Math.max(-1, Math.min(1, samples[i]));
    v.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    offset += 2;
  }
  return buf;
}

function processFrame(frame) {
  var rms = computeRms(frame);
  writeRing(frame);
  if (speaking) writeUtterance(frame);

  var now = performance.now();

  if (!speaking) {
    if (rms > threshold) {
      if (voicedSince == null) voicedSince = now;
      if (now - voicedSince >= minSpeechMs) {
        speaking = true;
        silentSince = null;
        var preroll = readRing();
        utterance = [preroll];
        utteranceLen = preroll.length;
        self.postMessage({ type: "speechStart" });
      }
    } else {
      voicedSince = null;
    }
  } else {
    if (rms > threshold) {
      silentSince = null;
    } else {
      if (silentSince == null) silentSince = now;
      if (now - silentSince >= silenceMs) {
        speaking = false;
        voicedSince = null;
        var samples = flattenUtterance();
        discardUtterance();
        var wav = encodeWav(samples, sampleRate);
        self.postMessage({ type: "utterance", wav: wav }, [wav]);
        return;
      }
    }
    if (utteranceLen >= (maxUtteranceMs / 1000) * sampleRate) {
      speaking = false;
      voicedSince = null;
      var stopSamples = flattenUtterance();
      discardUtterance();
      var stopWav = encodeWav(stopSamples, sampleRate);
      self.postMessage({ type: "utterance", wav: stopWav }, [stopWav]);
    }
  }
}

class VadProcessor extends AudioWorkletProcessor {
  constructor(opts) {
    super();
    if (opts.processorOptions) {
      threshold = opts.processorOptions.threshold ?? threshold;
      silenceMs = opts.processorOptions.silenceMs ?? silenceMs;
      minSpeechMs = opts.processorOptions.minSpeechMs ?? minSpeechMs;
      prerollMs = opts.processorOptions.prerollMs ?? prerollMs;
      maxUtteranceMs = opts.processorOptions.maxUtteranceMs ?? maxUtteranceMs;
      denoiseEnabled = opts.processorOptions.denoise ?? denoiseEnabled;
      sampleRate = opts.processorOptions.sampleRate ?? sampleRate;
    }

    this.port.onmessage = function(e) {
      var msg = e.data;
      if (msg.type === "pause") {
        running = false;
        speaking = false;
        resetState();
        discardUtterance();
      } else if (msg.type === "resume") {
        if (!ring) return;
        running = true;
        speaking = false;
        resetState();
        discardUtterance();
        ringFilled = 0;
        ringWrite = 0;
        accPos = 0;
      } else if (msg.type === "threshold") {
        threshold = msg.value;
      } else if (msg.type === "denoise") {
        denoiseEnabled = msg.enabled && rnnoiseReady;
      } else if (msg.type === "stop") {
        running = false;
        speaking = false;
        resetState();
        discardUtterance();
        if (rnnoiseReady) {
          rnnoiseModule._free(tmpIn);
          rnnoiseModule._free(tmpOut);
          rnnoiseModule._rnnoise_destroy(denoiseState);
          rnnoiseReady = false;
          denoiseState = 0;
        }
      } else if (msg.type === "config") {
        if (msg.threshold != null) threshold = msg.threshold;
        if (msg.silenceMs != null) silenceMs = msg.silenceMs;
        if (msg.minSpeechMs != null) minSpeechMs = msg.minSpeechMs;
        if (msg.denoise != null) denoiseEnabled = msg.denoise && rnnoiseReady;
      }
    };
  }

  process(inputs) {
    var input = inputs[0] ? inputs[0][0] : null;
    if (!input || !running) return true;

    for (var i = 0; i < input.length; i++) {
      acc[accPos++] = input[i];
      if (accPos === 480) {
        var clean = denoiseFrame(acc);
        processFrame(clean);
        accPos = 0;
      }
    }
    return true;
  }
}

registerProcessor("vad-processor", VadProcessor);
`;

export class VadDetector {
  private events: VadEvents;
  private stream: MediaStream | null = null;
  private ctx: AudioContext | null = null;
  private workletNode: AudioWorkletNode | null = null;
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

    const workletUrl = await this.buildWorklet();
    await this.ctx.audioWorklet.addModule(workletUrl);
    URL.revokeObjectURL(workletUrl);

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

  private async buildWorklet(): Promise<string> {
    let rnnoiseSrc = "";
    try {
      const r = await fetch("/rnnoise-sync.js");
      if (r.ok) rnnoiseSrc = await r.text();
    } catch {
      /* offline or missing file — worklet runs without denoising */
    }
    const blob = new Blob([rnnoiseSrc + WORKLET_CODE], {
      type: "application/javascript",
    });
    return URL.createObjectURL(blob);
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
