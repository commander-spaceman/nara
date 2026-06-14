import * as THREE from "three";
import {
  getAnimationBounds,
  type ModelBoundsMetadata,
} from "./bounds-metadata";
import type { AnimationState } from "./animation-state";

export type BoundsMode = "normal" | "heavy";

const MARGIN = 0.88;
const FRAME_PADDING_X = 0.06;
const FRAME_PADDING_Y = 0.05;
const MIN_FRAME_PADDING_PX = 8;

export class BoundsEngine {
  readonly boundingVolume = new THREE.Box3();
  readonly fitReferenceCenter = new THREE.Vector3();
  readonly fitReferenceSize = new THREE.Vector3();

  fitScale = 1;
  boundsMode: BoundsMode = "normal";

  private crosshair: THREE.Group | null = null;
  private boundingBox: THREE.Line | null = null;
  private boundingBoxHelper: THREE.Box3Helper | null = null;

  private debugGeometries: THREE.BufferGeometry[] = [];
  private debugMaterials: THREE.Material[] = [];

  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private container: HTMLElement;
  private boundsMetadata: Map<string, ModelBoundsMetadata>;

  constructor(
    scene: THREE.Scene,
    camera: THREE.PerspectiveCamera,
    container: HTMLElement,
    boundsMetadata: Map<string, ModelBoundsMetadata>,
  ) {
    this.scene = scene;
    this.camera = camera;
    this.container = container;
    this.boundsMetadata = boundsMetadata;
    this.setupDebugObjects();
  }

  updateFitReference(animationName: string): void {
    const meta = this.boundsMetadata.get(animationName);
    const bounds = getAnimationBounds(meta, animationName);
    if (bounds) {
      this.fitReferenceCenter.fromArray(bounds.center);
      this.fitReferenceSize.fromArray(bounds.size);
      return;
    }

    this.fitReferenceCenter.set(0, 0, 0);
    this.fitReferenceSize.set(1, 1, 1);
  }

  fitModelToContainer(modelGroups: Map<AnimationState, THREE.Group>): void {
    const { clientWidth: w, clientHeight: h } = this.container;
    if (!w || !h) return;

    const fovRad = this.camera.fov * (Math.PI / 180);
    const dist = this.camera.position.distanceTo(new THREE.Vector3(0, 0, 0));
    const visibleHeight = 2 * dist * Math.tan(fovRad / 2);
    const visibleWidth = visibleHeight * (w / h);

    const fitW = visibleWidth * MARGIN;
    const fitH = visibleHeight * MARGIN;

    const sx = this.fitReferenceSize.x > 0 ? fitW / this.fitReferenceSize.x : 1;
    const sy = this.fitReferenceSize.y > 0 ? fitH / this.fitReferenceSize.y : 1;
    this.fitScale = Math.min(sx, sy);

    for (const [, group] of modelGroups) {
      group.scale.setScalar(this.fitScale);
      group.position
        .copy(this.fitReferenceCenter)
        .multiplyScalar(-this.fitScale);
      group.updateWorldMatrix(true, true);
    }

    const framingTarget = new THREE.Vector3(0, 0, 0);
    this.camera.lookAt(framingTarget);
    this.camera.updateMatrixWorld();
    this.crosshair?.position.copy(framingTarget);
  }

  updateBounds(
    modelGroups: Map<AnimationState, THREE.Group>,
    currentState: AnimationState,
  ): void {
    if (this.boundsMode === "heavy") {
      this.updateDebugBounds(modelGroups, currentState);
    } else {
      this.updateNormalBounds(modelGroups, currentState);
    }
  }

  computeProjectedBounds(
    camera: THREE.PerspectiveCamera,
    width: number,
    height: number,
    box: THREE.Box3,
  ): { minX: number; maxX: number; minY: number; maxY: number } | null {
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;

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
      const ndc = corner.clone().project(camera);
      const sx = (ndc.x * 0.5 + 0.5) * width;
      const sy = (-ndc.y * 0.5 + 0.5) * height;

      if (sx < minX) minX = sx;
      if (sx > maxX) maxX = sx;
      if (sy < minY) minY = sy;
      if (sy > maxY) maxY = sy;
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

  applyBoundsMode(): void {
    const debug = this.boundsMode === "heavy";
    if (this.crosshair) this.crosshair.visible = debug;
    if (this.boundingBox) this.boundingBox.visible = true;
    if (this.boundingBoxHelper) this.boundingBoxHelper.visible = debug;
  }

  removeFromScene(): void {
    if (this.crosshair) {
      this.scene.remove(this.crosshair);
      this.crosshair = null;
    }
    if (this.boundingBox) {
      this.scene.remove(this.boundingBox);
      this.boundingBox = null;
    }
    if (this.boundingBoxHelper) {
      this.scene.remove(this.boundingBoxHelper);
      this.boundingBoxHelper = null;
    }
  }

  disposeDebugObjects(): void {
    this.removeFromScene();
    for (const geo of this.debugGeometries) {
      geo.dispose();
    }
    this.debugGeometries.length = 0;
    for (const mat of this.debugMaterials) {
      mat.dispose();
    }
    this.debugMaterials.length = 0;
  }

  private updateNormalBounds(
    modelGroups: Map<AnimationState, THREE.Group>,
    currentState: AnimationState,
  ): void {
    if (!this.boundingBox) return;

    const group = modelGroups.get(currentState);
    if (!group) return;

    const meta = this.boundsMetadata.get(currentState);
    const activeBounds = getAnimationBounds(meta, currentState);

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

  private updateDebugBounds(
    modelGroups: Map<AnimationState, THREE.Group>,
    currentState: AnimationState,
  ): void {
    const group = modelGroups.get(currentState);
    if (!group || !this.boundingBox) return;

    const { clientWidth: w, clientHeight: h } = this.container;
    if (!w || !h) return;

    group.updateWorldMatrix(true, true);
    this.boundingVolume.setFromObject(group, true);

    this.updateBoundsRectangle(this.boundingVolume);
  }

  private updateBoundsRectangle(box: THREE.Box3): void {
    if (!this.boundingBox) return;

    const { clientWidth: w, clientHeight: h } = this.container;
    if (!w || !h) return;

    const camera = this.camera;

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

  private setupDebugObjects(): void {
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
    this.scene.add(this.crosshair);

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
    this.scene.add(this.boundingBox);

    this.boundingBoxHelper = new THREE.Box3Helper(
      this.boundingVolume,
      new THREE.Color("#00ff88"),
    );
    this.boundingBoxHelper.renderOrder = 2;
    const hm = this.boundingBoxHelper.material as THREE.LineBasicMaterial;
    hm.depthTest = false;
    hm.transparent = true;
    hm.opacity = 0.9;
    this.scene.add(this.boundingBoxHelper);

    this.debugGeometries.push(hGeo, vGeo, bbGeo);
    this.debugMaterials.push(crossMat, bbMat, hm);
    this.applyBoundsMode();
  }
}
