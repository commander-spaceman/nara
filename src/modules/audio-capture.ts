export type RecordingState = "idle" | "recording" | "stopped";

export interface AudioCaptureEvents {
  onStateChange: (state: RecordingState) => void;
  onElapsed: (ms: number) => void;
  onError: (message: string) => void;
}

const MIC = "color: #f0c040; font-weight: bold";
const DIM = "color: #666";
const GOOD = "color: #5fdb90";
const BAD = "color: #e04444";

function log(tag: string, color: string, ...args: unknown[]) {
  const styles: string[] = [color, DIM];
  let fmt = `%c[mic]%c ${tag}`;
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

export class AudioCapture {
  private stream: MediaStream | null = null;
  private recorder: MediaRecorder | null = null;
  private chunks: Blob[] = [];
  private state: RecordingState = "idle";
  private events: AudioCaptureEvents;
  private startTime = 0;
  private elapsedTimer: ReturnType<typeof setInterval> | null = null;
  private savedBlob: Blob | null = null;
  private deviceChangeHandler: (() => void) | null = null;

  constructor(events: AudioCaptureEvents) {
    this.events = events;
    this.listenDeviceChanges();
  }

  destroy(): void {
    if (this.deviceChangeHandler) {
      navigator.mediaDevices.removeEventListener(
        "devicechange",
        this.deviceChangeHandler,
      );
      this.deviceChangeHandler = null;
    }
    this.cleanup();
  }

  private listenDeviceChanges(): void {
    this.deviceChangeHandler = () => {
      log("↻", DIM, "audio devices changed");
    };
    navigator.mediaDevices.addEventListener(
      "devicechange",
      this.deviceChangeHandler,
    );
  }

  async start(): Promise<void> {
    if (this.state === "recording") return;
    if (this.state === "stopped") {
      this.savedBlob = null;
      this.chunks = [];
      this.setState("idle");
    }
    if (this.state !== "idle") return;

    try {
      this.stream = await this.requestStream();
    } catch (err) {
      const message =
        err instanceof DOMException && err.name === "NotAllowedError"
          ? "mic permission denied"
          : `mic error: ${err}`;
      log("✗", BAD, message);
      this.events.onError(message);
      return;
    }

    this.chunks = [];
    this.savedBlob = null;

    const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
      ? "audio/webm;codecs=opus"
      : "audio/webm";

    this.recorder = new MediaRecorder(this.stream!, {
      mimeType,
      audioBitsPerSecond: 32000,
    });

    this.recorder.ondataavailable = (e) => {
      if (e.data.size > 0) this.chunks.push(e.data);
    };

    this.recorder.onerror = () => {
      log("✗", BAD, "MediaRecorder error");
      this.events.onError("recording error");
      this.stop();
    };

    this.recorder.onstop = () => {
      if (this.chunks.length > 0) {
        this.savedBlob = new Blob(this.chunks, {
          type: this.recorder!.mimeType,
        });
        const elapsed = Date.now() - this.startTime;
        log(
          "■",
          MIC,
          `${(this.savedBlob.size / 1024).toFixed(0)}KB`,
          DIM,
          `${elapsed}ms`,
          DIM,
          `${this.chunks.length} chunks`,
        );
      }
      this.cleanup();
      if (this.chunks.length > 0) {
        this.setState("stopped");
      } else {
        this.setState("idle");
      }
    };

    this.recorder.start(250);
    this.startTime = Date.now();
    this.setState("recording");

    log("▶", GOOD, "recording", MIC, mimeType.split(";")[0]);

    this.elapsedTimer = setInterval(() => {
      const elapsed = Date.now() - this.startTime;
      this.events.onElapsed(elapsed);
    }, 100);
  }

  private async requestStream(): Promise<MediaStream> {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: { ideal: 1 },
          sampleRate: { ideal: 16000 },
          echoCancellation: { ideal: true },
          noiseSuppression: { ideal: true },
        },
      });
      this.attachTrackEnded(stream);
      return stream;
    } catch {
      log("!", DIM, "retrying with relaxed constraints");
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
      });
      this.attachTrackEnded(stream);
      return stream;
    }
  }

  private attachTrackEnded(stream: MediaStream): void {
    stream.getAudioTracks().forEach((track) => {
      track.onended = () => {
        if (this.state === "recording") {
          log("✗", BAD, "mic disconnected");
          this.events.onError("microphone disconnected");
          this.cancel();
        }
      };
    });
  }

  stop(): void {
    if (this.state !== "recording" || !this.recorder) return;

    this.recorder.requestData();

    if (this.recorder.state === "recording") {
      this.recorder.stop();
    }
  }

  cancel(): void {
    if (this.state !== "recording" || !this.recorder) return;

    this.chunks = [];
    this.savedBlob = null;

    if (this.recorder.state === "recording") {
      this.recorder.stop();
    }
  }

  getBlob(): Blob | null {
    return this.savedBlob;
  }

  getState(): RecordingState {
    return this.state;
  }

  private setState(state: RecordingState): void {
    this.state = state;
    this.events.onStateChange(state);
  }

  private cleanup(): void {
    if (this.elapsedTimer) clearInterval(this.elapsedTimer);
    this.elapsedTimer = null;

    if (this.stream) {
      this.stream.getTracks().forEach((t) => t.stop());
      this.stream = null;
    }
    this.recorder = null;
  }
}
