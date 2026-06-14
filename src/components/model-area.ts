import {
  SceneManager,
  createResizeHandler,
  getAnimationBounds,
  loadBoundsMetadata,
  loadModels,
  type AnimationBoundsData,
  type AnimationHint,
  type AnimationState,
  type ModelBoundsMetadata,
} from "../3d";
import * as THREE from "three";
import quarianPlaceholder from "../assets/quarian.png";

const MARGIN = 0.88;
const FRAME_PADDING_X = 0.06;
const FRAME_PADDING_Y = 0.05;
const MIN_FRAME_PADDING_PX = 8;

type BoundsMode = "normal" | "heavy";
type AnimationKey = "idle" | "talking" | "waving" | "dance";

const ANIMATION_STATES: AnimationState[] = [
  "idle",
  "talking",
  "waving",
  "dance",
];

export interface ModelDebugSnapshot {
  fps: number | null;
  activeAnimation: string;
  boundsMode: string;
  position: [number, number, number] | null;
  rotation: [number, number, number] | null;
  scale: [number, number, number] | null;
  modelSize: [number, number, number] | null;
  projectedFrame: { width: number; height: number } | null;
  clipDuration: number | null;
  clipFrames: number | null;
  trackCount: number | null;
  fitReferenceSize: [number, number, number] | null;
  boundingBoxSize: [number, number, number] | null;
  boundingBoxCenter: [number, number, number] | null;
  boundingBoxMin: [number, number, number] | null;
  boundingBoxMax: [number, number, number] | null;
}

export class ModelArea {
  private container: HTMLElement;
  private sceneManager: SceneManager | null = null;
  private removeResize: (() => void) | null = null;

  private modelGroups = new Map<AnimationState, THREE.Group>();
  private mixers = new Map<AnimationState, THREE.AnimationMixer>();
  private actions = new Map<AnimationState, THREE.AnimationAction>();
  private currentState: AnimationState = "idle";
  private currentAction: THREE.AnimationAction | null = null;

  private crosshair: THREE.Group | null = null;
  private boundingBox: THREE.Line | null = null;
  private boundingVolume = new THREE.Box3();
  private boundingBoxHelper: THREE.Box3Helper | null = null;

  private fitScale = 1;
  private activeAnimation: AnimationKey = "idle";
  private fitReferenceCenter = new THREE.Vector3();
  private fitReferenceSize = new THREE.Vector3();
  private boundsMode: BoundsMode = "normal";
  private boundsMetadata = new Map<string, ModelBoundsMetadata>();
  private lastSnapshotTime = performance.now();
  private snapshotFrames = 0;
  private currentFps = 0;

  private onDebugSnapshot?: (snapshot: ModelDebugSnapshot) => void;

  constructor(
    container: HTMLElement,
    onDebugSnapshot?: (snapshot: ModelDebugSnapshot) => void,
  ) {
    this.container = container;
    this.onDebugSnapshot = onDebugSnapshot;
  }

  async mount(): Promise<void> {
    this.container.innerHTML = "";
    document.addEventListener("keydown", this.onKeyDown);

    const sceneManager = new SceneManager();
    this.sceneManager = sceneManager;
    this.container.appendChild(sceneManager.canvas);

    this.removeResize = createResizeHandler(this.container, () => {
      this.fitModelToContainer();
    });

    try {
      const [models, boundsMetadata] = await Promise.all([
        loadModels(),
        loadBoundsMetadata(),
      ]);
      this.boundsMetadata = boundsMetadata;

      const idleModel = models.get("idle");
      if (!idleModel || idleModel.animations.length === 0) {
        this.showFallback();
        return;
      }

      this.setupDebugObjects(sceneManager);
      this.setupModel(sceneManager, idleModel);
      this.setupAdditionalModels(sceneManager, models);
      this.startIdleClip();
      this.mixer("idle")!.update(0);
      this.modelGroup("idle")!.updateWorldMatrix(true, true);
      this.updateFitReference();
      this.fitModelToContainer();
    } catch {
      this.showFallback();
    }

    this.lastSnapshotTime = performance.now();
    this.snapshotFrames = 0;
    sceneManager.start((dt) => {
      this.mixer(this.currentState)?.update(dt);
      if (this.boundsMode === "heavy") {
        this.updateDebugBounds();
      }
      this.snapshotFrames++;
      const now = performance.now();
      if (now - this.lastSnapshotTime >= 1000) {
        this.currentFps = Math.round(
          this.snapshotFrames / ((now - this.lastSnapshotTime) / 1000),
        );
        this.snapshotFrames = 0;
        this.lastSnapshotTime = now;
        this.emitDebugSnapshot();
      }
    });
  }

