// Facility session: owns the WebGL view of the facility in one of two modes.
//   preview: orbit-camera 3D view, always labeled NOT AR (no camera, no tracking)
//   ar:      Niantic XR Engine (8th Wall SLAM) world tracking on the rear camera
// Port of ar/public/ar-room.js with a typed API for the React game. The XR engine binary is
// loaded unmodified from `engineUrl` and only its public XR8 APIs are used. While AR runs,
// XR8 is the ONLY camera owner; stopAR() releases the camera before anything else may use it.
// Object scanning during AR reads XR8's own camera frames (tapFrames, via the public
// CameraPixelArray module), so it never opens a second camera.
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { reportDebug } from "../debugChannel";
import { calibratedFloorY, floorPlacement, type Placement } from "./placement";
import { createFacility, FACILITY_SIZE, type Facility, type FacilityQuality, type FacilityState, type Hotspot } from "./scene";

export type FacilityStage =
  | "loading" // engine downloading (preview may already show)
  | "preview" // 3D preview, NOT AR
  | "permission" // waiting for camera / motion permission
  | "starting" // camera granted, tracking initializing
  | "limited" // tracking limited: facility hidden until it recovers
  | "calibrate" // tracking normal, floor not calibrated
  | "aim" // floor calibrated, aim at it to place
  | "placed" // facility anchored in the room
  | "stopped" // AR ended, camera released
  | "error";

export type EngineState = "loading" | "ready" | "failed" | "insecure";

export interface FacilityStatus {
  stage: FacilityStage;
  ar: boolean; // true only while world tracking runs
  engine: EngineState;
  message: string;
  canStartAr: boolean;
  canCalibrate: boolean;
  canPlace: boolean;
  canMove: boolean;
  needsReload: boolean; // the engine could not restart in this page
}

/* Minimal typed view of the public XR8 API used here. */
type PipelineModule = {
  name: string;
  onStart?: () => void;
  onUpdate?: (e: {
    processCpuResult?: { reality?: { trackingStatus?: string; trackingReason?: string } };
    processGpuResult?: { camerapixelarray?: Partial<CameraPixels> };
  }) => void;
  onException?: (error: unknown) => void;
  onCameraStatusChange?: (e: { status: string; stream?: MediaStream }) => void;
};
interface XR8Api {
  loadChunk(name: string): Promise<void>;
  addCameraPipelineModules(modules: unknown[]): void;
  addCameraPipelineModule?(module: unknown): void;
  removeCameraPipelineModule?(name: string): void;
  clearCameraPipelineModules?(): void;
  CameraPixelArray?: { pipelineModule(options: { luminance?: boolean; maxDimension?: number }): unknown };
  run(options: unknown): void;
  stop(): void;
  XrController: { configure(c: unknown): void; pipelineModule(): unknown; updateCameraProjectionMatrix(o: unknown): void };
  Threejs: { configure(c: unknown): void; pipelineModule(): unknown; xrScene(): { scene: THREE.Scene; camera: THREE.PerspectiveCamera } };
  GlTextureRenderer: { pipelineModule(): unknown };
  XrConfig: { device(): { MOBILE: unknown }; camera(): { BACK: unknown } };
}
type XRWindow = typeof window & { XR8?: XR8Api; THREE?: unknown };

/** One AR camera frame as RGBA pixels (XR8 CameraPixelArray output). */
export type CameraPixels = { rows: number; cols: number; rowBytes: number; pixels: Uint8Array };
// Frames for object scanning are scaled so the long side is this (the AI scanner uses 640 px).
export const SCAN_FRAME_MAX_DIMENSION = 640;
const PIXELS_MODULE = "camerapixelarray"; // XR8's own name for the CameraPixelArray module
const TAP_MODULE = "roomshift-scan-tap";
type PermissionAPI = { requestPermission?: () => Promise<string> };

const ENGINE_TIMEOUT_MS = 30_000;
const TRACKING_STABLE_MS = 1_500; // a short normal interval before calibration is allowed
const FRAME_STALE_MS = 500;
const WATCHDOG_RUNNING_MS = 5_000;
const WATCHDOG_STARTING_MS = 60_000;
const TAP_SLOP_PX = 10;

