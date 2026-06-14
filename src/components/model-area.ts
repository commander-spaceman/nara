import {
  AnimationController,
  BoundsEngine,
  SceneManager,
  createResizeHandler,
  loadBoundsMetadata,
  loadModels,
  type AnimationHint,
  type AnimationState,
} from "../3d";
import * as THREE from "three";
import quarianPlaceholder from "../assets/quarian.png";

export interface ModelDebugSnapshot {
  fps: number | null;
  activeAnimation: string;
  boundsMode: string;
  position: [number, number, number] | null;
  rotation: [number, number, number] | null;
  scale: [number, number, number] | null;
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
  private animCtrl: AnimationController | null = null;
  private boundsEng: BoundsEngine | null = null;
  private removeResize: (() => void) | null = null;

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
    this.container.classList.add("loading");
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

      const animCtrl = new AnimationController(sceneManager.scene);
      this.animCtrl = animCtrl;

      const boundsEng = new BoundsEngine(
        sceneManager.scene,
        sceneManager.camera,
        this.container,
        boundsMetadata,
      );
      this.boundsEng = boundsEng;

      const idleModel = models.get("idle");
      if (!idleModel || idleModel.animations.length === 0) {
        this.showFallback();
        return;
      }

      animCtrl.setupIdle(idleModel);
      animCtrl.setupAdditionalStates(models);
      animCtrl.startIdle();
      animCtrl.update(0);
      animCtrl.modelGroups.get("idle")!.updateWorldMatrix(true, true);

      boundsEng.updateFitReference("idle");
      this.fitModelToContainer();
      this.container.classList.remove("loading");
    } catch {
      this.showFallback();
    }

    this.lastSnapshotTime = performance.now();
    this.snapshotFrames = 0;
    sceneManager.start((dt) => {
      this.animCtrl?.update(dt);
      if (this.boundsEng?.boundsMode === "heavy" && this.animCtrl) {
        this.boundsEng.updateBounds(
          this.animCtrl.modelGroups,
          this.animCtrl.currentState,
        );
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
    if (!this.animCtrl || !this.boundsEng) return;
    if (!this.animCtrl.modelGroups.has(hint)) {
      console.warn(
        `%c[3d]%c model "${hint}" not loaded, falling back to "talking"`,
        "color: #ff9944; font-weight: bold",
        "color: #ccc",
      );
    }
    const state: AnimationState = this.animCtrl.modelGroups.has(hint)
      ? hint
      : "talking";
    this.animCtrl.transitionTo(state);
    this.boundsEng.updateFitReference(state);
    if (this.boundsEng.boundsMode === "normal") {
      this.boundsEng.updateBounds(this.animCtrl.modelGroups, state);
    }
  }

  stopSpeaking(): void {
    if (!this.animCtrl || !this.boundsEng) return;
    this.animCtrl.transitionTo("idle");
    this.boundsEng.updateFitReference("idle");
    if (this.boundsEng.boundsMode === "normal") {
      this.boundsEng.updateBounds(this.animCtrl.modelGroups, "idle");
    }
  }

  private fitModelToContainer(): void {
    if (!this.sceneManager || !this.animCtrl || !this.boundsEng) return;

    const { clientWidth: w, clientHeight: h } = this.container;
    if (!w || !h) return;

    this.sceneManager.setSize(w, h);
    this.boundsEng.fitModelToContainer(this.animCtrl.modelGroups);
    this.boundsEng.updateBounds(
      this.animCtrl.modelGroups,
      this.animCtrl.currentState,
    );
  }

  private onKeyDown = (e: KeyboardEvent): void => {
    const tag = (e.target as HTMLElement).tagName;
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
    if (e.key === "h" && e.ctrlKey === false && e.metaKey === false) {
      e.preventDefault();
      if (!this.boundsEng || !this.animCtrl) return;
      this.boundsEng.boundsMode =
        this.boundsEng.boundsMode === "normal" ? "heavy" : "normal";
      this.boundsEng.applyBoundsMode();
      console.log(
        `%c[3d]%c bounds mode: ${this.boundsEng.boundsMode}`,
        "color: #5fd0ff; font-weight: bold",
        "color: #ccc",
      );
      this.boundsEng.updateBounds(
        this.animCtrl.modelGroups,
        this.animCtrl.currentState,
      );
    }
  };

  private emitDebugSnapshot(): void {
    if (!this.onDebugSnapshot || !this.animCtrl || !this.boundsEng) return;
    const group = this.animCtrl.modelGroups.get(this.animCtrl.currentState);
    const clip = this.animCtrl.getCurrentClip();
    const bbox = this.boundsEng.boundingVolume;
    const bboxSize = new THREE.Vector3();
    const bboxCenter = new THREE.Vector3();
    bbox.getSize(bboxSize);
    bbox.getCenter(bboxCenter);

    let projectedFrame: { width: number; height: number } | null = null;
    if (this.sceneManager) {
      const { clientWidth: w, clientHeight: h } = this.container;
      if (w && h) {
        const sb = this.boundsEng.computeProjectedBounds(
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
      activeAnimation: this.animCtrl.currentState,
      boundsMode: this.boundsEng.boundsMode,
      position: group
        ? [group.position.x, group.position.y, group.position.z]
        : null,
      rotation: group
        ? [group.rotation.x, group.rotation.y, group.rotation.z]
        : null,
      scale: group ? [group.scale.x, group.scale.y, group.scale.z] : null,
      projectedFrame,
      clipDuration: clip?.duration ?? null,
      clipFrames: clip ? Math.round(clip.duration * 30) : null,
      trackCount: clip?.tracks.length ?? null,
      fitReferenceSize: [
        this.boundsEng.fitReferenceSize.x,
        this.boundsEng.fitReferenceSize.y,
        this.boundsEng.fitReferenceSize.z,
      ],
      boundingBoxSize: [bboxSize.x, bboxSize.y, bboxSize.z],
      boundingBoxCenter: [bboxCenter.x, bboxCenter.y, bboxCenter.z],
      boundingBoxMin: [bbox.min.x, bbox.min.y, bbox.min.z],
      boundingBoxMax: [bbox.max.x, bbox.max.y, bbox.max.z],
    });
  }

  private showFallback(): void {
    this.container.classList.remove("loading");
    this.boundsEng?.disposeDebugObjects();
    this.sceneManager?.dispose();
    this.sceneManager = null;
    this.animCtrl = null;
    this.boundsEng = null;
    this.removeResize?.();
    this.removeResize = null;
    document.removeEventListener("keydown", this.onKeyDown);
    this.container.innerHTML = `
      <div class="placeholder-wrapper">
        <img class="placeholder-model" src="${quarianPlaceholder}" alt="Nara placeholder" />
        <button class="placeholder-retry">Reintentar</button>
      </div>
    `;
    this.container
      .querySelector(".placeholder-retry")
      ?.addEventListener("click", () => this.mount());
  }

  dispose(): void {
    this.removeResize?.();
    document.removeEventListener("keydown", this.onKeyDown);
    if (this.sceneManager) {
      this.boundsEng?.disposeDebugObjects();
      this.animCtrl?.removeFromScene();
      this.sceneManager.dispose();
      this.sceneManager = null;
    }
    this.animCtrl?.dispose();
    this.animCtrl = null;
    this.boundsEng = null;
    this.container.innerHTML = "";
  }
}