  startSpeaking(hint: AnimationHint): void {
    this.transitionTo(hint);
  }

  stopSpeaking(): void {
    this.transitionTo("idle");
  }

  private transitionTo(state: AnimationState): void {
    if (!this.sceneManager || state === this.currentState) return;
    if (!this.modelGroups.has(state)) return;

    this.currentAction?.stop();

    for (const [s, group] of this.modelGroups) {
      group.visible = s === state;
    }

    this.currentState = state;
    this.currentAction = this.actions.get(state) ?? null;
    this.currentAction?.reset().play();
    this.activeAnimation = state;
    this.updateFitReference();
    if (this.boundsMode === "normal") {
      this.updateNormalBounds();
    }
  }

  private mixer(state: AnimationState): THREE.AnimationMixer | undefined {
    return this.mixers.get(state);
  }

  private modelGroup(state: AnimationState): THREE.Group | undefined {
    return this.modelGroups.get(state);
  }

  private setupModel(
    sceneManager: SceneManager,
    model: { scene: THREE.Group; animations: THREE.AnimationClip[] },
  ): void {
    const group = model.scene;
    sceneManager.scene.add(group);
    this.modelGroups.set("idle", group);

    const mixer = new THREE.AnimationMixer(group);
    this.mixers.set("idle", mixer);

    const clip = model.animations[0];
    const action = mixer.clipAction(clip);
    this.actions.set("idle", action);
  }

  private setupAdditionalModels(
    sceneManager: SceneManager,
    models: Map<
      string,
      { scene: THREE.Group; animations: THREE.AnimationClip[] }
    >,
  ): void {
    for (const state of ANIMATION_STATES) {
      if (state === "idle") continue;
      const model = models.get(state);
      if (!model || model.animations.length === 0) continue;

      const group = model.scene;
      group.visible = false;
      sceneManager.scene.add(group);
      this.modelGroups.set(state, group);

      const mixer = new THREE.AnimationMixer(group);
      this.mixers.set(state, mixer);

      const clip = model.animations[0];
      const action = mixer.clipAction(clip);
      this.actions.set(state, action);
    }
  }

  private startIdleClip(): void {
    this.currentAction = this.actions.get("idle") ?? null;
    this.currentAction?.play();
  }

  private fitModelToContainer(): void {
    if (!this.sceneManager) return;

    const { clientWidth: w, clientHeight: h } = this.container;
    if (!w || !h) return;

    const camera = this.sceneManager.camera;
    this.sceneManager.setSize(w, h);

    const fovRad = camera.fov * (Math.PI / 180);
    const dist = camera.position.distanceTo(new THREE.Vector3(0, 0, 0));
    const visibleHeight = 2 * dist * Math.tan(fovRad / 2);
    const visibleWidth = visibleHeight * (w / h);

    const fitW = visibleWidth * MARGIN;
    const fitH = visibleHeight * MARGIN;

    const sx = this.fitReferenceSize.x > 0 ? fitW / this.fitReferenceSize.x : 1;
    const sy = this.fitReferenceSize.y > 0 ? fitH / this.fitReferenceSize.y : 1;
    this.fitScale = Math.min(sx, sy);

    for (const [, group] of this.modelGroups) {
      group.scale.setScalar(this.fitScale);
      group.position
        .copy(this.fitReferenceCenter)
        .multiplyScalar(-this.fitScale);
      group.updateWorldMatrix(true, true);
    }

    const framingTarget = new THREE.Vector3(0, 0, 0);
    camera.lookAt(framingTarget);
    camera.updateMatrixWorld();
    this.crosshair?.position.copy(framingTarget);

    if (this.boundsMode === "heavy") {
      this.updateDebugBounds();
    } else {
      this.updateNormalBounds();
    }
  }

