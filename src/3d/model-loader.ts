import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import type { AnimationClip, Group } from "three";

export interface LoadedModel {
  scene: Group;
  animations: AnimationClip[];
}

export interface ModelManifest {
  [name: string]: string;
}

const DEFAULT_MANIFEST: ModelManifest = {
  idle: new URL("../assets/models/Idle.glb", import.meta.url).href,
};

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
      console.warn(`[3d] failed to load model:`, result.reason);
    }
  }

  return loaded;
}
