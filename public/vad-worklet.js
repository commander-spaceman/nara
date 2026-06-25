import createRNNWasmModuleSync from "/rnnoise-sync.js";

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
} catch (_) {}

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

var vadPort = null;

function denoiseFrame(frame) {
  if (!denoiseEnabled || !rnnoiseReady) return frame;
  rnnoiseModule.HEAPF32.set(frame, tmpIn >> 2);
  rnnoiseModule._rnnoise_process_frame(denoiseState, tmpOut, tmpIn);
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
  var write = function(o, s) {
    for (var i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i));
  };
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

  var now = currentTime * 1000;

  if (!speaking) {
    if (rms > threshold) {
      if (voicedSince == null) voicedSince = now;
      if (now - voicedSince >= minSpeechMs) {
        speaking = true;
        silentSince = null;
        var preroll = readRing();
        utterance = [preroll];
        utteranceLen = preroll.length;
        vadPort.postMessage({ type: "speechStart" });
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
        vadPort.postMessage({ type: "utterance", wav: wav }, [wav]);
        return;
      }
    }
    if (utteranceLen >= (maxUtteranceMs / 1000) * sampleRate) {
      speaking = false;
      voicedSince = null;
      var stopSamples = flattenUtterance();
      discardUtterance();
      var stopWav = encodeWav(stopSamples, sampleRate);
      vadPort.postMessage({ type: "utterance", wav: stopWav }, [stopWav]);
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

    var ringSamples = Math.ceil((prerollMs / 1000) * sampleRate);
    ring = new Float32Array(ringSamples);
    vadPort = this.port;

    this.port.onmessage = function (e) {
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
