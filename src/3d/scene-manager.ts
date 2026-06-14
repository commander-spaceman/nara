import * as THREE from "three";

export class SceneManager {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene: THREE.Scene;
  readonly camera: THREE.PerspectiveCamera;

  private animFrameId = 0;
  private clock = new THREE.Clock();
  private onFrame: ((dt: number) => void) | null = null;
  private gridTexture: THREE.CanvasTexture | null = null;
  private lastGridAspect = -1;

  constructor() {
    this.renderer = new THREE.WebGLRenderer({
      alpha: true,
      premultipliedAlpha: true,
      antialias: true,
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.2;

    this.scene = new THREE.Scene();

    this.camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
    this.camera.position.set(0, 1.4, 3.5);
    this.camera.lookAt(0, 0.9, 0);

    const ambient = new THREE.AmbientLight("#8899cc", 0.9);
    this.scene.add(ambient);

    const key = new THREE.DirectionalLight("#ffffff", 1.8);
    key.position.set(1, 2.5, 2);
    this.scene.add(key);

    const rim = new THREE.DirectionalLight("#8899dd", 0.8);
    rim.position.set(-0.8, 1.8, -1.5);
    this.scene.add(rim);

    this.gridTexture = this.createGridTexture(1, 1);
    this.scene.background = this.gridTexture;
  }

  get canvas(): HTMLCanvasElement {
    return this.renderer.domElement;
  }

  setSize(width: number, height: number): void {
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / Math.max(height, 1);
    this.camera.updateProjectionMatrix();

    const aspect = width / Math.max(height, 1);
    if (Math.abs(aspect - this.lastGridAspect) < 0.01) return;
    this.lastGridAspect = aspect;

    this.gridTexture?.dispose();
    this.gridTexture = this.createGridTexture(width, height);
    this.scene.background = this.gridTexture;
  }

  start(onFrame?: (dt: number) => void): void {
    this.onFrame = onFrame ?? null;
    this.clock.start();
    this.animFrameId = requestAnimationFrame(this.loop);
  }

  dispose(): void {
    cancelAnimationFrame(this.animFrameId);
    this.gridTexture?.dispose();
    this.gridTexture = null;
    this.renderer.dispose();
    this.scene.clear();
  }

  private loop = (): void => {
    this.animFrameId = requestAnimationFrame(this.loop);
    const dt = Math.min(this.clock.getDelta(), 0.1);
    this.onFrame?.(dt);
    this.renderer.render(this.scene, this.camera);
  };

  private createGridTexture(w: number, h: number): THREE.CanvasTexture {
    const SIZE = 512;
    const CELL = 32;
    const canvas = document.createElement("canvas");
    canvas.width = SIZE;
    canvas.height = SIZE;
    const ctx = canvas.getContext("2d")!;

    const cx = SIZE / 2;
    const cy = SIZE / 2;
    const stepX = Math.max(1, (SIZE * CELL) / Math.max(w, 1));
    const stepY = Math.max(1, (SIZE * CELL) / Math.max(h, 1));
    const startX = cx % stepX;
    const startY = cy % stepY;

    ctx.fillStyle = "#0a0a1a";
    ctx.fillRect(0, 0, SIZE, SIZE);

    ctx.strokeStyle = "#1a1a3a";
    ctx.lineWidth = 0.5;
    for (let x = startX; x <= SIZE; x += stepX) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, SIZE);
      ctx.stroke();
    }
    for (let y = startY; y <= SIZE; y += stepY) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(SIZE, y);
      ctx.stroke();
    }

    ctx.strokeStyle = "#2a2a5a";
    ctx.lineWidth = 1;
    for (let x = startX; x <= SIZE; x += stepX * 4) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, SIZE);
      ctx.stroke();
    }
    for (let y = startY; y <= SIZE; y += stepY * 4) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(SIZE, y);
      ctx.stroke();
    }

    ctx.strokeStyle = "#445588";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(cx, 0);
    ctx.lineTo(cx, SIZE);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, cy);
    ctx.lineTo(SIZE, cy);
    ctx.stroke();

    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }
}
