import { createHash } from "node:crypto";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const MODELS_DIR = path.join(ROOT, "src", "assets", "models");
const BOUNDS_DIR = path.join(ROOT, "build", "bounds");
const CACHE_DIR = path.join(BOUNDS_DIR, "cache");
const ALGORITHM_VERSION = "bounds-envelope-v1";
const SAMPLE_COUNT = 24;

const MANIFEST = [
  {
    modelPath: path.join(MODELS_DIR, "Idle.glb"),
    outputPath: path.join(BOUNDS_DIR, "Idle.bounds.json"),
  },
];

await main();

async function main() {
  mkdirSync(BOUNDS_DIR, { recursive: true });
  mkdirSync(CACHE_DIR, { recursive: true });

  for (const entry of MANIFEST) {
    await generateBoundsFile(entry.modelPath, entry.outputPath);
  }
}

async function generateBoundsFile(modelPath, outputPath) {
  const glbBuffer = readFileSync(modelPath);
  const modelHash = createHash("sha256")
    .update(glbBuffer)
    .digest("hex")
    .slice(0, 16);
  const cacheKey = `${path.basename(modelPath, ".glb")}.${modelHash}.${ALGORITHM_VERSION}.samples-${SAMPLE_COUNT}.json`;
  const cachePath = path.join(CACHE_DIR, cacheKey);

  if (existsSync(cachePath)) {
    copyFileSync(cachePath, outputPath);
    console.log(
      `[bounds] cache hit ${path.basename(modelPath)} -> ${path.relative(ROOT, outputPath)}`,
    );
    return;
  }

  const loader = new GLTFLoader();
  const gltf = await loader.parseAsync(
    glbBuffer.buffer.slice(
      glbBuffer.byteOffset,
      glbBuffer.byteOffset + glbBuffer.byteLength,
    ),
    new URL(`file:///${MODELS_DIR.replace(/\\/g, "/")}/`).href,
  );

  const scene = gltf.scene;
  scene.updateWorldMatrix(true, true);

  const animations = {};
  for (const clip of gltf.animations) {
    const name =
      cleanClipName(clip.name) ||
      path.basename(modelPath, ".glb").toLowerCase();
    animations[name] = sampleAnimationEnvelope(scene, clip, name);
  }

  const metadata = {
    model: path.basename(modelPath),
    generatedAt: new Date().toISOString(),
    sourceHash: modelHash,
    animations,
  };

  const json = `${JSON.stringify(metadata, null, 2)}\n`;
  writeFileSync(outputPath, json, "utf8");
  writeFileSync(cachePath, json, "utf8");

  console.log(`[bounds] generated ${path.relative(ROOT, outputPath)}`);
}

function sampleAnimationEnvelope(scene, clip, animationName) {
  const mixer = new THREE.AnimationMixer(scene);
  const action = mixer.clipAction(clip);
  action.reset();
  action.play();

  const envelope = new THREE.Box3();
  const box = new THREE.Box3();
  const size = new THREE.Vector3();
  const center = new THREE.Vector3();

  for (let i = 0; i <= SAMPLE_COUNT; i++) {
    const time = clip.duration === 0 ? 0 : (clip.duration * i) / SAMPLE_COUNT;
    mixer.setTime(time);
    scene.updateWorldMatrix(true, true);
    box.setFromObject(scene, true);
    envelope.union(box);
  }

  envelope.getSize(size);
  envelope.getCenter(center);
  mixer.stopAllAction();

  return {
    animation: animationName,
    sampleCount: SAMPLE_COUNT,
    algorithmVersion: ALGORITHM_VERSION,
    box: {
      min: vec3(envelope.min),
      max: vec3(envelope.max),
    },
    center: vec3(center),
    size: vec3(size),
  };
}

function vec3(v) {
  return [round(v.x), round(v.y), round(v.z)];
}

function round(n) {
  return Number(n.toFixed(6));
}

function cleanClipName(raw) {
  return raw
    .replace(/mixamo\.com\|?/gi, "")
    .replace(/^\|+/, "")
    .replace(/\|+$/, "")
    .trim()
    .toLowerCase();
}
