import { describe, it, expect, vi, beforeEach } from "vitest";
import { VadDetector } from "../src/modules/vad";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(__dirname, "..");

const mockStream = {
  getTracks: () => [{ stop: vi.fn() }],
} as unknown as MediaStream;

const mockSource = {
  connect: vi.fn(),
  disconnect: vi.fn(),
} as unknown as MediaStreamAudioSourceNode;

const mockSink = {
  connect: vi.fn(),
  disconnect: vi.fn(),
  gain: { value: 0 },
} as unknown as GainNode;

function createMockWorkletNode() {
  const port = {
    postMessage: vi.fn(),
    onmessage: null as ((e: MessageEvent) => void) | null,
    onmessageerror: null as (() => void) | null,
  };
  return {
    port,
    disconnect: vi.fn(),
    connect: vi.fn(),
  };
}

function setupMocks(addModuleBehaviour: "ok" | "fail" = "ok") {
  vi.stubGlobal("navigator", {
    mediaDevices: {
      getUserMedia: vi.fn().mockResolvedValue(mockStream),
    },
  });

  vi.stubGlobal("AudioContext", function (this: Record<string, unknown>) {
    this.state = "suspended";
    this.sampleRate = 44100;
    this.audioWorklet = {
      addModule:
        addModuleBehaviour === "ok"
          ? vi.fn().mockResolvedValue(undefined)
          : vi.fn().mockRejectedValue(new Error("network error")),
    };
    this.createMediaStreamSource = vi.fn().mockReturnValue(mockSource);
    this.createGain = vi.fn().mockReturnValue(mockSink);
    this.resume = vi.fn().mockResolvedValue(undefined);
    this.close = vi.fn().mockResolvedValue(undefined);
    this.createScriptProcessor = vi.fn();
    return this;
  });

  vi.stubGlobal("AudioWorkletNode", function () {
    return createMockWorkletNode();
  });

  vi.stubGlobal("Blob", function (parts: ArrayBuffer[]) {
    return { size: parts[0]?.byteLength ?? 0, type: "audio/wav" };
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

describe("BUG 1: addModule error handling", () => {
  it("start() should call onError instead of throwing when worklet fails to load", async () => {
    setupMocks("fail");

    const onError = vi.fn();
    const detector = new VadDetector({
      onSpeechStart: vi.fn(),
      onUtterance: vi.fn(),
      onError,
    });

    await detector.start();
    expect(onError).toHaveBeenCalledWith(expect.stringContaining("worklet"));
  });
});

describe("BUG 2: startRecording should not lower VAD threshold when VAD enabled", () => {
  it("startRecording guards setThreshold with !this.vadEnabled condition", () => {
    const appSrc = readFileSync(join(root, "src", "components", "app.ts"), "utf-8");

    const hasUnconditionalSetThreshold = /startRecording[^{]*{[^}]*vadDetector\?\s*\.\s*setThreshold/.test(appSrc);
    expect(hasUnconditionalSetThreshold).toBe(true);

    const hasGuard = /if\s*\(\s*!\s*this\s*\.\s*vadEnabled\s*\)/.test(appSrc);
    const nearVadDetector = /startRecording[\s\S]{0,300}if\s*\(\s*!\s*this\s*\.\s*vadEnabled\s*\)[\s\S]{0,80}setThreshold/.test(appSrc);
    expect(hasGuard && nearVadDetector).toBe(true);
  });
});

describe("BUG 3: barge-in should skip pre-roll to avoid capturing Nara's voice", () => {
  it("worklet skips ring pre-roll when threshold is elevated (barge-in mode)", () => {
    const workletSrc = readFileSync(join(root, "public", "vad-worklet.js"), "utf-8");

    const speechStartSection = workletSrc.substring(
      workletSrc.indexOf("speaking = true;"),
      workletSrc.indexOf("speaking = true;") + 150,
    );

    const usesEmptyUtteranceOnBargeIn =
      workletSrc.includes("bargeIn") &&
      /bargeIn[\s\S]{0,100}utterance\s*=\s*\[\]/.test(workletSrc);
    expect(usesEmptyUtteranceOnBargeIn).toBe(true);
  });
});
