import {
  SceneManager,
  createResizeHandler,
  getAnimationBounds,
  loadBoundsMetadata,
  loadModels,
  type AnimationBoundsData,
  type ModelBoundsMetadata,
} from "../3d";
import * as THREE from "three";
import quarianPlaceholder from "../assets/quarian.png";

const MARGIN = 0.88;
const FRAME_PADDING_X = 0.06;
const FRAME_PADDING_Y = 0.05;
const MIN_FRAME_PADDING_PX = 8;

type BoundsMode = "normal" | "heavy";
type AnimationKey = "idle";

export class ModelArea {
  private container: HTMLElement;
  private sceneManager: SceneManager | null = null;
  private mixer: THREE.AnimationMixer | null = null;
  private removeResize: (() => void) | null = null;
  private modelGroup: THREE.Group | null = null;
  private crosshair: THREE.Group | null = null;
  private boundingBox: THREE.Line | null = null;
  private boundingVolume = new THREE.Box3();
  private boundingBoxHelper: THREE.Box3Helper | null = null;
  private modelSize = new THREE.Vector3();
  private fitReferenceCenter = new THREE.Vector3();
  private fitReferenceSize = new THREE.Vector3();
  private boundsMode: BoundsMode = "normal";
  private boundsMetadata: ModelBoundsMetadata | null = null;
  private activeAnimation: AnimationKey = "idle";

  constructor(container: HTMLElement) {
    this.container = container;
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
      const idleModel = models.get("idle");
      this.boundsMetadata = boundsMetadata.get("idle") ?? null;

      if (idleModel && idleModel.animations.length > 0) {
        this.setupModel(sceneManager, idleModel);
      } else {
        this.showFallback();
      }
    } catch {
      this.showFallback();
    }

    sceneManager.start((dt) => {
      this.mixer?.update(dt);
      if (this.boundsMode === "heavy") {
        this.updateDebugBounds();
      }
    });
  }

  private setupModel(
    sceneManager: SceneManager,
    model: { scene: THREE.Group; animations: THREE.AnimationClip[] },
  ): void {
    sceneManager.scene.add(model.scene);
    this.modelGroup = model.scene;

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

    const box = new THREE.Box3().setFromObject(model.scene);
    box.getSize(this.modelSize);

    this.mixer = new THREE.AnimationMixer(model.scene);
    const clip = model.animations[0];
    const action = this.mixer.clipAction(clip);
    action.play();
    this.mixer.update(0);
    model.scene.updateWorldMatrix(true, true);

    this.updateFitReference();

    this.fitModelToContainer();
  }

  private fitModelToContainer(): void {
    if (!this.modelGroup || !this.sceneManager) return;

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
    const scale = Math.min(sx, sy);

    this.modelGroup.scale.setScalar(scale);
    this.modelGroup.position
      .copy(this.fitReferenceCenter)
      .multiplyScalar(-scale);
    this.modelGroup.updateWorldMatrix(true, true);

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
    return getAnimationBounds(
      this.boundsMetadata ?? undefined,
      this.activeAnimation,
    );
  }

  private updateFitReference(): void {
    const activeBounds = this.getActiveAnimationBounds();
    if (activeBounds) {
      this.fitReferenceCenter.fromArray(activeBounds.center);
      this.fitReferenceSize.fromArray(activeBounds.size);
      return;
    }

    if (!this.modelGroup) return;

    const referenceBox = new THREE.Box3().setFromObject(this.modelGroup, true);
    referenceBox.getCenter(this.fitReferenceCenter);
    referenceBox.getSize(this.fitReferenceSize);
  }

  private updateNormalBounds(): void {
    if (!this.sceneManager || !this.boundingBox || !this.modelGroup) return;

    const activeBounds = this.getActiveAnimationBounds();

    if (activeBounds) {
      const localMin = new THREE.Vector3().fromArray(activeBounds.box.min);
      const localMax = new THREE.Vector3().fromArray(activeBounds.box.max);
      const scale = this.modelGroup.scale.x;
      const worldMin = localMin
        .multiplyScalar(scale)
        .add(this.modelGroup.position);
      const worldMax = localMax
        .multiplyScalar(scale)
        .add(this.modelGroup.position);
      this.boundingVolume.min.copy(worldMin);
      this.boundingVolume.max.copy(worldMax);
    } else {
      const scale = this.modelGroup.scale.x;
      const worldCenter = this.fitReferenceCenter
        .clone()
        .multiplyScalar(scale)
        .add(this.modelGroup.position);
      const halfSize = this.fitReferenceSize
        .clone()
        .multiplyScalar(scale * 0.5);
      this.boundingVolume.min.copy(worldCenter).sub(halfSize);
      this.boundingVolume.max.copy(worldCenter).add(halfSize);
    }

    this.updateBoundsRectangle(this.boundingVolume);
  }

  private updateDebugBounds(): void {
    if (!this.modelGroup || !this.sceneManager || !this.boundingBox) return;

    const { clientWidth: w, clientHeight: h } = this.container;
    if (!w || !h) return;

    this.modelGroup.updateWorldMatrix(true, true);
    this.boundingVolume.setFromObject(this.modelGroup, true);

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
      if (!this.modelGroup) return null;

      const localPoint = new THREE.Vector3();
      const worldPoint = new THREE.Vector3();
      const ndcPoint = new THREE.Vector3();

      this.modelGroup.updateWorldMatrix(true, true);
      this.modelGroup.traverse((obj) => {
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

  private showFallback(): void {
    this.sceneManager?.dispose();
    this.sceneManager = null;
    this.mixer = null;
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
      if (this.modelGroup) {
        this.sceneManager.scene.remove(this.modelGroup);
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
    this.mixer = null;
    this.modelGroup = null;
    this.crosshair = null;
    this.boundingBoxHelper = null;
    this.container.innerHTML = "";
  }
}
