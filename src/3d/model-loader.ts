import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import type { AnimationClip, Group } from "three";
import { ANIMATION_KEYS } from "./animation-state";

export interface LoadedModel {
  scene: Group;
  animations: AnimationClip[];
}

export interface ModelManifest {
  [name: string]: string;
}

function buildManifest(): ModelManifest {
  const manifest: ModelManifest = {};
  for (const key of ANIMATION_KEYS) {
    const filename = key.charAt(0).toUpperCase() + key.slice(1) + ".glb";
    manifest[key] = new URL(
      `../assets/models/${filename}`,
      import.meta.url,
    ).href;
  }
  return manifest;
}

const DEFAULT_MANIFEST: ModelManifest = buildManifest();

export async function loadModels(
  manifest?: Partial<ModelManifest>,
): Promise<Map<string, LoadedModel>> {
  const merged = { ...DEFAULT_MANIFEST, ...manifest };
  const entries = Object.entries(merged).filter(
    (e): e is [string, string] => e[1] !== undefined,
  );
  const loader = new GLTFLoader();
  const loaded = new Map<string, LoadedModel>();

  const results = await Promise.allSettled(
    entries.map(async ([name, url]) => {
      const gltf = await loader.loadAsync(url);
      const scene = gltf.scene;
      return { name, model: { scene, animations: [...gltf.animations] } };
    }),
  );

  for (const result of results) {
    if (result.status === "fulfilled") {
      loaded.set(result.value.name, result.value.model);
    } else {
      console.warn(
        `%c[3d]%c failed to load model "${result.reason?.message ?? result.reason}"`,
        "color: #ff9944; font-weight: bold",
        "color: #ccc",
      );
    }
  }

  return loaded;
}
