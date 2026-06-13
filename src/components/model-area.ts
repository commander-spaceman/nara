import { SceneManager, createResizeHandler, loadModels } from "../3d";
import * as THREE from "three";
import quarianPlaceholder from "../assets/quarian.png";

const MARGIN = 0.88;
const FRAME_PADDING_X = 0.06;
const FRAME_PADDING_Y = 0.05;
const MIN_FRAME_PADDING_PX = 8;

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

  constructor(container: HTMLElement) {
    this.container = container;
  }

  async mount(): Promise<void> {
    this.container.innerHTML = "";

    const sceneManager = new SceneManager();
    this.sceneManager = sceneManager;

    this.container.appendChild(sceneManager.canvas);

    this.removeResize = createResizeHandler(this.container, () => {
      this.fitModelToContainer();
    });

    try {
      const models = await loadModels();
      const idleModel = models.get("idle");

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
      this.updateDebugBounds();
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

    const box = new THREE.Box3().setFromObject(model.scene);
    box.getSize(this.modelSize);

    this.mixer = new THREE.AnimationMixer(model.scene);
    const clip = model.animations[0];
    const action = this.mixer.clipAction(clip);
    action.play();
    this.mixer.update(0);
    model.scene.updateWorldMatrix(true, true);

    this.fitModelToContainer();
  }

  private fitModelToContainer(): void {
    if (!this.modelGroup || !this.sceneManager) return;

    const { clientWidth: w, clientHeight: h } = this.container;
    if (!w || !h) return;

    const camera = this.sceneManager.camera;
    this.sceneManager.setSize(w, h);

    const currentScale = this.modelGroup.scale.x || 1;
    const rawBox = new THREE.Box3().setFromObject(this.modelGroup, true);
    const rawCenter = new THREE.Vector3();
    rawBox.getCenter(rawCenter);
    const rawSize = new THREE.Vector3();
    rawBox.getSize(rawSize);
    const localCenter = rawCenter
      .clone()
      .sub(this.modelGroup.position)
      .divideScalar(currentScale);
    const localSize = rawSize.clone().divideScalar(currentScale);

    const fovRad = camera.fov * (Math.PI / 180);
    const dist = camera.position.distanceTo(new THREE.Vector3(0, 0, 0));
    const visibleHeight = 2 * dist * Math.tan(fovRad / 2);
    const visibleWidth = visibleHeight * (w / h);

    const fitW = visibleWidth * MARGIN;
    const fitH = visibleHeight * MARGIN;

    const sx = localSize.x > 0 ? fitW / localSize.x : 1;
    const sy = localSize.y > 0 ? fitH / localSize.y : 1;
    const scale = Math.min(sx, sy);

    this.modelGroup.scale.setScalar(scale);
    this.modelGroup.position.copy(localCenter).multiplyScalar(-scale);
    this.modelGroup.updateWorldMatrix(true, true);

    const scaledBox = new THREE.Box3().setFromObject(this.modelGroup, true);
    this.boundingVolume.copy(scaledBox);
    const scaledCenter = new THREE.Vector3();
    scaledBox.getCenter(scaledCenter);

    camera.lookAt(scaledCenter);
    camera.updateMatrixWorld();
    this.crosshair?.position.copy(scaledCenter);
    this.updateDebugBounds();
  }

  private updateDebugBounds(): void {
    if (!this.modelGroup || !this.sceneManager || !this.boundingBox) return;

    const { clientWidth: w, clientHeight: h } = this.container;
    if (!w || !h) return;

    const camera = this.sceneManager.camera;
    this.modelGroup.updateWorldMatrix(true, true);
    this.boundingVolume.setFromObject(this.modelGroup, true);

    const scaledCenter = new THREE.Vector3();
    this.boundingVolume.getCenter(scaledCenter);
    const screenBounds = this.computeProjectedBounds(camera, w, h);
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
  ): { minX: number; maxX: number; minY: number; maxY: number } | null {
    if (!this.modelGroup) return null;

    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;

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