let engineLoading: Promise<XR8Api> | null = null;

/** Loads xr.js + its SLAM chunk once per page. */
export function loadXrEngine(engineUrl: string): Promise<XR8Api> {
  const w = window as XRWindow;
  // XR8's Threejs pipeline builds its scene from window.THREE: share our bundled instance.
  w.THREE = { ...THREE };
  engineLoading ??= new Promise<XR8Api>((resolve, reject) => {
    const timer = setTimeout(() => fail(new Error("AR engine download timed out.")), ENGINE_TIMEOUT_MS);
    const done = () => {
      clearTimeout(timer);
      window.removeEventListener("xrloaded", loaded);
    };
    const fail = (error: Error) => {
      done();
      engineLoading = null; // a later attempt may retry
      reject(error);
    };
    const loaded = () => {
      done();
      const xr = w.XR8!;
      xr.loadChunk("slam").then(() => resolve(xr), (e: unknown) => fail(e instanceof Error ? e : new Error(String(e))));
    };
    if (w.XR8) return loaded();
    window.addEventListener("xrloaded", loaded, { once: true });
    const script = document.createElement("script");
    script.src = engineUrl;
    script.async = true;
    script.dataset.preloadChunks = "slam";
    script.onerror = () => fail(new Error("AR engine files are missing from this deployment."));
    document.head.appendChild(script);
  });
  return engineLoading;
}

export class FacilitySession {
  private readonly facility: Facility;
  private readonly content = new THREE.Group();
  private readonly reticle = new THREE.Group();
  private readonly arCanvas: HTMLCanvasElement;
  private statusCbs: ((s: FacilityStatus) => void)[] = [];
  private hotspotCbs: ((h: Hotspot) => void)[] = [];
  private status: FacilityStatus = {
    stage: "loading",
    ar: false,
    engine: "loading",
    message: "Loading the facility…",
    canStartAr: false,
    canCalibrate: false,
    canPlace: false,
    canMove: false,
    needsReload: false,
  };
  private xr: XR8Api | null = null;
  private preview: { renderer: THREE.WebGLRenderer; camera: THREE.PerspectiveCamera; orbit: OrbitControls; scene: THREE.Scene } | null = null;
  private arCamera: THREE.PerspectiveCamera | null = null;
  private stream: MediaStream | null = null;
  private watchdog = 0;
  private generation = 0;
  private hasRun = false;
  private active = false; // AR requested
  private running = false; // XR8 onStart happened
  private tracking = false;
  private normalSince: number | null = null;
  private lastFrame = 0;
  private lastTick = performance.now();
  private floorY: number | null = null;
  private candidate: Placement | null = null;
  private placed = false;
  private disposed = false;
  private readonly origin = new THREE.Vector3();
  private readonly direction = new THREE.Vector3();
  private readonly raycaster = new THREE.Raycaster();
  private down: { x: number; y: number } | null = null;
  private frameTap: ((frame: CameraPixels) => void) | null = null;
  private tapAttached = false;

  private readonly container: HTMLElement;
  private readonly options: { engineUrl: string; quality?: FacilityQuality };

  constructor(container: HTMLElement, options: { engineUrl: string; quality?: FacilityQuality }) {
    this.container = container;
    this.options = options;
    this.facility = createFacility({ quality: options.quality });
    this.content.add(this.facility.root);
    this.buildReticle();
    this.arCanvas = document.createElement("canvas");
    this.arCanvas.className = "facility-ar-canvas";
    this.arCanvas.hidden = true;
    container.appendChild(this.arCanvas);
    this.arCanvas.addEventListener("webglcontextlost", this.onArContextLost);
    container.addEventListener("pointerdown", this.onPointerDown);
    container.addEventListener("pointerup", this.onPointerUp);
    window.addEventListener("resize", this.resize);
    window.visualViewport?.addEventListener("resize", this.resize);
    window.addEventListener("pagehide", this.onHide);
    document.addEventListener("visibilitychange", this.onVisibility);
    this.showPreview();
    this.loadEngine();
  }