  private onKeyDown = (e: KeyboardEvent): void => {
    const tag = (e.target as HTMLElement).tagName;
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
    if (e.key === "h" && e.ctrlKey === false && e.metaKey === false) {
      e.preventDefault();
      this.boundsMode = this.boundsMode === "normal" ? "heavy" : "normal";
      this.applyBoundsMode();
      console.log(
        `%c[3d]%c bounds mode: ${this.boundsMode}`,
        "color: #5fd0ff; font-weight: bold",
        "color: #ccc",
      );
      if (this.boundsMode === "heavy") {
        this.updateDebugBounds();
      } else {
        this.updateNormalBounds();
      }
    }
  };

  private applyBoundsMode(): void {
    const debugVisible = this.boundsMode === "heavy";
    if (this.crosshair) {
      this.crosshair.visible = debugVisible;
    }
    if (this.boundingBox) {
      this.boundingBox.visible = true;
    }
    if (this.boundingBoxHelper) {
      this.boundingBoxHelper.visible = debugVisible;
    }
  }

  private getActiveAnimationBounds(): AnimationBoundsData | null {
    const meta = this.boundsMetadata.get(this.activeAnimation);
    return getAnimationBounds(meta, this.activeAnimation);
  }

  private updateFitReference(): void {
    const activeBounds = this.getActiveAnimationBounds();
    if (activeBounds) {
      this.fitReferenceCenter.fromArray(activeBounds.center);
      this.fitReferenceSize.fromArray(activeBounds.size);
      return;
    }

    const idleGroup = this.modelGroup("idle");
    if (!idleGroup) return;

    const referenceBox = new THREE.Box3().setFromObject(idleGroup, true);
    referenceBox.getCenter(this.fitReferenceCenter);
    referenceBox.getSize(this.fitReferenceSize);
  }

  private updateNormalBounds(): void {
    if (!this.sceneManager || !this.boundingBox) return;

    const group = this.modelGroup(this.currentState);
    if (!group) return;

    const activeBounds = this.getActiveAnimationBounds();

    if (activeBounds) {
      const localMin = new THREE.Vector3().fromArray(activeBounds.box.min);
      const localMax = new THREE.Vector3().fromArray(activeBounds.box.max);
      const scale = group.scale.x;
      const worldMin = localMin.multiplyScalar(scale).add(group.position);
      const worldMax = localMax.multiplyScalar(scale).add(group.position);
      this.boundingVolume.min.copy(worldMin);
      this.boundingVolume.max.copy(worldMax);
    } else {
      const scale = group.scale.x;
      const worldCenter = this.fitReferenceCenter
        .clone()
        .multiplyScalar(scale)
        .add(group.position);
      const halfSize = this.fitReferenceSize
        .clone()
        .multiplyScalar(scale * 0.5);
      this.boundingVolume.min.copy(worldCenter).sub(halfSize);
      this.boundingVolume.max.copy(worldCenter).add(halfSize);
    }

    this.updateBoundsRectangle(this.boundingVolume);
  }

  private updateDebugBounds(): void {
    const group = this.modelGroup(this.currentState);
    if (!group || !this.sceneManager || !this.boundingBox) return;

    const { clientWidth: w, clientHeight: h } = this.container;
    if (!w || !h) return;

    group.updateWorldMatrix(true, true);
    this.boundingVolume.setFromObject(group, true);

    this.updateBoundsRectangle(this.boundingVolume);
  }

  private updateBoundsRectangle(box: THREE.Box3): void {
    if (!this.sceneManager || !this.boundingBox) return;

    const { clientWidth: w, clientHeight: h } = this.container;
    if (!w || !h) return;

    const camera = this.sceneManager.camera;

    const scaledCenter = new THREE.Vector3();
    box.getCenter(scaledCenter);
    const screenBounds = this.computeProjectedBounds(camera, w, h, box);
    if (!screenBounds) return;

    const centerNdc = scaledCenter.clone().project(camera);
    const pts = [
      this.screenPointToWorld(
        screenBounds.minX,
        screenBounds.maxY,
        centerNdc.z,
        w,
        h,
        camera,
      ),
      this.screenPointToWorld(
        screenBounds.maxX,
        screenBounds.maxY,
        centerNdc.z,
        w,
        h,
        camera,
      ),
      this.screenPointToWorld(
        screenBounds.maxX,
        screenBounds.minY,
        centerNdc.z,
        w,
        h,
        camera,
      ),
      this.screenPointToWorld(
        screenBounds.minX,
        screenBounds.minY,
        centerNdc.z,
        w,
        h,
        camera,
      ),
      this.screenPointToWorld(
        screenBounds.minX,
        screenBounds.maxY,
        centerNdc.z,
        w,
        h,
        camera,
      ),
    ];

    (this.boundingBox.geometry as THREE.BufferGeometry).setFromPoints(pts);
    this.boundingBox.position.set(0, 0, 0);
    this.boundingBox.quaternion.identity();
  }

