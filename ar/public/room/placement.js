import * as THREE from "three";

export const TRACKING_HOLD_MS = 1000;
export const PLACEMENT_HOLD_MS = 600;
export const MAX_FRAME_AGE_MS = 750;
const ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const raycaster = new THREE.Raycaster();

// In absolute-scale mode the controller estimates the ground at y=0 and reports
// the camera pose in meters. This is an inferred ground plane, not a room mesh.
export function projectedGroundPose(camera) {
  if (!Number.isFinite(camera.position.y) || camera.position.y < 0.15)
    return null;
  camera.updateMatrixWorld(true);
  raycaster.setFromCamera(new THREE.Vector2(0, -0.2), camera);
  if (raycaster.ray.direction.y >= -0.08) return null;
  const position = raycaster.ray.intersectPlane(ground, new THREE.Vector3());
  if (!position) return null;
  const distance = position.distanceTo(camera.position);
  if (distance < 0.5 || distance > 8) return null;
  // The original facility's open entrance is on local +Z: face it toward the user.
  const yaw = Math.atan2(
    camera.position.x - position.x,
    camera.position.z - position.z,
  );
  return { position, yaw };
}

export class PlacementTracker {
  constructor() {
    this.reset();
  }
  reset() {
    this.normalSince = null;
    this.lastFrame = -Infinity;
    this.anchor = null;
    this.candidateSince = null;
    this.candidate = null;
  }
  update(camera, reality, now) {
    if (now - this.lastFrame > MAX_FRAME_AGE_MS || now < this.lastFrame)
      this.reset();
    this.lastFrame = now;
    if (
      reality?.trackingStatus !== "NORMAL" ||
      reality.trackingReason === "INITIALIZING"
    ) {
      this.normalSince = null;
      this.anchor = null;
      this.candidateSince = null;
      this.candidate = null;
      return null;
    }
    this.normalSince ??= now;
    const pose = projectedGroundPose(camera);
    if (!pose) {
      this.anchor = null;
      this.candidateSince = null;
      this.candidate = null;
      return null;
    }
    const rotationDrift = this.anchor
      ? Math.abs(
          Math.atan2(
            Math.sin(pose.yaw - this.anchor.yaw),
            Math.cos(pose.yaw - this.anchor.yaw),
          ),
        )
      : Infinity;
    if (
      !this.anchor ||
      pose.position.distanceTo(this.anchor.position) > 0.12 ||
      rotationDrift > 0.12
    ) {
      this.anchor = { position: pose.position.clone(), yaw: pose.yaw };
      this.candidateSince = now;
    }
    this.candidate = {
      ...pose,
      ready:
        this.isTrackingReady(now) &&
        now - this.candidateSince >= PLACEMENT_HOLD_MS,
    };
    return this.candidate;
  }
  isTrackingReady(now) {
    return (
      this.normalSince !== null &&
      now - this.lastFrame <= MAX_FRAME_AGE_MS &&
      now - this.normalSince >= TRACKING_HOLD_MS
    );
  }
  getReadyPose(now) {
    return this.candidate?.ready && this.isTrackingReady(now)
      ? { position: this.candidate.position.clone(), yaw: this.candidate.yaw }
      : null;
  }
}