  onStatus(cb: (s: FacilityStatus) => void) {
    this.statusCbs.push(cb);
    cb(this.status);
    return () => {
      this.statusCbs = this.statusCbs.filter((c) => c !== cb);
    };
  }
  onHotspot(cb: (h: Hotspot) => void) {
    this.hotspotCbs.push(cb);
    return () => {
      this.hotspotCbs = this.hotspotCbs.filter((c) => c !== cb);
    };
  }
  get facilityRoot() {
    return this.facility.root;
  }

  /** Server-confirmed state only. */
  apply(state: FacilityState) {
    this.facility.apply(state);
  }
  flash(part: "terminal" | "breaker") {
    this.facility.flash(part);
  }

  private set(patch: Partial<FacilityStatus>) {
    const next = { ...this.status, ...patch };
    if (JSON.stringify(next) === JSON.stringify(this.status)) return;
    this.status = next;
    this.statusCbs.forEach((cb) => cb(next));
  }

  private buildReticle() {
    const green = new THREE.LineBasicMaterial({ color: 0xb1fc85 });
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.15, 0.19, 32).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xb1fc85, side: THREE.DoubleSide }));
    const w = FACILITY_SIZE.width / 2;
    const d = FACILITY_SIZE.depth / 2;
    const outline = [[-w, -d], [w, -d], [w, d], [-w, d], [-w, -d]].map(([x, z]) => new THREE.Vector3(x, 0.02, z));
    this.reticle.add(ring, new THREE.Line(new THREE.BufferGeometry().setFromPoints(outline), green));
    // Arrow toward the entrance so players see which way the facility will face.
    const arrow = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.3, 3).rotateX(Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xb1fc85 }));
    arrow.position.set(0, 0.03, d + 0.3);
    this.reticle.add(arrow);
    this.reticle.visible = false;
    this.content.add(this.reticle);
  }

  private async loadEngine() {
    if (!window.isSecureContext) {
      this.set({ engine: "insecure", message: "AR needs HTTPS. The 3D preview still works." });
      return;
    }
    try {
      this.xr = await loadXrEngine(this.options.engineUrl);
      if (this.disposed) return;
      this.set({ engine: "ready", canStartAr: !this.active });
    } catch (error) {
      if (this.disposed) return;
      this.set({ engine: "failed", canStartAr: false, message: `AR engine unavailable: ${(error as Error).message} The 3D preview still works.` });
    }
  }

  /* ---------- preview (NOT AR) ---------- */

  showPreview() {
    if (this.active || this.disposed) return;
    this.disposePreview();
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x07141c);
    scene.add(this.content);
    const camera = new THREE.PerspectiveCamera(55, 1, 0.05, 60);
    // Through the open entrance, high enough to see every station (resize() backs off in portrait).
    camera.position.set(-1.5, 2.9, 5.2);
    try {
      const renderer = new THREE.WebGLRenderer({ antialias: this.options.quality !== "low" });
      renderer.setPixelRatio(Math.min(devicePixelRatio || 1, this.options.quality === "low" ? 1 : 1.5));
      renderer.domElement.className = "facility-preview-canvas";
      this.container.appendChild(renderer.domElement);
      const orbit = new OrbitControls(camera, renderer.domElement);
      orbit.target.set(0, 0.9, -0.3);
      orbit.enableDamping = true;
      orbit.minDistance = 1.5;
      orbit.maxDistance = 14;
      orbit.maxPolarAngle = Math.PI * 0.49;
      this.preview = { renderer, camera, orbit, scene };
      this.resetRoomTransform();
      this.facility.root.visible = true;
      this.reticle.visible = false;
      this.resize();
      renderer.setAnimationLoop(() => {
        if (!this.preview) return;
        this.tick();
        orbit.update();
        renderer.render(scene, camera);
      });
      this.set({ stage: "preview", ar: false, message: "3D PREVIEW · NOT AR. Drag to look around.", canCalibrate: false, canPlace: false, canMove: false, canStartAr: this.status.engine === "ready" });
    } catch (error) {
      this.set({ stage: "error", message: `3D view unavailable on this device (${(error as Error).message}).` });
    }
  }

  private disposePreview() {
    if (!this.preview) return;
    this.preview.renderer.setAnimationLoop(null);
    this.preview.orbit.dispose();
    this.preview.renderer.dispose();
    this.preview.renderer.forceContextLoss();
    this.preview.renderer.domElement.remove();
    this.content.removeFromParent();
    this.preview = null;
  }

  private resetRoomTransform() {
    this.facility.root.position.set(0, 0, 0);
    this.facility.root.rotation.set(0, 0, 0);
    this.facility.root.scale.setScalar(1);
  }

  /* ---------- AR ---------- */

  /**
   * Must be called synchronously from a tap: iOS only shows the motion permission prompt
   * inside a user gesture, so both requests are issued before the first await.
   */
  startAR() {
    if (this.disposed || this.active || !this.xr || this.status.engine !== "ready") return;
    if (this.status.needsReload) return;
    const attempt = ++this.generation;
    this.active = true;
    const requests = [window.DeviceMotionEvent, window.DeviceOrientationEvent]
      .map((t) => t as unknown as PermissionAPI | undefined)
      .filter((t): t is Required<PermissionAPI> => typeof t?.requestPermission === "function")
      .map((t) => t.requestPermission());
    this.set({ stage: "permission", message: "Allow camera and motion access. No microphone is used.", canStartAr: false });
    void Promise.all(requests)
      .then((results) => {
        if (!this.active || attempt !== this.generation) return;
        if (results.some((r) => r !== "granted")) throw new Error("Motion access was denied. Allow it in Settings > Safari > Motion & Orientation Access.");
        this.runXr(attempt);
      })
      .catch((error: unknown) => {
        if (this.active && attempt === this.generation) this.fail(error);
      });
  }

  private runXr(attempt: number) {
    const XR8 = this.xr!;
    this.disposePreview();
    this.resetPlacement();
    this.arCanvas.hidden = false;
    this.resize();
    try {
      if (this.hasRun) XR8.clearCameraPipelineModules?.();
      XR8.XrController.configure({ disableWorldTracking: false, scale: "absolute" });
      XR8.Threejs.configure({ renderCameraTexture: false });
      const facilityModule: PipelineModule = {
        name: "roomshift-facility",
        onStart: () => {
          if (!this.active || attempt !== this.generation || document.hidden) return void XR8.stop();
          const { scene, camera } = XR8.Threejs.xrScene();
          this.arCamera = camera;
          camera.near = 0.05;
          camera.far = 40;
          camera.position.set(0, 1.5, 0);
          camera.lookAt(0, 1.5, -1);
          XR8.XrController.updateCameraProjectionMatrix({ origin: camera.position, facing: camera.quaternion, cam: { nearClipPlane: 0.05, farClipPlane: 40 } });
          scene.add(this.content);
          scene.background = null;
          this.running = true;
          this.lastFrame = performance.now();
          this.set({ stage: "starting", ar: true, message: "Move the phone gently side to side to start tracking." });
        },
        onUpdate: (e) => this.onArFrame(e),
        onException: (error) => {
          if (this.active) this.fail(error);
        },
        onCameraStatusChange: ({ status, stream }) => {
          if (!this.active || attempt !== this.generation) return stream?.getTracks().forEach((t) => t.stop());
          reportDebug({ camera: `XR engine ${status}` });
          if (stream) {
            this.stream = stream;
            stream.getTracks().forEach((t) => t.addEventListener("ended", () => this.active && this.fail(new Error("The camera was interrupted.")), { once: true }));
          }
          if (status === "failed") this.fail(new Error("The rear camera could not start."));
        },
      };
      const tap = this.frameTap && this.canTapFrames ? this.tapModules(XR8) : [];
      XR8.addCameraPipelineModules([XR8.GlTextureRenderer.pipelineModule(), XR8.Threejs.pipelineModule(), XR8.XrController.pipelineModule(), facilityModule, ...tap]);
      this.tapAttached = tap.length > 0;
      this.hasRun = true;
      this.lastFrame = performance.now();
      this.watchdog = window.setInterval(() => {
        if (this.active && performance.now() - this.lastFrame > (this.running ? WATCHDOG_RUNNING_MS : WATCHDOG_STARTING_MS)) this.fail(new Error("Camera or tracking stopped responding."));
      }, 1000);
      XR8.run({
        canvas: this.arCanvas,
        allowedDevices: XR8.XrConfig.device().MOBILE,
        cameraConfig: { direction: XR8.XrConfig.camera().BACK },
        sessionConfiguration: { defaultEnvironment: { disabled: true } },
      });
      this.set({ stage: "starting", ar: true, message: "Starting the rear camera…" });
    } catch (error) {
      // A second XR8.run in the same page is not guaranteed; offer a reload (the seat survives it).
      this.fail(error, this.hasRun);
    }
  }

  /** True when this engine can share its camera frames with a scanner while AR runs. */
  get canTapFrames(): boolean {
    const XR8 = this.xr;
    return !!XR8?.CameraPixelArray && !!XR8.addCameraPipelineModule && !!XR8.removeCameraPipelineModule;
  }

  /**
   * Streams AR camera frames to `cb` (about the camera frame rate, long side
   * SCAN_FRAME_MAX_DIMENSION px) while AR runs; null stops it. Uses the camera XR8 already
   * owns: copying pixels costs one small GPU read per frame, so only tap while scanning.
   * Survives stopAR/startAR: an active tap is re-attached when AR starts again.
   */
  tapFrames(cb: ((frame: CameraPixels) => void) | null) {
    this.frameTap = cb;
    const XR8 = this.xr;
    // Before XR8 starts, runXr adds the tap with the other modules.
    if (!XR8 || !this.canTapFrames || !this.running) return;
    if (cb && !this.tapAttached) {
      for (const m of this.tapModules(XR8)) XR8.addCameraPipelineModule!(m);
      this.tapAttached = true;
    } else if (!cb && this.tapAttached) {
      XR8.removeCameraPipelineModule!(TAP_MODULE);
      XR8.removeCameraPipelineModule!(PIXELS_MODULE);
      this.tapAttached = false;
    }
  }

  private tapModules(XR8: XR8Api): unknown[] {
    const tap: PipelineModule = {
      name: TAP_MODULE,
      onUpdate: ({ processGpuResult }) => {
        const p = processGpuResult?.camerapixelarray;
        // The first frame after attaching has no pixels yet.
        if (!p?.pixels || !p.rows || !p.cols || !p.rowBytes || !this.running) return;
        this.frameTap?.({ rows: p.rows, cols: p.cols, rowBytes: p.rowBytes, pixels: p.pixels });
      },
    };
    return [XR8.CameraPixelArray!.pipelineModule({ luminance: false, maxDimension: SCAN_FRAME_MAX_DIMENSION }), tap];
  }

  private onArFrame({ processCpuResult }: Parameters<NonNullable<PipelineModule["onUpdate"]>>[0]) {
    if (!this.active || !this.running) return;
    const now = performance.now();
    const frameMs = now - this.lastFrame;
    this.lastFrame = now;
    this.tick();
    const reality = processCpuResult?.reality;
    reportDebug({ frameMs, tracking: `${reality?.trackingStatus ?? "?"}${reality?.trackingReason ? ` / ${reality.trackingReason}` : ""}` });
    const normal = reality?.trackingStatus === "NORMAL" && reality?.trackingReason !== "INITIALIZING";
    this.normalSince = normal ? (this.normalSince ?? now) : null;
    this.tracking = this.normalSince !== null && now - this.normalSince >= TRACKING_STABLE_MS;
    this.candidate = null;
    this.reticle.visible = false;
    if (!this.tracking) {
      this.facility.root.visible = false;
      return this.set({ stage: "limited", canCalibrate: false, canPlace: false, message: "Tracking limited. Pause, then move the phone slowly across a well-lit, textured area. The facility is hidden until tracking recovers." });
    }
    if (this.placed) {
      this.facility.root.visible = true;
      return this.set({ stage: "placed", canCalibrate: false, canPlace: false, canMove: true, message: "Facility placed. Walk slowly and watch your real surroundings: virtual walls do not protect you from real obstacles." });
    }
    if (this.floorY === null) {
      return this.set({ stage: "calibrate", canCalibrate: true, canPlace: false, message: "Hold the phone at your measured height above the floor, then tap CALIBRATE FLOOR. This sets a manual floor estimate, not a detected surface." });
    }
    this.arCamera!.getWorldPosition(this.origin);
    this.arCamera!.getWorldDirection(this.direction);
    this.candidate = floorPlacement(this.origin, this.direction, this.floorY);
    if (!this.candidate) {
      return this.set({ stage: "aim", canCalibrate: false, canPlace: false, canMove: true, message: "Tilt down toward the floor, 0.4 to 8 m away. Keep a clear 3.4 m square." });
    }
    this.reticle.position.set(this.candidate.x, this.candidate.y, this.candidate.z);
    this.reticle.rotation.set(0, this.candidate.yaw, 0);
    this.reticle.visible = true;
    this.set({ stage: "aim", canCalibrate: false, canPlace: true, canMove: true, message: "The green square previews the 3.4 m footprint. Aim at its center and tap PLACE." });
  }

  /** Sets the floor from the measured camera height in meters. Returns false if out of range. */
  calibrate(heightM: number): boolean {
    if (!this.active || !this.tracking || !this.arCamera || performance.now() - this.lastFrame > FRAME_STALE_MS) return false;
    this.arCamera.getWorldPosition(this.origin);
    const floor = calibratedFloorY(this.origin.y, heightM);
    if (floor === null) return false;
    this.floorY = floor;
    return true;
  }

  place(): boolean {
    if (!this.active || !this.tracking || !this.candidate || this.placed || performance.now() - this.lastFrame > FRAME_STALE_MS) return false;
    const c = this.candidate;
    this.facility.root.position.set(c.x, c.y, c.z);
    this.facility.root.rotation.set(0, c.yaw, 0);
    this.facility.root.scale.setScalar(1);
    this.facility.root.visible = true;
    this.placed = true;
    this.reticle.visible = false;
    return true;
  }

  /** Clears placement and floor calibration (recalibrate and place again). */
  move() {
    this.resetPlacement();
  }

  private resetPlacement() {
    this.placed = false;
    this.floorY = null;
    this.candidate = null;
    this.facility.root.visible = false;
    this.reticle.visible = false;
    this.set({ canPlace: false, canMove: false });
  }

  /** Ends AR and releases the camera. Safe to call repeatedly. */
  stopAR(message = "AR stopped. The camera is released.") {
    if (!this.active && !this.running) return;
    this.generation++;
    this.active = false;
    this.running = false;
    this.tracking = false;
    this.normalSince = null;
    clearInterval(this.watchdog);
    this.tapAttached = false; // the next run starts from a fresh module list
    try {
      this.xr?.stop();
    } catch (error) {
      console.error("XR8 stop failed", error);
    }
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    reportDebug({ camera: "released", tracking: "stopped" });
    this.content.removeFromParent();
    this.arCanvas.hidden = true;
    this.arCamera = null;
    this.resetPlacement();
    this.set({ stage: "stopped", ar: false, canCalibrate: false, canPlace: false, canMove: false, canStartAr: this.status.engine === "ready" && !this.status.needsReload, message });
    if (!this.disposed) this.showPreview();
  }

  private fail(error: unknown, needsReload = false) {
    console.error("RoomShift facility:", error);
    const text = error instanceof Error ? error.message : String(error);
    reportDebug({ error: `AR ${text}` });
    this.stopAR(`AR unavailable: ${text}`);
    this.set({ stage: "error", needsReload: needsReload || this.status.needsReload, canStartAr: this.status.engine === "ready" && !needsReload, message: `AR unavailable: ${text} Check HTTPS, Safari camera and motion permissions. The 3D preview (not AR) still works.` });
  }

  /* ---------- shared ---------- */

  private tick() {
    const now = performance.now();
    const dt = Math.min(0.1, (now - this.lastTick) / 1000);
    this.lastTick = now;
    this.facility.update(now / 1000, dt);
  }

  private resize = () => {
    const { clientWidth: w, clientHeight: h } = this.container;
    if (!w || !h) return;
    // XR8 owns the AR GL context and its projection after a canvas resize (as in ar-room.js).
    this.arCanvas.width = w;
    this.arCanvas.height = h;
    if (this.preview) {
      const { camera, orbit } = this.preview;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      // Keep the whole 3.4 m footprint in view on narrow portrait screens.
      const wanted = Math.min(13, 6.2 / Math.min(1, camera.aspect * 1.6));
      const offset = camera.position.clone().sub(orbit.target);
      if (offset.length() < wanted) camera.position.copy(orbit.target).add(offset.setLength(wanted));
      this.preview.renderer.setSize(w, h);
    }
  };

  private onPointerDown = (e: PointerEvent) => {
    this.down = { x: e.clientX, y: e.clientY };
  };
  private onPointerUp = (e: PointerEvent) => {
    const start = this.down;
    this.down = null;
    if (!start || Math.hypot(e.clientX - start.x, e.clientY - start.y) > TAP_SLOP_PX) return; // a drag, not a tap
    const camera = this.preview?.camera ?? (this.placed ? this.arCamera : null);
    if (!camera || !this.facility.root.visible) return;
    const rect = this.container.getBoundingClientRect();
    const ndc = new THREE.Vector2(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(ndc, camera);
    const hit = this.raycaster.intersectObjects(this.facility.hotspots, false)[0];
    const hotspot = hit?.object.userData.hotspot as Hotspot | undefined;
    if (hotspot) this.hotspotCbs.forEach((cb) => cb(hotspot));
  };

  /** Debug/test aid: where a hotspot currently appears on screen (client px), or null. */
  screenPointOf(match: (h: Hotspot) => boolean): { x: number; y: number } | null {
    const camera = this.preview?.camera ?? (this.placed ? this.arCamera : null);
    const target = this.facility.hotspots.find((o) => match(o.userData.hotspot as Hotspot));
    if (!camera || !target) return null;
    const p = target.getWorldPosition(new THREE.Vector3()).project(camera);
    if (p.z > 1) return null; // behind the camera
    const rect = this.container.getBoundingClientRect();
    return { x: rect.left + ((p.x + 1) / 2) * rect.width, y: rect.top + ((1 - p.y) / 2) * rect.height };
  }

  /** Debug/test aid: facility transform and visibility. */
  debugSnapshot() {
    const r = this.facility.root;
    return { visible: r.visible, position: r.position.toArray(), yaw: r.rotation.y, placed: this.placed, ar: this.status.ar };
  }

  private onHide = () => this.stopAR("AR paused while the app was in the background. Start AR again to re-place the facility.");
  private onVisibility = () => {
    if (document.hidden) this.onHide();
  };
  private onArContextLost = (e: Event) => {
    e.preventDefault();
    if (this.active) this.fail(new Error("The graphics context was lost."));
  };

  dispose() {
    if (this.disposed) return;
    this.stopAR();
    this.disposed = true;
    this.disposePreview();
    this.facility.dispose();
    this.arCanvas.removeEventListener("webglcontextlost", this.onArContextLost);
    this.arCanvas.remove();
    this.container.removeEventListener("pointerdown", this.onPointerDown);
    this.container.removeEventListener("pointerup", this.onPointerUp);
    window.removeEventListener("resize", this.resize);
    window.visualViewport?.removeEventListener("resize", this.resize);
    window.removeEventListener("pagehide", this.onHide);
    document.removeEventListener("visibilitychange", this.onVisibility);
    this.statusCbs = [];
    this.hotspotCbs = [];
  }
}
