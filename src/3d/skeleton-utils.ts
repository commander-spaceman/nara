import type { AnimationClip, AnimationMixer } from "three";
import * as THREE from "three";
import type { LoadedModel } from "./model-loader";

export interface ClipMap {
  [clipName: string]: AnimationClip;
}

export function createAnimationMixer(
  models: Map<string, LoadedModel>,
): AnimationMixer | null {
  for (const model of models.values()) {
    const root = findRootWithAnimations(model.scene);
    if (root && model.animations.length > 0) {
      return new THREE.AnimationMixer(root);
    }
  }
  return null;
}

export function buildClipLookup(
  models: Map<string, LoadedModel>,
  mixer: AnimationMixer | null,
): ClipMap {
  const map: ClipMap = {};
  if (!mixer) return map;

  const allClips: AnimationClip[] = [];
  for (const model of models.values()) {
    allClips.push(...model.animations);
  }

  for (const clip of allClips) {
    const name = cleanClipName(clip.name);
    map[name] = clip;
  }

  return map;
}

function cleanClipName(raw: string): string {
  return raw
    .replace(/mixamo\.com\|?/gi, "")
    .replace(/^\|+/, "")
    .replace(/\|+$/, "")
    .trim();
}

function findRootWithAnimations(obj: THREE.Object3D): THREE.Object3D | null {
  if (obj.type === "SkinnedMesh") return obj;

  const skinned = findSkinnedMesh(obj);
  if (skinned) return obj;

  for (const child of obj.children) {
    const found = findRootWithAnimations(child);
    if (found) return found;
  }
  return null;
}

function findSkinnedMesh(obj: THREE.Object3D): THREE.SkinnedMesh | null {
  if (obj instanceof THREE.SkinnedMesh) return obj;
  for (const child of obj.children) {
    const found = findSkinnedMesh(child);
    if (found) return found;
  }
  return null;
}