  private computeProjectedBounds(
    camera: THREE.PerspectiveCamera,
    width: number,
    height: number,
    box?: THREE.Box3,
  ): { minX: number; maxX: number; minY: number; maxY: number } | null {
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;

    if (box) {
      const corners = [
        new THREE.Vector3(box.min.x, box.min.y, box.min.z),
        new THREE.Vector3(box.min.x, box.min.y, box.max.z),
        new THREE.Vector3(box.min.x, box.max.y, box.min.z),
        new THREE.Vector3(box.min.x, box.max.y, box.max.z),
        new THREE.Vector3(box.max.x, box.min.y, box.min.z),
        new THREE.Vector3(box.max.x, box.min.y, box.max.z),
        new THREE.Vector3(box.max.x, box.max.y, box.min.z),
        new THREE.Vector3(box.max.x, box.max.y, box.max.z),
      ];

      for (const corner of corners) {
        const ndcPoint = corner.clone().project(camera);
        const sx = (ndcPoint.x * 0.5 + 0.5) * width;
        const sy = (-ndcPoint.y * 0.5 + 0.5) * height;

        if (sx < minX) minX = sx;
        if (sx > maxX) maxX = sx;
        if (sy < minY) minY = sy;
        if (sy > maxY) maxY = sy;
      }
    } else {
      const group = this.modelGroup(this.currentState);
      if (!group) return null;

      const localPoint = new THREE.Vector3();
      const worldPoint = new THREE.Vector3();
      const ndcPoint = new THREE.Vector3();

      group.updateWorldMatrix(true, true);
      group.traverse((obj) => {
        const mesh = obj as THREE.Mesh;
        if (!mesh.isMesh || !mesh.visible) return;

        const position = mesh.geometry.getAttribute("position");
        if (!position) return;

        for (let i = 0; i < position.count; i++) {
          mesh.getVertexPosition(i, localPoint);
          worldPoint.copy(localPoint);
          mesh.localToWorld(worldPoint);
          ndcPoint.copy(worldPoint).project(camera);

          const sx = (ndcPoint.x * 0.5 + 0.5) * width;
          const sy = (-ndcPoint.y * 0.5 + 0.5) * height;

          if (sx < minX) minX = sx;
          if (sx > maxX) maxX = sx;
          if (sy < minY) minY = sy;
          if (sy > maxY) maxY = sy;
        }
      });
    }

    if (!Number.isFinite(minX) || !Number.isFinite(minY)) {
      return null;
    }

    const boxWidth = maxX - minX;
    const boxHeight = maxY - minY;
    const padX = Math.max(MIN_FRAME_PADDING_PX, boxWidth * FRAME_PADDING_X);
    const padY = Math.max(MIN_FRAME_PADDING_PX, boxHeight * FRAME_PADDING_Y);

    return {
      minX: minX - padX,
      maxX: maxX + padX,
      minY: minY - padY,
      maxY: maxY + padY,
    };
  }

  private screenPointToWorld(
    x: number,
    y: number,
    ndcZ: number,
    width: number,
    height: number,
    camera: THREE.PerspectiveCamera,
  ): THREE.Vector3 {
    return new THREE.Vector3(
      (x / width) * 2 - 1,
      -(y / height) * 2 + 1,
      ndcZ,
    ).unproject(camera);
  }

