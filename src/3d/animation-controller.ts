import * as THREE from "three";
import { type AnimationState, ANIMATION_KEYS } from "./animation-state";
import type { LoadedModel } from "./model-loader";

export class AnimationController {
  readonly modelGroups = new Map<AnimationState, THREE.Group>();
  readonly mixers = new Map<AnimationState, THREE.AnimationMixer>();
  readonly actions = new Map<AnimationState, THREE.AnimationAction>();

  currentState: AnimationState = "idle";
  currentAction: THREE.AnimationAction | null = null;

  private scene: THREE.Scene;

  constructor(scene: THREE.Scene) {
    this.scene = scene;
  }

  setupIdle(model: LoadedModel): void {
    const group = model.scene;
    this.scene.add(group);
    this.modelGroups.set("idle", group);

    const mixer = new THREE.AnimationMixer(group);
    this.mixers.set("idle", mixer);

    const clip = model.animations[0];
    const action = mixer.clipAction(clip);
    this.actions.set("idle", action);
  }

  setupAdditionalStates(models: Map<string, LoadedModel>): void {
    for (const state of ANIMATION_KEYS) {
      if (state === "idle") continue;
      const model = models.get(state);
      if (!model || model.animations.length === 0) continue;

      const group = model.scene;
      group.visible = false;
      this.scene.add(group);
      this.modelGroups.set(state, group);

      const mixer = new THREE.AnimationMixer(group);
      this.mixers.set(state, mixer);

      const clip = model.animations[0];
      const action = mixer.clipAction(clip);
      this.actions.set(state, action);
    }
  }

  startIdle(): void {
    this.currentAction = this.actions.get("idle") ?? null;
    this.currentAction?.play();
  }

  transitionTo(state: AnimationState): void {
    if (state === this.currentState) return;
    if (!this.modelGroups.has(state)) return;

    const fromGroup = this.modelGroups.get(this.currentState)!;
    const toGroup = this.modelGroups.get(state)!;
    const toAction = this.actions.get(state)!;
    const fromAction = this.actions.get(this.currentState);

    fromAction?.stop();
    fromGroup.visible = false;
    toGroup.visible = true;
    toAction.reset().play();

    console.log(
      `%c[3d]%c switch ${this.currentState} -> ${state}`,
      "color: #5fd0ff; font-weight: bold",
      "color: #ccc",
    );

    this.currentState = state;
    this.currentAction = toAction;
  }

  update(dt: number): void {
    this.mixers.get(this.currentState)?.update(dt);
  }

  getCurrentClip(): THREE.AnimationClip | null {
    return this.currentAction?.getClip() ?? null;
  }

  removeFromScene(): void {
    for (const group of this.modelGroups.values()) {
      this.scene.remove(group);
    }
  }

  dispose(): void {
    for (const [state, action] of this.actions) {
      action.stop();
      this.mixers
        .get(state)
        ?.uncacheAction(action.getClip(), this.modelGroups.get(state));
    }
    for (const [state, mixer] of this.mixers) {
      const group = this.modelGroups.get(state);
      if (group) {
        this.scene.remove(group);
        disposeGroupResources(group);
        mixer.uncacheRoot(group);
      }
    }
    this.mixers.clear();
    this.actions.clear();
    this.modelGroups.clear();
    this.currentAction = null;
  }
}

function disposeGroupResources(group: THREE.Group): void {
  group.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh) return;

    mesh.geometry.dispose();

    const materials = Array.isArray(mesh.material)
      ? mesh.material
      : [mesh.material];
    for (const mat of materials) {
      disposeMaterialTextures(mat);
      mat.dispose();
    }
  });
}

function disposeMaterialTextures(material: THREE.Material): void {
  for (const value of Object.values(material)) {
    if (value instanceof THREE.Texture) {
      value.dispose();
    }
  }
}
