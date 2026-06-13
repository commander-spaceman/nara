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
const MANIFEST_PATH = path.join(ROOT, "scripts", "bounds-manifest.json");

await main();

async function main() {
  const manifest = readManifest();
  mkdirSync(BOUNDS_DIR, { recursive: true });
  mkdirSync(CACHE_DIR, { recursive: true });

  const generatedEntries = {};
  for (const entry of manifest.entries) {
    const generated = await generateBoundsFile(entry, manifest);
    generatedEntries[entry.key] = generated;
  }

  writeManifestIndex(manifest.algorithmVersion, generatedEntries);
}

function readManifest() {
  return JSON.parse(readFileSync(MANIFEST_PATH, "utf8"));
}

async function generateBoundsFile(entry, manifest) {
  const modelPath = path.join(MODELS_DIR, entry.model);
  const outputPath = path.join(BOUNDS_DIR, entry.output);
  const sampleCount = entry.sampleCount ?? manifest.defaultSampleCount;
  const glbBuffer = readFileSync(modelPath);
  const modelHash = createHash("sha256")
    .update(glbBuffer)
    .digest("hex")
    .slice(0, 16);
  const cacheKey = `${path.basename(modelPath, ".glb")}.${modelHash}.${manifest.algorithmVersion}.samples-${sampleCount}.json`;
  const cachePath = path.join(CACHE_DIR, cacheKey);

  if (existsSync(cachePath)) {
    copyFileSync(cachePath, outputPath);
    console.log(
      `[bounds] cache hit ${path.basename(modelPath)} -> ${path.relative(ROOT, outputPath)}`,
    );
    return {
      model: entry.model,
      output: `/build/bounds/${entry.output}`,
      sourceHash: modelHash,
      sampleCount,
      animations: entry.animations,
    };
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
  const allowedAnimations = new Set(
    (entry.animations ?? []).map((name) => name.toLowerCase()),
  );
  for (const clip of gltf.animations) {
    const name =
      cleanClipName(clip.name) ||
      path.basename(modelPath, ".glb").toLowerCase();
    if (allowedAnimations.size > 0 && !allowedAnimations.has(name)) continue;
    animations[name] = sampleAnimationEnvelope(
      scene,
      clip,
      name,
      sampleCount,
      manifest.algorithmVersion,
    );
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

  return {
    model: entry.model,
    output: `/build/bounds/${entry.output}`,
    sourceHash: modelHash,
    sampleCount,
    animations: Object.keys(animations),
  };
}

function writeManifestIndex(algorithmVersion, entries) {
  const manifestIndex = {
    generatedAt: new Date().toISOString(),
    algorithmVersion,
    entries,
  };
  writeFileSync(
    path.join(BOUNDS_DIR, "manifest.json"),
    `${JSON.stringify(manifestIndex, null, 2)}\n`,
    "utf8",
  );
}

function sampleAnimationEnvelope(
  scene,
  clip,
  animationName,
  sampleCount,
  algorithmVersion,
) {
  const mixer = new THREE.AnimationMixer(scene);
  const action = mixer.clipAction(clip);
  action.reset();
  action.play();

  const envelope = new THREE.Box3();
  const box = new THREE.Box3();
  const size = new THREE.Vector3();
  const center = new THREE.Vector3();

  for (let i = 0; i <= sampleCount; i++) {
    const time = clip.duration === 0 ? 0 : (clip.duration * i) / sampleCount;
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
    sampleCount,
    algorithmVersion,
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
