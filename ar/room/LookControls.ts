import * as THREE from "three";

// Look around with device motion (phone) or drag (desktop / fallback).
// iOS needs HTTPS and a user gesture for motion permission: call enableGyro() from a button.
const Z_AXIS = new THREE.Vector3(0, 0, 1);
const Q_FLIP = new THREE.Quaternion(-Math.sqrt(0.5), 0, 0, Math.sqrt(0.5)); // camera looks out the back of the phone
const EULER = new THREE.Euler();
const Q_SCREEN = new THREE.Quaternion();

export class LookControls {
  yaw = 0;
  pitch = 0;
  gyroActive = false;

  private alphaOffset: number | null = null;
  private lastAlpha = 0;
  private orient = { alpha: 0, beta: 0, gamma: 0 };
  private drag: { x: number; y: number } | null = null;

  constructor(private camera: THREE.PerspectiveCamera, private dom: HTMLElement) {
    this.camera.rotation.order = "YXZ";
    dom.style.touchAction = "none";
    dom.addEventListener("pointerdown", this.onDown);
    window.addEventListener("pointerup", this.onUp);
    window.addEventListener("pointermove", this.onMove);
  }

  // Remove every listener so the view can be unmounted and remounted in a single-page app.
  dispose() {
    this.dom.removeEventListener("pointerdown", this.onDown);
    window.removeEventListener("pointerup", this.onUp);
    window.removeEventListener("pointermove", this.onMove);
    window.removeEventListener("deviceorientation", this.onOrient);
    this.gyroActive = false;
  }

  private onDown = (e: PointerEvent) => {
    this.drag = { x: e.clientX, y: e.clientY };
  };

  private onUp = () => {
    this.drag = null;
  };

  private onMove = (e: PointerEvent) => {
    if (!this.drag || this.gyroActive) return;
    this.yaw += (e.clientX - this.drag.x) * 0.005;
    this.pitch = Math.max(-1.4, Math.min(1.4, this.pitch + (e.clientY - this.drag.y) * 0.005));
    this.drag = { x: e.clientX, y: e.clientY };
  };

  async enableGyro(): Promise<boolean> {
    const D = DeviceOrientationEvent as unknown as { requestPermission?: () => Promise<string> };
    try {
      if (typeof D.requestPermission === "function") {
        const result = await D.requestPermission();
        if (result !== "granted") return false;
      }
    } catch {
      return false;
    }
    window.addEventListener("deviceorientation", this.onOrient);
    return true;
  }

  // Treat the current heading as "facing the breaker wall".
  recenter() {
    this.alphaOffset = this.lastAlpha;
    this.yaw = 0;
    this.pitch = 0;
  }

  private onOrient = (e: DeviceOrientationEvent) => {
    if (e.alpha == null || e.beta == null || e.gamma == null) return; // desktop browsers fire empty events
    this.lastAlpha = e.alpha;
    if (this.alphaOffset === null) this.alphaOffset = e.alpha;
    this.orient = { alpha: e.alpha, beta: e.beta, gamma: e.gamma };
    this.gyroActive = true;
  };

  update() {
    if (!this.gyroActive) {
      this.camera.rotation.set(this.pitch, this.yaw, 0, "YXZ");
      return;
    }
    const rad = THREE.MathUtils.degToRad;
    const alpha = rad(this.orient.alpha - (this.alphaOffset ?? 0));
    const screenAngle = rad((screen.orientation && screen.orientation.angle) || 0);
    EULER.set(rad(this.orient.beta), alpha, -rad(this.orient.gamma), "YXZ");
    this.camera.quaternion.setFromEuler(EULER);
    this.camera.quaternion.multiply(Q_FLIP);
    this.camera.quaternion.multiply(Q_SCREEN.setFromAxisAngle(Z_AXIS, -screenAngle));
    const e = new THREE.Euler().setFromQuaternion(this.camera.quaternion, "YXZ");
    this.yaw = e.y;
    this.pitch = e.x;
  }
}
