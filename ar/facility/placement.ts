// Typed port of ar/public/room-placement.js (same rules, same tests).
// The floor is MANUALLY calibrated from a measured camera height: it is an estimate, not a
// detected plane. Units are meters; the facility's open entrance is at local +Z.

export type Vec3 = { x: number; y: number; z: number };
export type Placement = Vec3 & { yaw: number };

export const CAMERA_HEIGHT_MIN_M = 0.3;
export const CAMERA_HEIGHT_MAX_M = 2.5;
const MIN_DISTANCE_M = 0.4;
const MAX_DISTANCE_M = 8;
const MIN_DOWNWARD = -0.08; // rays flatter than this graze the floor

export function calibratedFloorY(cameraY: number, height: number): number | null {
  if (!Number.isFinite(cameraY) || !Number.isFinite(height) || height < CAMERA_HEIGHT_MIN_M || height > CAMERA_HEIGHT_MAX_M) return null;
  return cameraY - height;
}

/** Where the camera's center ray meets the calibrated floor, with the entrance facing the user. */
export function floorPlacement(origin: Vec3, direction: Vec3, floorY: number): Placement | null {
  if (![origin.x, origin.y, origin.z, direction.x, direction.y, direction.z, floorY].every(Number.isFinite)) return null;
  if (direction.y >= MIN_DOWNWARD) return null;
  const distance = (floorY - origin.y) / direction.y;
  if (distance < MIN_DISTANCE_M || distance > MAX_DISTANCE_M) return null;
  const x = origin.x + direction.x * distance;
  const z = origin.z + direction.z * distance;
  if (Math.hypot(origin.x - x, origin.z - z) < 0.25) return null;
  return { x, y: floorY, z, yaw: Math.atan2(origin.x - x, origin.z - z) };
}
