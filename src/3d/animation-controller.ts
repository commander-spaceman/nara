import * as THREE from "three";
import type { AnimationState } from "./animation-state";
import type { LoadedModel } from "./model-loader";

const ANIMATION_STATES: AnimationState[] = [
  "idle",
  "talking",
  "waving",
  "dance",
];

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
    for (const state of ANIMATION_STATES) {
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

    this.currentAction?.stop();

    for (const [, group] of this.modelGroups) {
      group.visible = false;
    }

    const nextGroup = this.modelGroups.get(state)!;
    const nextAction = this.actions.get(state)!;
    nextGroup.visible = true;
    this.currentState = state;
    this.currentAction = nextAction;
    nextAction.reset().play();
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
    this.mixers.clear();
    this.actions.clear();
    this.modelGroups.clear();
    this.currentAction = null;
  }
}