  private setupDebugObjects(sceneManager: SceneManager): void {
    const crossMat = new THREE.LineBasicMaterial({
      color: "#ff3344",
      transparent: true,
      opacity: 0.7,
      depthTest: false,
    });
    const half = 0.25;
    const hGeo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(-half, 0, 0),
      new THREE.Vector3(half, 0, 0),
    ]);
    const vGeo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, -half, 0),
      new THREE.Vector3(0, half, 0),
    ]);
    this.crosshair = new THREE.Group();
    this.crosshair.add(new THREE.Line(hGeo, crossMat));
    this.crosshair.add(new THREE.Line(vGeo, crossMat));
    sceneManager.scene.add(this.crosshair);

    const bbMat = new THREE.LineBasicMaterial({
      color: "#44aaff",
      transparent: true,
      opacity: 0.5,
      depthTest: false,
    });
    const bbGeo = new THREE.BufferGeometry();
    bbGeo.setFromPoints([
      new THREE.Vector3(),
      new THREE.Vector3(),
      new THREE.Vector3(),
      new THREE.Vector3(),
      new THREE.Vector3(),
    ]);
    this.boundingBox = new THREE.Line(bbGeo, bbMat);
    sceneManager.scene.add(this.boundingBox);

    this.boundingBoxHelper = new THREE.Box3Helper(
      this.boundingVolume,
      new THREE.Color("#00ff88"),
    );
    this.boundingBoxHelper.renderOrder = 2;
    const helperMaterial = this.boundingBoxHelper
      .material as THREE.LineBasicMaterial;
    helperMaterial.depthTest = false;
    helperMaterial.transparent = true;
    helperMaterial.opacity = 0.9;
    sceneManager.scene.add(this.boundingBoxHelper);
    this.applyBoundsMode();
  }

  private emitDebugSnapshot(): void {
    if (!this.onDebugSnapshot) return;
    const group = this.modelGroup(this.currentState);
    const action = this.actions.get(this.currentState);
    const clip = action?.getClip();
    const bbox = this.boundingVolume;
    const bboxSize = new THREE.Vector3();
    const bboxCenter = new THREE.Vector3();
    bbox.getSize(bboxSize);
    bbox.getCenter(bboxCenter);

    let projectedFrame: { width: number; height: number } | null = null;
    if (this.sceneManager) {
      const { clientWidth: w, clientHeight: h } = this.container;
      if (w && h) {
        const sb = this.computeProjectedBounds(
          this.sceneManager.camera,
          w,
          h,
          bbox,
        );
        if (sb) {
          projectedFrame = {
            width: sb.maxX - sb.minX,
            height: sb.maxY - sb.minY,
          };
        }
      }
    }

    this.onDebugSnapshot({
      fps: this.currentFps,
      activeAnimation: this.currentState,
      boundsMode: this.boundsMode,
      position: group
        ? [group.position.x, group.position.y, group.position.z]
        : null,
      rotation: group
        ? [group.rotation.x, group.rotation.y, group.rotation.z]
        : null,
      scale: group ? [group.scale.x, group.scale.y, group.scale.z] : null,
      modelSize: [
        this.fitReferenceSize.x,
        this.fitReferenceSize.y,
        this.fitReferenceSize.z,
      ],
      projectedFrame,
      clipDuration: clip?.duration ?? null,
      clipFrames: clip ? Math.round(clip.duration * 30) : null,
      trackCount: clip?.tracks.length ?? null,
      fitReferenceSize: [
        this.fitReferenceSize.x,
        this.fitReferenceSize.y,
        this.fitReferenceSize.z,
      ],
      boundingBoxSize: [bboxSize.x, bboxSize.y, bboxSize.z],
      boundingBoxCenter: [bboxCenter.x, bboxCenter.y, bboxCenter.z],
      boundingBoxMin: [bbox.min.x, bbox.min.y, bbox.min.z],
      boundingBoxMax: [bbox.max.x, bbox.max.y, bbox.max.z],
    });
  }

  private showFallback(): void {
    this.sceneManager?.dispose();
    this.sceneManager = null;
    this.removeResize?.();
    this.removeResize = null;
    this.container.innerHTML = `
      <img class="placeholder-model" src="${quarianPlaceholder}" alt="Nara placeholder" />
    `;
  }

  dispose(): void {
    this.removeResize?.();
    document.removeEventListener("keydown", this.onKeyDown);
    if (this.sceneManager) {
      for (const group of this.modelGroups.values()) {
        this.sceneManager.scene.remove(group);
      }
      if (this.crosshair) {
        this.sceneManager.scene.remove(this.crosshair);
      }
      if (this.boundingBox) {
        this.sceneManager.scene.remove(this.boundingBox);
      }
      if (this.boundingBoxHelper) {
        this.sceneManager.scene.remove(this.boundingBoxHelper);
      }
      this.sceneManager.dispose();
      this.sceneManager = null;
    }
    this.mixers.clear();
    this.actions.clear();
    this.modelGroups.clear();
    this.crosshair = null;
    this.boundingBox = null;
    this.boundingBoxHelper = null;
    this.container.innerHTML = "";
  }
}
